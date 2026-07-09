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
import confetti from "canvas-confetti";
import { playAddictiveDing } from "../utils/audio";

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
  const [errorToast, setErrorToast] = useState<string | null>(null);

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
    healthDeltaAmount: number = 1
  ) => {
    const existing = await db.transactions.where("idempotencyKey").equals(idempotencyKey).first();
    if (existing) {
      return wallet;
    }

    const current = (await db.wallet.get("local")) ?? wallet;
    const nextLifetimeXp = Math.max(0, current.lifetimeXp + xpDelta);
    
    // Health penalty logic
    let newHealth = current.health + (type === "reward_purchase" ? 0 : healthDeltaAmount);
    let newLevel = levelFromXp(nextLifetimeXp);
    
    if (newHealth <= 0) {
      if (newLevel > 1) {
        newLevel -= 1; // Drop one level
      }
      newHealth = 100; // Reset health
    } else if (newHealth > 100) {
      newHealth = 100;
    }

    const updated: Wallet = {
      ...current,
      coins: Math.max(0, current.coins + coinsDelta),
      lifetimeCoins: coinsDelta > 0 ? current.lifetimeCoins + coinsDelta : current.lifetimeCoins,
      lifetimeXp: nextLifetimeXp,
      level: newLevel,
      health: newHealth,
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
        healthDelta: 1, // Will be overridden if failed
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

      // If user failed a quit habit, health penalty is negative
      let healthDeltaAmount = 1; 
      if (habit.kind === "quit" && finalStatus === "resisted") {
        healthDeltaAmount = 1; // Good
      } else if (habit.kind === "quit" && finalStatus !== "resisted") {
        healthDeltaAmount = -habit.healthPenalty;
      }

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
          healthDeltaAmount
        );
        await addMutationRecord("checkin", checkin.id, "create", checkin);
        await addMutationRecord("habit", habit.id, "update", nextHabit);
      });

      if (finalStatus === "completed" || finalStatus === "resisted") {
        playAddictiveDing();
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: habit.kind === "quit" ? ['#f87171', '#ef4444', '#fbbf24'] : ['#34d399', '#10b981', '#fbbf24']
        });
      }

      await refresh();
    },
    [online, refresh, wallet],
  );

  const setProfile = useCallback(async (name: string, age: number, initialHabits: Habit[]) => {
    const updatedWallet = { ...wallet, name, age, updatedAt: now() };
    await db.wallet.put(updatedWallet);
    for (const h of initialHabits) {
      await db.habits.add(h);
    }
    await refresh();
  }, [wallet, refresh]);

  const checkHabitConstraints = async (newHabits: Habit[], isUpdating: boolean = false) => {
    const all = await db.habits.toArray();
    const active = all.filter(h => h.isActive);
    
    // Check total count limit
    if (!isUpdating && active.length + newHabits.length > 20) {
      throw new Error("Cannot have more than 20 active habits.");
    }
    
    // Check Heroic limit
    const existingHeroic = active.filter(h => h.difficulty === "heroic").length;
    const newHeroic = newHabits.filter(h => h.difficulty === "heroic").length;
    if (existingHeroic + newHeroic > 2) {
      throw new Error("Cannot have more than 2 Heroic habits at the same time.");
    }
  };

  const createHabit = useCallback(
    async (input: Pick<Habit, "title" | "description" | "kind" | "difficulty" | "targetCount" | "targetUnit">) => {
      const multipliers = { easy: 1, medium: 1.6, hard: 2.2, heroic: 3 };
      
      // Calculate reward based on time/count. Assume minimum base of 10 if unit is "session" or low count.
      const normalizedTime = input.targetUnit.includes("min") ? input.targetCount : (input.targetCount * 10);
      
      // Quit habits are hard one-time daily resistances, give them a flat base equivalent to 60 mins (30 base)
      const baseCoin = input.kind === "quit" ? 30 : Math.max(1, Math.floor(normalizedTime / 2));
      
      const calcCoin = Math.round(baseCoin * multipliers[input.difficulty]);
      const calcXp = Math.round(baseCoin * 2.5 * multipliers[input.difficulty]);

      const createdAt = now();
      const habit: Habit = {
        id: createId("habit"),
        ...input,
        cadence: "daily",
        coinReward: calcCoin,
        xpReward: calcXp,
        healthPenalty: input.kind === "quit" ? Math.round(5 * multipliers[input.difficulty]) : 3,
        color: input.kind === "quit" ? "#d95d39" : "#4fb286",
        currentStreak: 0,
        bestStreak: 0,
        nextDueDate: toDateKey(),
        isActive: true,
        createdAt,
        updatedAt: createdAt,
      };

      try {
        await checkHabitConstraints([habit]);
        await db.habits.add(habit);
        await addMutationRecord("habit", habit.id, "create", habit);
        await refresh();
      } catch (err: any) {
        setErrorToast(err.message);
        setTimeout(() => setErrorToast(null), 3000);
      }
    },
    [refresh],
  );

  const redeemReward = useCallback(
    async (reward: Reward) => {
      const current = (await db.wallet.get("local")) ?? wallet;
      if (current.coins < reward.costCoins) {
        setErrorToast("Not enough coins!");
        setTimeout(() => setErrorToast(null), 3000);
        return false;
      }
      
      const allRedemptions = await db.redemptions.where("rewardId").equals(reward.id).toArray();
      const isHighCost = reward.costCoins >= 500;
      
      if (isHighCost) {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const recentPurchases = allRedemptions.filter(r => r.redeemedAt >= sevenDaysAgo);
        if (recentPurchases.length > 0) {
          setErrorToast(`You can only buy ${reward.title} once per week!`);
          setTimeout(() => setErrorToast(null), 3000);
          return false;
        }
      } else {
        const unusedCount = allRedemptions.filter(r => !r.isUsed).length;
        if (unusedCount >= 3) {
          setErrorToast(`You can only carry 3 ${reward.title} at a time!`);
          setTimeout(() => setErrorToast(null), 3000);
          return false;
        }
      }

      const idempotencyKey = createIdempotencyKey(["reward", reward.id, now()]);
      const transactionWallet = await applyWalletDelta("reward_purchase", -reward.costCoins, 0, "reward", reward.id, idempotencyKey, 0);
      const txn = await db.transactions.where("idempotencyKey").equals(idempotencyKey).first();
      if (!txn) {
        return false;
      }

      const redemption: RewardRedemption = {
        id: createId("redemption"),
        rewardId: reward.id,
        walletTransactionId: txn.id,
        redeemedAt: now(),
        isUsed: false,
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

  const useInventoryItem = useCallback(
    async (redemptionId: string) => {
      const redemption = await db.redemptions.get(redemptionId);
      if (!redemption || redemption.isUsed) return false;

      const reward = await db.rewards.get(redemption.rewardId);
      if (!reward) return false;

      let healthDelta = 0;
      if (reward.title.includes("Small Recovery")) healthDelta = 20;
      if (reward.title.includes("Medium Recovery")) healthDelta = 50;
      if (reward.title.includes("Large Recovery")) healthDelta = 100;

      const current = (await db.wallet.get("local")) ?? wallet;
      if (healthDelta > 0 && current.health >= 100) {
        setErrorToast("Your health is already full!");
        setTimeout(() => setErrorToast(null), 3000);
        return false;
      }

      const idempotencyKey = createIdempotencyKey(["use_item", redemptionId, now()]);
      const updatedWallet = await applyWalletDelta("maintenance_reward", 0, 0, "reward", reward.id, idempotencyKey, healthDelta);
      
      const isInstant = reward.durationMinutes === 0;
      const updatedRedemption = { 
        ...redemption, 
        isUsed: isInstant, 
        activatedAt: now(),
        usedAt: isInstant ? now() : undefined
      };
      
      await db.redemptions.put(updatedRedemption);
      await addMutationRecord("reward_redemption", redemptionId, "update", updatedRedemption);
      
      setWallet(updatedWallet);
      await refresh();
      return true;
    },
    [refresh, wallet]
  );

  const completeInventoryItem = useCallback(
    async (redemptionId: string) => {
      const redemption = await db.redemptions.get(redemptionId);
      if (!redemption) return;
      const updated = { ...redemption, isUsed: true, usedAt: now() };
      await db.redemptions.put(updated);
      await addMutationRecord("reward_redemption", redemptionId, "update", updated);
      await refresh();
    },
    [refresh]
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
    let finalReply = reply;

    if (mutations && mutations.length > 0) {
      try {
        await db.transaction("rw", db.habits, db.rewards, db.syncMutations, db.wallet, async () => {
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
            } else if (m.type === "ADD_HABIT") {
              const multipliers: Record<string, number> = { easy: 1, medium: 1.6, hard: 2.2, heroic: 3 };
              const diff = m.payload.difficulty || "medium";
              
              const tgtCount = m.payload.targetCount || 10;
              const tgtUnit = m.payload.targetUnit || "minutes";
              const isQuit = m.payload.kind === "quit";
              
              const normalizedTime = tgtUnit.includes("min") ? tgtCount : (tgtCount * 10);
              const baseCoin = isQuit ? 30 : Math.max(1, Math.floor(normalizedTime / 2));
              
              const calcCoin = Math.round(baseCoin * multipliers[diff]);
              const calcXp = Math.round(baseCoin * 2.5 * multipliers[diff]);

              const newHabit: Habit = {
                id: createId("habit"),
                title: m.payload.title,
                description: m.payload.description || "Created by AI",
                kind: m.payload.kind || "build",
                difficulty: diff,
                cadence: m.payload.cadence || "daily",
                targetCount: tgtCount,
                targetUnit: tgtUnit,
                coinReward: calcCoin,
                xpReward: calcXp,
                healthPenalty: isQuit ? Math.round(5 * multipliers[diff]) : 3,
                color: isQuit ? "#d95d39" : "#4fb286",
                currentStreak: 0,
                bestStreak: 0,
                nextDueDate: toDateKey(),
                isActive: true,
                createdAt: now(),
                updatedAt: now()
              };
              await checkHabitConstraints([newHabit]);
              await db.habits.add(newHabit);
              await addMutationRecord("habit", newHabit.id, "create", newHabit);
            } else if (m.type === "ALTER_HABIT") {
              const allHabits = await db.habits.toArray();
              const targetTitle = m.payload.targetTitle.toLowerCase();
              const habit = allHabits.find(h => h.title.toLowerCase().includes(targetTitle));
              if (habit) {
                const updated = { ...habit, ...m.payload.changes, updatedAt: now() };
                await checkHabitConstraints([updated], true);
                await db.habits.put(updated);
                await addMutationRecord("habit", habit.id, "update", updated);
              }
            } else if (m.type === "DELETE_HABIT") {
              const allHabits = await db.habits.toArray();
              const targetTitle = m.payload.targetTitle.toLowerCase();
              const habit = allHabits.find(h => h.title.toLowerCase().includes(targetTitle));
              if (habit) {
                await db.habits.delete(habit.id);
                await addMutationRecord("habit", habit.id, "delete", null);
              }
            }
          }
        });
        await refresh();
      } catch (err: any) {
        finalReply = `AI Error: ${err.message}`;
      }
    }

    const systemMsg: AiCommandMessage = {
      id: createId("msg"),
      role: "system",
      content: finalReply,
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
    errorToast,
    setProfile,
    completeHabit,
    createHabit,
    redeemReward,
    useInventoryItem,
    completeInventoryItem,
    sendAiCommand,
  };
}
