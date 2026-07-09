import { db } from "./dexieClient";
import type { Goal, Habit, Reward, Wallet } from "../types/domain";
import { addDays, toDateKey } from "../utils/dates";
import { createId } from "../utils/id";

const now = () => new Date().toISOString();

export async function seedInitialData() {
  const existingWallet = await db.wallet.get("local");
  if (existingWallet) {
    return;
  }

  const createdAt = now();
  const goals: Goal[] = [
    {
      id: createId("goal"),
      title: "Build a stronger student routine",
      category: "growth",
      status: "active",
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: createId("goal"),
      title: "Reduce low-value screen time",
      category: "focus",
      status: "active",
      createdAt,
      updatedAt: createdAt,
    },
  ];

  const today = toDateKey();
  const habits: Habit[] = [
    {
      id: createId("habit"),
      goalId: goals[0].id,
      title: "Deep study block",
      description: "Protect one focused study session before entertainment.",
      kind: "build",
      difficulty: "hard",
      cadence: "daily",
      targetCount: 45,
      targetUnit: "minutes",
      coinReward: 14,
      xpReward: 35,
      healthPenalty: 8,
      color: "#4f7cac",
      currentStreak: 4,
      bestStreak: 9,
      nextDueDate: today,
      isActive: true,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: createId("habit"),
      goalId: goals[0].id,
      title: "Read technical pages",
      description: "Read a chapter, article, or documentation section.",
      kind: "build",
      difficulty: "medium",
      cadence: "daily",
      targetCount: 10,
      targetUnit: "pages",
      coinReward: 9,
      xpReward: 20,
      healthPenalty: 4,
      color: "#4fb286",
      currentStreak: 12,
      bestStreak: 18,
      nextDueDate: today,
      isActive: true,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: createId("habit"),
      goalId: goals[1].id,
      title: "No late-night scrolling",
      description: "Resist social media after 10:30 PM.",
      kind: "quit",
      difficulty: "heroic",
      cadence: "daily",
      targetCount: 1,
      targetUnit: "night resisted",
      coinReward: 22,
      xpReward: 60,
      healthPenalty: 15,
      color: "#d95d39",
      currentStreak: 2,
      bestStreak: 7,
      nextDueDate: today,
      isActive: true,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: createId("habit"),
      title: "Weekly reset",
      description: "Plan the week, clear tasks, and choose one priority.",
      kind: "build",
      difficulty: "easy",
      cadence: "weekly",
      targetCount: 1,
      targetUnit: "session",
      coinReward: 12,
      xpReward: 25,
      healthPenalty: 0,
      color: "#7b6d8d",
      currentStreak: 1,
      bestStreak: 4,
      nextDueDate: addDays(today, 2),
      isActive: true,
      createdAt,
      updatedAt: createdAt,
    },
  ];

  const wallet: Wallet = {
    id: "local",
    coins: 42,
    lifetimeCoins: 120,
    lifetimeXp: 280,
    level: 2,
    health: 88,
    updatedAt: createdAt,
  };

  const rewards: Reward[] = [
    {
      id: createId("reward"),
      title: "Gaming time",
      description: "A guilt-free 45 minute session.",
      costCoins: 35,
      durationMinutes: 45,
      category: "screen",
      isActive: true,
      createdAt,
    },
    {
      id: createId("reward"),
      title: "Show episode",
      description: "Watch one episode without multitasking.",
      costCoins: 28,
      durationMinutes: 35,
      category: "screen",
      isActive: true,
      createdAt,
    },
    {
      id: createId("reward"),
      title: "Slow cafe break",
      description: "Take a proper reset break away from the desk.",
      costCoins: 24,
      durationMinutes: 30,
      category: "rest",
      isActive: true,
      createdAt,
    },
  ];

  await db.transaction("rw", db.goals, db.habits, db.wallet, db.rewards, async () => {
    await db.goals.bulkPut(goals);
    await db.habits.bulkPut(habits);
    await db.wallet.put(wallet);
    await db.rewards.bulkPut(rewards);
  });
}
