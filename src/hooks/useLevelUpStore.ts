import { useCallback, useEffect, useMemo, useState } from "react";
import { db } from "../db/dexieClient";
import { seedInitialData } from "../db/seed";
import { buildStreakProtectionPlan } from "../features/aiPlanner/aiPlannerClient";
import { subscribeToNetworkStatus } from "../services/networkStatus";
import type {
  AiScheduleAdjustment,
  Checkin,
  CheckinStatus,
  Habit,
  Reward,
  RewardRedemption,
  ScheduleAdjustment,
  SyncMutation,
  Wallet,
  WalletTransaction,
} from "../types/domain";
import { addDays, isDueTodayOrEarlier, toDateKey } from "../utils/dates";
import { createId, createIdempotencyKey } from "../utils/id";
import { levelFromXp } from "../utils/leveling";

interface PlannerContext {
  stressLevel: "low" | "medium" | "high";
  travel: boolean;
  availableMinutes: number;
  note: string;
}

const now = () => new Date().toISOString();

export function useLevelUpStore() {
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [wallet, setWallet] = useState<Wallet>({
    id: "local",
    coins: 0,
    lifetimeCoins: 0,
    lifetimeXp: 0,
    level: 1,
    health: 100,
    updatedAt: now(),
  });
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([]);
  const [pendingMutations, setPendingMutations] = useState<SyncMutation[]>([]);
  const [lastPlan, setLastPlan] = useState<AiScheduleAdjustment | null>(null);

  const refresh = useCallback(async () => {
    const [habitRows, checkinRows, walletRow, rewardRows, redemptionRows, mutations, latestPlan] = await Promise.all([
      db.habits.orderBy("nextDueDate").toArray(),
      db.checkins.orderBy("createdAt").reverse().toArray(),
      db.wallet.get("local"),
      db.rewards.toArray(),
      db.redemptions.orderBy("redeemedAt").reverse().toArray(),
      db.syncMutations.toArray(),
      db.aiAdjustments.orderBy("createdAt").last(),
    ]);

    setHabits(habitRows);
    setCheckins(checkinRows);
    if (walletRow) {
      setWallet(walletRow);
    }
    setRewards(rewardRows.filter((reward) => reward.isActive));
    setRedemptions(redemptionRows);
    setPendingMutations(mutations.filter((mutation) => !mutation.processedAt));
    setLastPlan(latestPlan ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    seedInitialData()
      .then(refresh)
      .catch((error) => {
        console.error("Level Up local database startup failed", error);
        setStartupError(error instanceof Error ? error.message : String(error));
        setLoading(false);
      });
    return subscribeToNetworkStatus(setOnline);
  }, [refresh]);

  useEffect(() => {
    if (!online) {
      return;
    }

    const syncPending = async () => {
      const pending = (await db.syncMutations.toArray()).filter((mutation) => !mutation.processedAt);
      if (!pending.length) {
        return;
      }

      const processedAt = now();
      await db.transaction("rw", db.syncMutations, async () => {
        await Promise.all(pending.map((mutation) => db.syncMutations.update(mutation.id, { processedAt })));
      });
      await refresh();
    };

    syncPending();
  }, [online, refresh]);

  const todayHabits = useMemo(() => habits.filter((habit) => habit.isActive && isDueTodayOrEarlier(habit.nextDueDate)), [habits]);

  const completedToday = useMemo(() => {
    const today = toDateKey();
    return new Set(checkins.filter((checkin) => checkin.date === today).map((checkin) => checkin.habitId));
  }, [checkins]);

  const addMutation = async (entityType: string, entityId: string, operation: SyncMutation["operation"], payload: unknown) => {
    await db.syncMutations.add({
      id: createId("mutation"),
      entityType,
      entityId,
      operation,
      payload,
      mutationTimestamp: now(),
      conflictStatus: "none",
    });
  };

  const applyWalletDelta = async (
    type: WalletTransaction["type"],
    coinsDelta: number,
    xpDelta: number,
    sourceType: WalletTransaction["sourceType"],
    sourceId: string,
    idempotencyKey: string,
  ) => {
    const existing = await db.transactions.where("idempotencyKey").equals(idempotencyKey).first();
    if (existing) {
      return wallet;
    }

    const current = (await db.wallet.get("local")) ?? wallet;
    const nextLifetimeXp = Math.max(0, current.lifetimeXp + xpDelta);
    const updated: Wallet = {
      ...current,
      coins: Math.max(0, current.coins + coinsDelta),
      lifetimeCoins: coinsDelta > 0 ? current.lifetimeCoins + coinsDelta : current.lifetimeCoins,
      lifetimeXp: nextLifetimeXp,
      level: levelFromXp(nextLifetimeXp),
      health: Math.max(0, Math.min(100, current.health + (type === "reward_purchase" ? 0 : 1))),
      updatedAt: now(),
    };

    const transaction: WalletTransaction = {
      id: createId("txn"),
      type,
      coinsDelta,
      xpDelta,
      sourceType,
      sourceId,
      idempotencyKey,
      createdAt: now(),
      syncStatus: online ? "synced" : "pending",
    };

    await db.wallet.put(updated);
    await db.transactions.add(transaction);
    await addMutation("wallet_transaction", transaction.id, "create", transaction);
    return updated;
  };

  const completeHabit = useCallback(
    async (habit: Habit, status?: CheckinStatus) => {
      const date = toDateKey();
      const finalStatus = status ?? (habit.kind === "quit" ? "resisted" : "completed");
      const idempotencyKey = createIdempotencyKey(["checkin", habit.id, date, finalStatus]);
      const existing = await db.checkins.where("[habitId+date]").equals([habit.id, date]).first();
      if (existing) {
        return;
      }

      const createdAt = now();
      const checkin: Checkin = {
        id: createId("checkin"),
        habitId: habit.id,
        date,
        status: finalStatus,
        valueCompleted: finalStatus === "maintenance" ? 1 : habit.targetCount,
        coinsDelta: finalStatus === "maintenance" ? Math.max(1, Math.floor(habit.coinReward * 0.35)) : habit.coinReward,
        xpDelta: finalStatus === "maintenance" ? Math.max(3, Math.floor(habit.xpReward * 0.35)) : habit.xpReward,
        healthDelta: 1,
        createdAt,
        syncStatus: online ? "synced" : "pending",
      };

      const nextHabit: Habit = {
        ...habit,
        currentStreak: habit.currentStreak + 1,
        bestStreak: Math.max(habit.bestStreak, habit.currentStreak + 1),
        nextDueDate: habit.cadence === "weekly" ? addDays(date, 7) : habit.cadence === "monthly" ? addDays(date, 30) : addDays(date, 1),
        updatedAt: createdAt,
      };

      await db.transaction("rw", db.habits, db.checkins, db.wallet, db.transactions, db.syncMutations, async () => {
        await db.checkins.add(checkin);
        await db.habits.put(nextHabit);
        await applyWalletDelta(
          habit.kind === "quit" ? "bad_habit_resisted" : finalStatus === "maintenance" ? "maintenance_reward" : "habit_complete",
          checkin.coinsDelta,
          checkin.xpDelta,
          "habit",
          habit.id,
          idempotencyKey,
        );
        await addMutation("checkin", checkin.id, "create", checkin);
        await addMutation("habit", habit.id, "update", nextHabit);
      });

      await refresh();
    },
    [online, refresh, wallet],
  );

  const createHabit = useCallback(
    async (input: Pick<Habit, "title" | "description" | "kind" | "difficulty" | "targetCount" | "targetUnit">) => {
      const multipliers = { easy: 1, medium: 1.6, hard: 2.2, heroic: 3 };
      const createdAt = now();
      const habit: Habit = {
        id: createId("habit"),
        ...input,
        cadence: "daily",
        coinReward: Math.round(6 * multipliers[input.difficulty]),
        xpReward: Math.round(14 * multipliers[input.difficulty]),
        healthPenalty: input.kind === "quit" ? Math.round(5 * multipliers[input.difficulty]) : 3,
        color: input.kind === "quit" ? "#d95d39" : "#4fb286",
        currentStreak: 0,
        bestStreak: 0,
        nextDueDate: toDateKey(),
        isActive: true,
        createdAt,
        updatedAt: createdAt,
      };

      await db.habits.add(habit);
      await addMutation("habit", habit.id, "create", habit);
      await refresh();
    },
    [refresh],
  );

  const redeemReward = useCallback(
    async (reward: Reward) => {
      const current = (await db.wallet.get("local")) ?? wallet;
      if (current.coins < reward.costCoins) {
        return false;
      }

      const idempotencyKey = createIdempotencyKey(["reward", reward.id, now()]);
      const transactionWallet = await applyWalletDelta("reward_purchase", -reward.costCoins, 0, "reward", reward.id, idempotencyKey);
      const txn = await db.transactions.where("idempotencyKey").equals(idempotencyKey).first();
      if (!txn) {
        return false;
      }

      const redemption: RewardRedemption = {
        id: createId("redemption"),
        rewardId: reward.id,
        walletTransactionId: txn.id,
        redeemedAt: now(),
        syncStatus: online ? "synced" : "pending",
      };
      await db.redemptions.add(redemption);
      await addMutation("reward_redemption", redemption.id, "create", redemption);
      setWallet(transactionWallet);
      await refresh();
      return true;
    },
    [online, refresh, wallet],
  );

  const generateProtectionPlan = useCallback(
    async (context: PlannerContext) => {
      const outputJson = buildStreakProtectionPlan({ habits: todayHabits, ...context });
      const plan: AiScheduleAdjustment = {
        id: createId("ai"),
        habitId: "multi",
        inputContext: context,
        outputJson,
        createdAt: now(),
      };
      await db.aiAdjustments.add(plan);
      await refresh();
      return outputJson;
    },
    [refresh, todayHabits],
  );

  const acceptProtection = useCallback(
    async (adjustment: ScheduleAdjustment) => {
      const habit = await db.habits.get(adjustment.habitId);
      if (!habit) {
        return;
      }

      if (adjustment.decision === "maintenance_mode") {
        await completeHabit(habit, "maintenance");
        return;
      }

      const date = toDateKey();
      const checkin: Checkin = {
        id: createId("checkin"),
        habitId: habit.id,
        date,
        status: adjustment.decision === "rest_day" ? "rest_day" : "rollover",
        valueCompleted: 0,
        coinsDelta: adjustment.rewards.coins,
        xpDelta: adjustment.rewards.xp,
        healthDelta: adjustment.rewards.healthDelta,
        note: adjustment.reason,
        createdAt: now(),
        syncStatus: online ? "synced" : "pending",
      };

      const updatedHabit: Habit = {
        ...habit,
        nextDueDate: adjustment.decision === "rollover" && adjustment.newDate ? adjustment.newDate : addDays(date, 1),
        updatedAt: now(),
      };

      await db.transaction("rw", db.habits, db.checkins, db.wallet, db.transactions, db.syncMutations, async () => {
        await db.checkins.put(checkin);
        await db.habits.put(updatedHabit);
        if (adjustment.rewards.coins || adjustment.rewards.xp) {
          await applyWalletDelta(
            "maintenance_reward",
            adjustment.rewards.coins,
            adjustment.rewards.xp,
            "habit",
            habit.id,
            createIdempotencyKey(["protection", habit.id, date, adjustment.decision]),
          );
        }
        await addMutation("checkin", checkin.id, "create", checkin);
        await addMutation("habit", habit.id, "update", updatedHabit);
      });

      await refresh();
    },
    [completeHabit, online, refresh],
  );

  return {
    loading,
    startupError,
    online,
    habits,
    todayHabits,
    checkins,
    completedToday,
    wallet,
    rewards,
    redemptions,
    pendingMutations,
    lastPlan,
    completeHabit,
    createHabit,
    redeemReward,
    generateProtectionPlan,
    acceptProtection,
  };
}
