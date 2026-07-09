import { FormEvent, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { AiCommandMessage, Difficulty, Habit, HabitKind, Reward, TabKey } from "../types/domain";
import { useLevelUpStore } from "../hooks/useLevelUpStore";
import { formatShortDate, toDateKey } from "../utils/dates";
import { levelProgress, xpForNextLevel } from "../utils/leveling";
import { createId } from "../utils/id";

const tabs: { key: TabKey; label: string; icon: string }[] = [
  { key: "today", label: "Today", icon: "M4 12h16M12 4v16" },
  { key: "habits", label: "Habits", icon: "M5 13l4 4L19 7" },
  { key: "planner", label: "AI Center", icon: "M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83" },
  { key: "rewards", label: "Rewards", icon: "M20 12v10H4V12m16 0H4m16 0H4m2-5h12v5H6z" },
  { key: "profile", label: "Profile", icon: "M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" },
];

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

export function App() {
  const store = useLevelUpStore();
  const [activeTab, setActiveTab] = useState<TabKey>("today");

  if (store.loading) {
    return (
      <main className="loading-screen">
        <img src="/icons/level-up.svg" alt="" />
        <p>Loading your quest log...</p>
      </main>
    );
  }

  if (store.startupError) {
    return (
      <main className="loading-screen">
        <img src="/icons/level-up.svg" alt="" />
        <p>Local database startup failed: {store.startupError}</p>
      </main>
    );
  }

  // Onboarding Flow
  if (!store.wallet.name) {
    return <OnboardingView onComplete={store.setProfile} />;
  }

  return (
    <div className="app-shell">
      {store.errorToast && <div className="error-toast">{store.errorToast}</div>}
      <header className="topbar">
        <div>
          <span className="eyebrow">{formatShortDate(toDateKey())}</span>
          <h1>Level Up, {store.wallet.name}</h1>
        </div>
        <div className={`sync-pill ${store.online ? "online" : "offline"}`}>
          <span />
          {store.online ? "Online" : "Offline"}
        </div>
      </header>

      <WalletHero
        level={store.wallet.level}
        coins={store.wallet.coins}
        xp={store.wallet.lifetimeXp}
        health={store.wallet.health}
        pendingCount={store.pendingMutations.length}
      />

      <main className="content">
        {activeTab === "today" && (
          <TodayView habits={store.todayHabits} completedToday={store.completedToday} onComplete={store.completeHabit} />
        )}
        {activeTab === "habits" && <HabitsView habits={store.habits} onCreateHabit={store.createHabit} />}
        {activeTab === "planner" && (
          <AiCommandView
            commandHistory={store.aiCommandHistory}
            onSendCommand={store.sendAiCommand}
          />
        )}
        {activeTab === "rewards" && <RewardsView rewards={store.rewards} coins={store.wallet.coins} onRedeem={store.redeemReward} />}
        {activeTab === "profile" && (
          <ProfileView
            wallet={store.wallet}
            redemptions={store.redemptions.length}
            pendingCount={store.pendingMutations.length}
            checkins={store.checkins}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="Primary navigation">
        {tabs.map((tab) => (
          <button key={tab.key} className={activeTab === tab.key ? "active" : ""} onClick={() => setActiveTab(tab.key)}>
            <Icon path={tab.icon} />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function OnboardingView({ onComplete }: { onComplete: (name: string, age: number, initialHabits: Habit[]) => Promise<void> }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [b1, setB1] = useState("");
  const [b2, setB2] = useState("");
  const [q1, setQ1] = useState("");

  const handleNext = () => setStep(step + 1);

  const finish = () => {
    const defaultDiff = "medium" as Difficulty;
    const habits: Habit[] = [];
    const makeHabit = (title: string, kind: HabitKind) => ({
      id: createId("habit"),
      title,
      description: "My starting habit",
      kind,
      difficulty: defaultDiff,
      cadence: "daily" as const,
      targetCount: 1,
      targetUnit: "session",
      coinReward: 10,
      xpReward: 20,
      healthPenalty: 5,
      color: kind === "quit" ? "#d95d39" : "#4fb286",
      currentStreak: 0,
      bestStreak: 0,
      nextDueDate: toDateKey(),
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    if (b1.trim()) habits.push(makeHabit(b1, "build"));
    if (b2.trim()) habits.push(makeHabit(b2, "build"));
    if (q1.trim()) habits.push(makeHabit(q1, "quit"));

    onComplete(name || "Player", parseInt(age) || 18, habits);
  };

  return (
    <div className="app-shell" style={{ justifyContent: "center", alignItems: "center", padding: "20px" }}>
      <div className="onboarding-card">
        {step === 1 && (
          <>
            <h2>Welcome to Level Up</h2>
            <p>Let's create your character profile.</p>
            <input placeholder="Your Name" value={name} onChange={e => setName(e.target.value)} />
            <input type="number" placeholder="Your Age" value={age} onChange={e => setAge(e.target.value)} />
            <button className="primary-action" onClick={handleNext} disabled={!name}>Next</button>
          </>
        )}
        {step === 2 && (
          <>
            <h2>Choose 2 Habits to Build</h2>
            <p>What are two things you want to do every day?</p>
            <input placeholder="E.g., Read 10 pages" value={b1} onChange={e => setB1(e.target.value)} />
            <input placeholder="E.g., Drink 2L of water" value={b2} onChange={e => setB2(e.target.value)} />
            <button className="primary-action" onClick={handleNext}>Next</button>
          </>
        )}
        {step === 3 && (
          <>
            <h2>Choose 1 Habit to Quit</h2>
            <p>What is one thing you want to stop doing?</p>
            <input placeholder="E.g., Doomscrolling" value={q1} onChange={e => setQ1(e.target.value)} />
            <button className="primary-action" onClick={finish}>Start My Journey</button>
          </>
        )}
      </div>
    </div>
  );
}

function WalletHero({ level, coins, xp, health, pendingCount }: { level: number; coins: number; xp: number; health: number; pendingCount: number }) {
  const progress = levelProgress(xp);

  return (
    <section className="wallet-hero">
      <div className="avatar-orbit">
        <img src="/icons/level-up.svg" alt="" />
      </div>
      <div className="wallet-copy">
        <div className="stat-row">
          <strong>Level {level}</strong>
          <span>{xpForNextLevel(level) - xp} XP to next</span>
        </div>
        <div className="progress-track" aria-label={`Level progress ${progress}%`}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="wallet-grid">
          <Metric label="Coins" value={coins} />
          <Metric label="XP" value={xp} />
          <Metric label="Health" value={health} suffix="%" />
          <Metric label="Sync" value={pendingCount} />
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, suffix = "" }: { label: string; value: number; suffix?: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>
        {value}
        {suffix}
      </strong>
    </div>
  );
}

function TodayView({
  habits,
  completedToday,
  onComplete,
}: {
  habits: Habit[];
  completedToday: Set<string>;
  onComplete: (habit: Habit) => Promise<void>;
}) {
  return (
    <section className="stack">
      <SectionTitle title="Today" detail={`${habits.length} due`} />
      {habits.length === 0 ? (
        <EmptyState title="You are clear for today" body="Open rewards, enjoy the win, or add a new habit for tomorrow." />
      ) : (
        habits.map((habit) => (
          <HabitCard key={habit.id} habit={habit} completed={completedToday.has(habit.id)} onComplete={() => onComplete(habit)} />
        ))
      )}
    </section>
  );
}

function HabitCard({ habit, completed, onComplete }: { habit: Habit; completed: boolean; onComplete: () => void }) {
  return (
    <article className={`habit-card ${completed ? "done" : ""}`} style={{ "--habit-color": habit.color } as any}>
      <div className="habit-card-top">
        <span className={`kind-pill ${habit.kind}`}>{habit.kind === "quit" ? "Quit" : "Build"}</span>
        <span>{habit.currentStreak} day streak</span>
      </div>
      <h2>{habit.title}</h2>
      <p>{habit.description}</p>
      <div className="habit-meta">
        <span>
          {habit.targetCount} {habit.targetUnit}
        </span>
        <span>{habit.difficulty.toUpperCase()}</span>
        <span>{habit.coinReward} coins</span>
      </div>
      <button className="primary-action" disabled={completed} onClick={onComplete}>
        {completed ? "Logged" : habit.kind === "quit" ? "I resisted" : "Complete"}
      </button>
    </article>
  );
}

function HabitsView({
  habits,
  onCreateHabit,
}: {
  habits: Habit[];
  onCreateHabit: (input: Pick<Habit, "title" | "description" | "kind" | "difficulty" | "targetCount" | "targetUnit">) => Promise<void>;
}) {
  const [kind, setKind] = useState<HabitKind>("build");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onCreateHabit({
      title: String(form.get("title") || "New habit"),
      description: String(form.get("description") || "A habit worth protecting."),
      kind,
      difficulty,
      targetCount: Number(form.get("targetCount") || 1),
      targetUnit: String(form.get("targetUnit") || "session"),
    });
    event.currentTarget.reset();
  }

  return (
    <section className="stack">
      <SectionTitle title="Habits" detail={`${habits.length}/20 active`} />
      <form className="create-form" onSubmit={handleSubmit}>
        <div className="segmented">
          <button type="button" className={kind === "build" ? "active" : ""} onClick={() => setKind("build")}>
            Build
          </button>
          <button type="button" className={kind === "quit" ? "active" : ""} onClick={() => setKind("quit")}>
            Quit
          </button>
        </div>
        <input name="title" placeholder="Habit title" required />
        <textarea name="description" placeholder="Why this matters" rows={3} />
        <div className="form-grid">
          <input name="targetCount" type="number" min="1" defaultValue="1" aria-label="Target count" />
          <input name="targetUnit" placeholder="minutes, pages..." defaultValue="session" />
        </div>
        <div className="difficulty-selector">
          {(["easy", "medium", "hard", "heroic"] as const).map((level) => (
            <div key={level} className={`difficulty-card ${difficulty === level ? "active" : ""}`} onClick={() => setDifficulty(level)}>
              <strong>{level.charAt(0).toUpperCase() + level.slice(1)}</strong>
              <span>{level === "easy" ? "1x Rewards" : level === "medium" ? "1.6x Rewards" : level === "hard" ? "2.2x Rewards" : "3x Rewards"}</span>
            </div>
          ))}
        </div>
        <button className="primary-action">Add habit</button>
      </form>
      {habits.map((habit) => (
        <HabitCard key={habit.id} habit={habit} completed={false} onComplete={() => undefined} />
      ))}
    </section>
  );
}

function AiCommandView({
  commandHistory,
  onSendCommand,
}: {
  commandHistory: AiCommandMessage[];
  onSendCommand: (message: string) => Promise<void>;
}) {
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) return;
    const msg = message;
    setMessage("");
    await onSendCommand(msg);
  }

  const quickActions = [
    { label: "➕ Add Habit", template: "Add a habit to ..." },
    { label: "✏️ Alter Habit", template: "Alter the habit called ... to easy" },
    { label: "🗑️ Delete Habit", template: "Delete the habit called ..." },
  ];

  return (
    <section className="stack">
      <SectionTitle title="AI Command Center" detail="Manage your app" />
      <div className="planner-panel">
        <div className="quick-actions">
          {quickActions.map(a => (
            <button key={a.label} className="quick-chip" onClick={() => setMessage(a.template)}>{a.label}</button>
          ))}
        </div>
        <div className="ai-chat-history">
          {commandHistory.length === 0 ? (
            <div className="empty-state" style={{ padding: "10px" }}>
              <p>Select a quick action above or type a command naturally.</p>
            </div>
          ) : (
            commandHistory.map((msg) => (
              <div key={msg.id} className={`ai-message ${msg.role}`}>
                {msg.content}
              </div>
            ))
          )}
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell the AI what to do..."
            required
            autoComplete="off"
          />
          <button type="submit" className="primary-action" style={{ width: "80px", minHeight: "100%" }}>Send</button>
        </form>
      </div>
    </section>
  );
}

function RewardsView({ rewards, coins, onRedeem }: { rewards: Reward[]; coins: number; onRedeem: (reward: Reward) => Promise<boolean> }) {
  return (
    <section className="stack">
      <SectionTitle title="Rewards" detail={`${coins} coins`} />
      {rewards.map((reward) => (
        <article className="reward-card" key={reward.id}>
          <div>
            <span>{reward.durationMinutes > 0 ? `${reward.durationMinutes} min` : "Instant"}</span>
            <h2>{reward.title}</h2>
            <p>{reward.description}</p>
          </div>
          <button className="coin-button" disabled={coins < reward.costCoins} onClick={() => onRedeem(reward)}>
            {reward.costCoins}
          </button>
        </article>
      ))}
    </section>
  );
}

function ProfileView({
  wallet,
  redemptions,
  pendingCount,
  checkins
}: {
  wallet: any;
  redemptions: number;
  pendingCount: number;
  checkins: any[];
}) {
  const stats = useMemo(
    () => [
      ["Age", wallet.age],
      ["Lifetime XP", wallet.lifetimeXp],
      ["Coins earned", wallet.lifetimeCoins],
      ["Health", `${wallet.health}%`],
      ["Rewards used", redemptions],
    ],
    [wallet, redemptions],
  );

  // Group checkins by date to count completions for the graph
  const chartData = useMemo(() => {
    const dataMap: Record<string, number> = {};
    checkins.forEach(c => {
      if (c.status === "completed" || c.status === "resisted") {
        dataMap[c.date] = (dataMap[c.date] || 0) + 1;
      }
    });
    // Convert to array and sort by date
    return Object.entries(dataMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14) // Show last 14 active days
      .map(([date, count]) => ({
        date: formatShortDate(date),
        completions: count
      }));
  }, [checkins]);

  return (
    <section className="stack">
      <SectionTitle title={`${wallet.name}'s Profile`} detail="Local-first" />
      <div className="profile-grid">
        {stats.map(([label, value]) => (
          <div key={label as string}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      
      {chartData.length > 0 && (
        <div className="chart-container" style={{ background: "rgba(255,255,255,0.05)", padding: "16px", borderRadius: "16px", marginTop: "16px" }}>
          <h3 style={{ marginBottom: "16px", fontSize: "14px", color: "var(--fg-muted)" }}>Recent Completions</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" fontSize={12} />
              <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#222", border: "none", borderRadius: "8px" }} />
              <Line type="monotone" dataKey="completions" stroke="#4fb286" strokeWidth={3} dot={{ r: 4, fill: "#4fb286" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="architecture-note">
        <h2>Offline-first architecture</h2>
        <p>Your AI perfectly understands intents entirely locally inside a Web Worker. No servers, no latency, no subscription fees. It's completely free forever.</p>
      </div>
    </section>
  );
}

function SectionTitle({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      <span>{detail}</span>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}
