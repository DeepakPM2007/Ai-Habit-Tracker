import type { ScheduleAdjustment } from "../../types/domain";

const decisions = new Set(["rest_day", "rollover", "maintenance_mode", "no_change"]);

export function validateScheduleAdjustments(value: unknown): ScheduleAdjustment[] {
  if (!Array.isArray(value)) {
    throw new Error("AI schedule output must be a JSON array.");
  }

  return value.map((item) => {
    if (!item || typeof item !== "object") {
      throw new Error("Each schedule adjustment must be an object.");
    }

    const adjustment = item as Partial<ScheduleAdjustment>;
    if (!adjustment.habitId || !adjustment.decision || !decisions.has(adjustment.decision)) {
      throw new Error("Schedule adjustment is missing habitId or a valid decision.");
    }

    if (!adjustment.originalDate || !adjustment.rewards || !adjustment.reason) {
      throw new Error("Schedule adjustment must include originalDate, rewards, and reason.");
    }

    return adjustment as ScheduleAdjustment;
  });
}
