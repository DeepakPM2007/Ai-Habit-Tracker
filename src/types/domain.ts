export type HabitKind = "build" | "quit";
export type Difficulty = "easy" | "medium" | "hard" | "heroic";
export type Cadence = "daily" | "weekly" | "monthly";
export type CheckinStatus = "completed" | "resisted" | "rest_day" | "rollover" | "maintenance";
export type SyncStatus = "pending" | "synced" | "conflict";
export type TabKey = "today" | "habits" | "planner" | "rewards" | "profile";

export interface Goal {
  id: string;
  title: string;
  category: string;
  status: "active" | "paused" | "completed";
  createdAt: string;
  updatedAt: string;
}

export interface Habit {
  id: string;
  goalId?: string;
  title: string;
  description: string;
  kind: HabitKind;
  difficulty: Difficulty;
  cadence: Cadence;
  targetCount: number;
  targetUnit: string;
  coinReward: number;
  xpReward: number;
  healthPenalty: number;
  color: string;
  currentStreak: number;
  bestStreak: number;
  nextDueDate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Checkin {
  id: string;
  habitId: string;
  date: string;
  status: CheckinStatus;
  valueCompleted: number;
  coinsDelta: number;
  xpDelta: number;
  healthDelta: number;
  note?: string;
  createdAt: string;
  syncStatus: SyncStatus;
}

export interface Wallet {
  id: "local";
  name?: string;
  age?: number;
  coins: number;
  lifetimeCoins: number;
  lifetimeXp: number;
  level: number;
  health: number;
  updatedAt: string;
}

export interface WalletTransaction {
  id: string;
  type: "habit_complete" | "bad_habit_resisted" | "maintenance_reward" | "reward_purchase" | "manual_adjustment";
  coinsDelta: number;
  xpDelta: number;
  sourceType: "habit" | "reward" | "system";
  sourceId: string;
  idempotencyKey: string;
  createdAt: string;
  syncStatus: SyncStatus;
}

export interface Reward {
  id: string;
  title: string;
  description: string;
  costCoins: number;
  durationMinutes: number;
  category: "screen" | "food" | "rest" | "custom";
  isActive: boolean;
  createdAt: string;
}

export interface RewardRedemption {
  id: string;
  rewardId: string;
  walletTransactionId: string;
  redeemedAt: string;
  syncStatus: SyncStatus;
}

export interface SyncMutation {
  id: string;
  entityType: string;
  entityId: string;
  operation: "create" | "update" | "delete";
  payload: unknown;
  mutationTimestamp: string;
  processedAt?: string;
  conflictStatus: "none" | "resolved" | "needs_review";
}

export interface ScheduleAdjustment {
  habitId: string;
  decision: "rest_day" | "rollover" | "maintenance_mode" | "no_change";
  originalDate: string;
  newDate?: string;
  maintenanceTask?: {
    title: string;
    targetCount: number;
    targetUnit: string;
  };
  rewards: {
    coins: number;
    xp: number;
    healthDelta: number;
  };
  reason: string;
}

export interface AiScheduleAdjustment {
  id: string;
  habitId: string;
  inputContext: {
    stressLevel: "low" | "medium" | "high";
    travel: boolean;
    availableMinutes: number;
    note: string;
  };
  outputJson: ScheduleAdjustment[];
  accepted?: boolean;
  createdAt: string;
}

export interface AppMutation {
  type: "ADD_REWARD" | "UPDATE_DIFFICULTY" | "ADD_HABIT" | "ALTER_HABIT" | "DELETE_HABIT";
  payload: any;
}

export interface AiCommandMessage {
  id: string;
  role: "user" | "system";
  content: string;
  timestamp: string;
  mutations?: AppMutation[];
}
