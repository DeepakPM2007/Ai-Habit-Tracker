import { db } from "./dexieClient";
import type { Reward } from "../types/domain";
import { createId } from "../utils/id";

export async function seedInitialData() {
  const existingWallet = await db.wallet.get("local");
  if (existingWallet) {
    return;
  }

  const createdAt = new Date().toISOString();

  await db.wallet.add({
    id: "local",
    coins: 0,
    lifetimeCoins: 0,
    lifetimeXp: 0,
    level: 1,
    health: 100,
    updatedAt: createdAt,
  });

  const rewards: Reward[] = [
    {
      id: createId("reward"),
      title: "Dirty Video",
      description: "A premium private reward.",
      costCoins: 500,
      durationMinutes: 30,
      category: "screen",
      isActive: true,
      createdAt,
    },
    {
      id: createId("reward"),
      title: "Small Recovery Potion",
      description: "Restores a bit of health (+20%).",
      costCoins: 50,
      durationMinutes: 0,
      category: "rest",
      isActive: true,
      createdAt,
    },
    {
      id: createId("reward"),
      title: "Medium Recovery Potion",
      description: "Restores a decent amount of health (+50%).",
      costCoins: 150,
      durationMinutes: 0,
      category: "rest",
      isActive: true,
      createdAt,
    },
    {
      id: createId("reward"),
      title: "Large Recovery Potion",
      description: "Fully restores your health (100%).",
      costCoins: 300,
      durationMinutes: 0,
      category: "rest",
      isActive: true,
      createdAt,
    },
    {
      id: createId("reward"),
      title: "XP Boost Hour",
      description: "Double XP for the next hour (simulated).",
      costCoins: 400,
      durationMinutes: 60,
      category: "custom",
      isActive: true,
      createdAt,
    },
    {
      id: createId("reward"),
      title: "Whole Day Skip",
      description: "Skip an entire day's habits with no penalty.",
      costCoins: 1000,
      durationMinutes: 1440,
      category: "rest",
      isActive: true,
      createdAt,
    },
    {
      id: createId("reward"),
      title: "Manhwa reading",
      description: "Read your favorite manhwa chapters.",
      costCoins: 28,
      durationMinutes: 30,
      category: "screen",
      isActive: true,
      createdAt,
    }
  ];

  await db.rewards.bulkAdd(rewards);
}
