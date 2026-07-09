import { toDateKey, addDays, isDueTodayOrEarlier } from "../src/utils/dates";

console.log("Testing Date System...");

const todayStr = toDateKey();
console.log("Today:", todayStr);

const tomorrowStr = addDays(todayStr, 1);
console.log("Tomorrow:", tomorrowStr);

const yesterdayStr = addDays(todayStr, -1);
console.log("Yesterday:", yesterdayStr);

console.log("Is today due today or earlier?", isDueTodayOrEarlier(todayStr));
console.log("Is tomorrow due today or earlier?", isDueTodayOrEarlier(tomorrowStr));
console.log("Is yesterday due today or earlier?", isDueTodayOrEarlier(yesterdayStr));

const expectedTodayStr = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
if (todayStr === expectedTodayStr && tomorrowStr > todayStr && yesterdayStr < todayStr) {
  console.log("✅ Date system works properly!");
} else {
  console.log("❌ Date system failed tests!");
}
