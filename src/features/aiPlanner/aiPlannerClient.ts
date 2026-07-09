import type { Habit, ScheduleAdjustment } from "../../types/domain";
import { addDays, toDateKey } from "../../utils/dates";
import { validateScheduleAdjustments } from "./scheduleAdjustmentSchema";

interface PlannerInput {
  habits: Habit[];
  stressLevel: "low" | "medium" | "high";
  travel: boolean;
  availableMinutes: number;
  note: string;
}

export function buildStreakProtectionPlan(input: PlannerInput): ScheduleAdjustment[] {
  const today = toDateKey();

  const rawJson = input.habits
    .filter((habit) => habit.nextDueDate <= today)
    .map((habit) => {
      if (input.travel || input.availableMinutes <= 5) {
        return {
          habitId: habit.id,
          decision: "maintenance_mode",
          originalDate: habit.nextDueDate,
          maintenanceTask: {
            title: habit.kind === "quit" ? `Pause and resist ${habit.title.toLowerCase()}` : `Tiny version: ${habit.title}`,
            targetCount: 1,
            targetUnit: habit.kind === "quit" ? "urge resisted" : habit.targetUnit,
          },
          rewards: {
            coins: Math.max(1, Math.floor(habit.coinReward * 0.35)),
            xp: Math.max(3, Math.floor(habit.xpReward * 0.35)),
            healthDelta: 0,
          },
          reason: "Protect the streak with a tiny version that fits the user's constrained day.",
        };
      }

      if (input.stressLevel === "high") {
        return {
          habitId: habit.id,
          decision: "rest_day",
          originalDate: habit.nextDueDate,
          rewards: {
            coins: 0,
            xp: 2,
            healthDelta: 3,
          },
          reason: "A deliberate rest day prevents burnout while preserving long-term habit identity.",
        };
      }

      return {
        habitId: habit.id,
        decision: "rollover",
        originalDate: habit.nextDueDate,
        newDate: addDays(today, 1),
        rewards: {
          coins: 0,
          xp: 0,
          healthDelta: 0,
        },
        reason: "The task is still valuable, so move it to tomorrow without breaking the streak.",
      };
    });

  return validateScheduleAdjustments(rawJson);
}
