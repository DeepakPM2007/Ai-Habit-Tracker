import type { AppMutation } from "../../types/domain";

const PRAISE_PHRASES = [
  "You're going to crush it! 🔥",
  "Awesome choice, I love this for you! 💯",
  "Let's get those gains! 💪",
  "This is how you level up in real life! 🚀",
  "Brilliant! I'm adding this to your quest log right now. ✨",
  "You're an absolute legend for doing this! 👑"
];

function getRandomPraise() {
  return PRAISE_PHRASES[Math.floor(Math.random() * PRAISE_PHRASES.length)];
}

// A sophisticated local heuristic NLP engine for parsing offline commands.
class LocalNlpEngine {
  parse(command: string): { reply: string; mutations: AppMutation[] } {
    const text = command.toLowerCase();
    const mutations: AppMutation[] = [];
    let reply = "I heard you, but I couldn't quite figure out what you want me to do. Want me to add, alter, or delete a habit?";

    // 1. DELETE HABIT Intent
    if (/(delete|remove|drop|cancel|kill|del|rm)\s+/i.test(text)) {
      const match = text.match(/(?:delete|remove|drop|cancel|kill|del|rm)\s+(?:the\s+)?(?:habit\s+)?(?:called|named|for|to)?\s*["']?(.+?)["']?$/i);
      if (match && match[1]) {
        let targetTitle = match[1].trim().replace(/habit$/i, "").trim();
        mutations.push({
          type: "DELETE_HABIT",
          payload: { targetTitle }
        });
        reply = `Got it! I will delete any habit matching "${targetTitle}". Keeping the quest log clean! 🧹`;
        return { reply, mutations };
      }
    }

    // 2. ALTER HABIT Intent
    if (/(alter|change|update|modify)\s+/i.test(text)) {
      const match = text.match(/(?:alter|change|update|modify)\s+(?:the\s+)?(?:habit\s+)?(?:called|named|for|to)?\s*["']?(.+?)["']?\s+to\s+(.+)/i);
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
        reply = `Done! I've updated the habit matching "${targetTitle}". You're adapting and improving! 🌟`;
        return { reply, mutations };
      }
    }

    // 3. ADD REWARD Intent
    if (/(add|create|new|make).+reward/i.test(text)) {
      let title = "New AI Reward";
      const match = text.match(/(?:add|create|new|make)\s+(?:a\s+)?(?:reward\s+)?(?:for|called|to)?\s*["']?(.+?)["']?(?:\s+(with|that|which|and|for|timer|cost)|$)/i);
      
      if (match && match[1] && !match[1].includes("reward")) {
        title = match[1].trim().replace(/[\[\]]/g, '');
        title = title.charAt(0).toUpperCase() + title.slice(1);
      } else {
        const looseMatch = text.match(/reward\s+(?:with|for|called)?\s+(.+?)(?:\s+(with|timer|cost)|$)/i);
        if (looseMatch && looseMatch[1]) {
          title = looseMatch[1].trim();
          title = title.charAt(0).toUpperCase() + title.slice(1);
        }
      }

      let durationMinutes = 0;
      const durationMatch = text.match(/(\d+)\s*(min|minute|mins|hour|hr|h)\b/i);
      if (durationMatch) {
        durationMinutes = parseInt(durationMatch[1], 10);
        if (durationMatch[2].startsWith("h")) durationMinutes *= 60;
      }

      let costCoins = 50;
      const costMatch = text.match(/(\d+)\s*(coin|coins|c)/i);
      if (costMatch) costCoins = parseInt(costMatch[1], 10);
      else if (durationMinutes > 0) costCoins = Math.max(10, Math.floor(durationMinutes * 5));

      mutations.push({
        type: "ADD_REWARD",
        payload: {
          title,
          description: "Created dynamically by your AI Assistant.",
          costCoins,
          durationMinutes,
          category: "custom"
        }
      });
      reply = `Done! I've created a new reward: "${title}" costing ${costCoins} coins${durationMinutes > 0 ? ` with a ${durationMinutes} minute timer` : ''}! 🎁`;
      return { reply, mutations };
    }

    // 4. ADD HABIT Intent
    if (/(add|create|new|start|make).+habit/i.test(text) || /habit\s+(to|for|of)\s+/i.test(text) || /(?:add|create|new|start|make)\s+/i.test(text)) {
      const isQuit = /(quit|stop|don't|dont|avoid)\s/i.test(text);
      let diff = "medium";
      if (/(heroic|expert|insane)/.test(text)) diff = "heroic";
      else if (/(hard|difficult|tough)/.test(text)) diff = "hard";
      else if (/(easy|simple|light)/.test(text)) diff = "easy";

      // Extract a plausible title
      let title = "New AI Habit";
      // Allow capturing any text up to certain keywords or end of line
      const match = text.match(/(?:habit to|habit for|habit of|habit called|new habit|start a habit to|add a habit|add habit|create habit)\s+(.+?)(?:\s+(with|that|which|and|for|easy|medium|hard|heroic|on)|$)/i);
      
      if (match && match[1]) {
        title = match[1].trim();
        // Remove any brackets if the user left them from the template
        title = title.replace(/[\[\]]/g, '');
        title = title.charAt(0).toUpperCase() + title.slice(1);
      } else {
        // Fallback: If it couldn't match the specific phrasing, try a simpler fallback for "add [something]"
        const looseMatch = text.match(/(?:add|create|new|start|make)\s+(.+?)(?:\s+(with|that|which|and|for|easy|medium|hard|heroic|on)|$)/i);
        if (looseMatch && looseMatch[1] && !looseMatch[1].includes("habit")) {
          title = looseMatch[1].trim().replace(/[\[\]]/g, '');
          title = title.charAt(0).toUpperCase() + title.slice(1);
        }
      }

      // Extract numbers for target count
      let targetCount = 10; // Default to 10 minutes if not specified
      let targetUnit = "minutes";
      const countMatch = text.match(/(\d+)\s+(times|pages|minutes|mins|hours|km|miles|sessions|chapters)/i);
      if (countMatch) {
        targetCount = parseInt(countMatch[1], 10);
        targetUnit = countMatch[2];
        if (targetUnit === "mins") targetUnit = "minutes";
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
      reply = `I've created a new ${diff} habit for you: "${title}" for ${targetCount} ${targetUnit}! ${getRandomPraise()}`;
      return { reply, mutations };
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
