import type { AppMutation } from "../../types/domain";

self.addEventListener("message", (event) => {
  const { command } = event.data;
  if (typeof command === "string") {
    // Scaffold basic parser for the user to extend
    const mutations: AppMutation[] = [];
    const text = command.toLowerCase();
    
    // Very naive NLP matching
    if (text.includes("make") && text.includes("heroic")) {
      mutations.push({
        type: "UPDATE_DIFFICULTY",
        payload: { target: "all", newDifficulty: "heroic" }
      });
    }
    
    if (text.includes("add") && text.includes("reward") && text.includes("donut")) {
      mutations.push({
        type: "ADD_REWARD",
        payload: {
          title: "Eat a donut",
          description: "A sweet treat from the AI.",
          costCoins: 50,
          durationMinutes: 10,
          category: "food"
        }
      });
    }

    if (mutations.length > 0) {
      self.postMessage({ reply: "I have updated the app as requested!", mutations });
    } else {
      self.postMessage({ reply: "I heard you, but I don't know how to do that yet. You can edit my logic in src/features/aiPlanner/aiWorker.ts to teach me!", mutations: [] });
    }
  }
});
