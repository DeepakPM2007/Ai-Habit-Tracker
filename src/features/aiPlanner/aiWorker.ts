import type { AppMutation } from "../../types/domain";

// A sophisticated local heuristic NLP engine for parsing offline commands.
class LocalNlpEngine {
  parse(command: string): { reply: string; mutations: AppMutation[] } {
    const text = command.toLowerCase();
    const mutations: AppMutation[] = [];
    let reply = "I heard you, but I couldn't quite figure out what you want me to do.";

    // 1. ADD HABIT Intent
    if (/(add|create|new|start|make).+habit/i.test(text) || /habit\s+(to|for|of)\s+/i.test(text)) {
      const isQuit = /(quit|stop|don't|dont|avoid)\s/i.test(text);
      let diff = "medium";
      if (/(heroic|expert|insane)/.test(text)) diff = "heroic";
      else if (/(hard|difficult|tough)/.test(text)) diff = "hard";
      else if (/(easy|simple|light)/.test(text)) diff = "easy";

      // Extract a plausible title
      let title = "New AI Habit";
      const match = text.match(/(?:habit to|habit for|habit of|habit called|new habit)\s+([a-z0-9\s]+?)(?:\s+(with|that|which|and|easy|medium|hard|heroic)|$)/i);
      if (match && match[1]) {
        title = match[1].trim();
        // Capitalize first letter
        title = title.charAt(0).toUpperCase() + title.slice(1);
      }

      // Extract numbers for target count
      let targetCount = 1;
      let targetUnit = "session";
      const countMatch = text.match(/(\d+)\s+(times|pages|minutes|hours|km|miles|sessions|chapters)/i);
      if (countMatch) {
        targetCount = parseInt(countMatch[1], 10);
        targetUnit = countMatch[2];
      }

      mutations.push({
        type: "ADD_HABIT",
        payload: {
          title,
          kind: isQuit ? "quit" : "build",
          difficulty: diff,
          targetCount,
          targetUnit,
          description: "Created dynamically by your AI Assistant."
        }
      });
      reply = `I've created a new ${diff} habit for you: "${title}"!`;
    }

    // 2. DELETE HABIT Intent
    else if (/(delete|remove|drop|cancel|kill)\s+.*habit/i.test(text)) {
      const match = text.match(/(?:delete|remove|drop|cancel|kill)\s+(?:the\s+)?(?:habit\s+)?(?:called|named|for|to)?\s*["']?([a-z0-9\s]+)["']?/i);
      if (match && match[1]) {
        let targetTitle = match[1].trim().replace(/habit$/i, "").trim();
        mutations.push({
          type: "DELETE_HABIT",
          payload: { targetTitle }
        });
        reply = `I will delete any habit matching "${targetTitle}".`;
      }
    }

    // 3. ALTER HABIT Intent
    else if (/(alter|change|update|modify)\s+.*habit/i.test(text)) {
      const match = text.match(/(?:alter|change|update|modify)\s+(?:the\s+)?(?:habit\s+)?(?:called|named|for|to)?\s*["']?([a-z0-9\s]+)["']?\s+to\s+(.+)/i);
      if (match && match[1] && match[2]) {
        let targetTitle = match[1].trim().replace(/habit$/i, "").trim();
        let changesStr = match[2];
        let changes: any = {};
        
        if (/(heroic|hard|medium|easy)/.test(changesStr)) {
          const diffMatch = changesStr.match(/(heroic|hard|medium|easy)/);
          if (diffMatch) changes.difficulty = diffMatch[1];
        }

        mutations.push({
          type: "ALTER_HABIT",
          payload: { targetTitle, changes }
        });
        reply = `I've updated the habit matching "${targetTitle}".`;
      } else {
        reply = "I see you want to alter a habit, but try formatting it like: 'alter habit [name] to [new difficulty]'.";
      }
    }

    // 4. FALLBACK: Original Rewards and App-wide Difficulty commands
    else if (text.includes("make") && text.includes("heroic")) {
      mutations.push({
        type: "UPDATE_DIFFICULTY",
        payload: { target: "all", newDifficulty: "heroic" }
      });
      reply = "All your habits have been upgraded to Heroic difficulty! Good luck.";
    } 
    
    else if (text.includes("add") && text.includes("reward") && text.includes("donut")) {
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
      reply = "Added a Donut reward. You earned it!";
    }

    return { reply, mutations };
  }
}

const nlp = new LocalNlpEngine();

self.addEventListener("message", (event) => {
  const { command } = event.data;
  if (typeof command === "string") {
    const result = nlp.parse(command);
    self.postMessage(result);
  }
});
