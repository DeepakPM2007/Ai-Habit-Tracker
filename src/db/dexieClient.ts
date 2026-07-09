import Dexie, { type Table } from "dexie";
import type {
  AiScheduleAdjustment,
  Checkin,
  Goal,
  Habit,
  Reward,
  RewardRedemption,
  SyncMutation,
  Wallet,
  WalletTransaction,
} from "../types/domain";

export class LevelUpDatabase extends Dexie {
  goals!: Table<Goal, string>;
  habits!: Table<Habit, string>;
  checkins!: Table<Checkin, string>;
  wallet!: Table<Wallet, string>;
  transactions!: Table<WalletTransaction, string>;
  rewards!: Table<Reward, string>;
  redemptions!: Table<RewardRedemption, string>;
  syncMutations!: Table<SyncMutation, string>;
  aiAdjustments!: Table<AiScheduleAdjustment, string>;

  constructor() {
    super("level-up-local");
    this.version(1).stores({
      goals: "id, status, updatedAt",
      habits: "id, kind, isActive, nextDueDate, updatedAt",
      checkins: "id, [habitId+date], date, syncStatus",
      wallet: "id",
      transactions: "id, idempotencyKey, syncStatus, createdAt",
      rewards: "id, isActive, costCoins",
      redemptions: "id, rewardId, syncStatus",
      syncMutations: "id, entityType, entityId, processedAt, mutationTimestamp",
      aiAdjustments: "id, habitId, accepted, createdAt",
    });
    this.version(2).stores({
      goals: "id, status, updatedAt",
      habits: "id, kind, isActive, nextDueDate, updatedAt",
      checkins: "id, [habitId+date], date, syncStatus, createdAt",
      wallet: "id",
      transactions: "id, idempotencyKey, syncStatus, createdAt",
      rewards: "id, isActive, costCoins",
      redemptions: "id, rewardId, syncStatus, redeemedAt",
      syncMutations: "id, entityType, entityId, processedAt, mutationTimestamp",
      aiAdjustments: "id, habitId, accepted, createdAt",
    });
  }
}

export const db = new LevelUpDatabase();
