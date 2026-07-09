import { useCallback, useEffect, useMemo, useState } from "react";
import { db } from "../db/dexieClient";
import { seedInitialData } from "../db/seed";
import { AiEngineClient } from "../features/aiPlanner/AiEngineClient";
import { subscribeToNetworkStatus } from "../services/networkStatus";
import type {
  AiCommandMessage,
  Checkin,
  CheckinStatus,
  Habit,
  Reward,
  RewardRedemption,
  SyncMutation,
  Wallet,
  WalletTransaction,
} from "../types/domain";
import { addDays, isDueTodayOrEarlier, toDateKey } from "../utils/dates";
import { createId, createIdempotencyKey } from "../utils/id";
import { levelFromXp } from "../utils/leveling";

const now = () => new Date().toISOString();

const aiClient = new AiEngineClient();

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
  const [aiCommandHistory, setAiCommandHistory] = useState<AiCommandMessage[]>([]);

  const refresh = useCallback(async () => {
    const [habitRows, checkinRows, walletRow, rewardRows, redemptionRows, mutations] = await Promise.all([
      db.habits.orderBy("nextDueDate").toArray(),
      db.checkins.orderBy("createdAt").reverse().toArray(),
      db.wallet.get("local"),
      db.rewards.toArray(),
      db.redemptions.orderBy("redeemedAt").reverse().toArray(),
      db.syncMutations.toArray(),
    ]);

    setHabits(habitRows);
    setCheckins(checkinRows);
    if (walletRow) {
      setWallet(walletRow);
    }
    setRewards(rewardRows.filter((reward) => reward.isActive));
    setRedemptions(redemptionRows);
    setPendingMutations(mutations.filter((mutation) => !mutation.processedAt));
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

  const addMutationRecord = async (entityType: string, entityId: string, operation: SyncMutation["operation"], payload: unknown) => {
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
    await addMutationRecord("wallet_transaction", transaction.id, "create", transaction);
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
        await addMutationRecord("checkin", checkin.id, "create", checkin);
        await addMutationRecord("habit", habit.id, "update", nextHabit);
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
      await addMutationRecord("habit", habit.id, "create", habit);
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
      await addMutationRecord("reward_redemption", redemption.id, "create", redemption);
      setWallet(transactionWallet);
      await refresh();
      return true;
    },
    [online, refresh, wallet],
  );

  const sendAiCommand = useCallback(async (message: string) => {
    const userMsg: AiCommandMessage = {
      id: createId("msg"),
      role: "user",
      content: message,
      timestamp: now()
    };
    setAiCommandHistory(prev => [...prev, userMsg]);

    const { reply, mutations } = await aiClient.sendCommand(message);

    if (mutations && mutations.length > 0) {
      await db.transaction("rw", db.habits, db.rewards, db.syncMutations, async () => {
        for (const m of mutations) {
          if (m.type === "UPDATE_DIFFICULTY") {
            const allHabits = await db.habits.toArray();
            for (const h of allHabits) {
              const updated = { ...h, difficulty: m.payload.newDifficulty, updatedAt: now() };
              await db.habits.put(updated);
              await addMutationRecord("habit", h.id, "update", updated);
            }
          } else if (m.type === "ADD_REWARD") {
            const newReward: Reward = {
              id: createId("reward"),
              title: m.payload.title,
              description: m.payload.description,
              costCoins: m.payload.costCoins,
              durationMinutes: m.payload.durationMinutes,
              category: m.payload.category,
              isActive: true,
              createdAt: now()
            };
            await db.rewards.add(newReward);
            await addMutationRecord("reward", newReward.id, "create", newReward);
          }
        }
      });
      await refresh();
    }

    const systemMsg: AiCommandMessage = {
      id: createId("msg"),
      role: "system",
      content: reply,
      timestamp: now(),
      mutations
    };
    setAiCommandHistory(prev => [...prev, systemMsg]);
  }, [refresh]);

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
    aiCommandHistory,
    completeHabit,
    createHabit,
    redeemReward,
    sendAiCommand,
  };
}
