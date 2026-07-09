import { FormEvent, useMemo, useState } from "react";
import type { Difficulty, Habit, HabitKind, Reward, ScheduleAdjustment, TabKey } from "../types/domain";
import { useLevelUpStore } from "../hooks/useLevelUpStore";
import { formatShortDate, toDateKey } from "../utils/dates";
import { levelProgress, xpForNextLevel } from "../utils/leveling";

const tabs: { key: TabKey; label: string; icon: string }[] = [
  { key: "today", label: "Today", icon: "M4 12h16M12 4v16" },
  { key: "habits", label: "Habits", icon: "M5 13l4 4L19 7" },
  { key: "planner", label: "AI Plan", icon: "M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83" },
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">{formatShortDate(toDateKey())}</span>
          <h1>Level Up</h1>
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
          <PlannerView
            habits={store.todayHabits}
            lastPlan={store.lastPlan?.outputJson ?? []}
            onGenerate={store.generateProtectionPlan}
            onAccept={store.acceptProtection}
          />
        )}
        {activeTab === "rewards" && <RewardsView rewards={store.rewards} coins={store.wallet.coins} onRedeem={store.redeemReward} />}
        {activeTab === "profile" && (
          <ProfileView
            lifetimeXp={store.wallet.lifetimeXp}
            lifetimeCoins={store.wallet.lifetimeCoins}
            health={store.wallet.health}
            redemptions={store.redemptions.length}
            pendingCount={store.pendingMutations.length}
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
    <article className={`habit-card ${completed ? "done" : ""}`} style={{ borderColor: habit.color }}>
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
        <span>{habit.xpReward} XP</span>
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
      <SectionTitle title="Habits" detail={`${habits.length} active`} />
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
        <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)}>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
          <option value="heroic">Heroic</option>
        </select>
        <button className="primary-action">Add habit</button>
      </form>
      {habits.map((habit) => (
        <HabitCard key={habit.id} habit={habit} completed={false} onComplete={() => undefined} />
      ))}
    </section>
  );
}

function PlannerView({
  habits,
  lastPlan,
  onGenerate,
  onAccept,
}: {
  habits: Habit[];
  lastPlan: ScheduleAdjustment[];
  onGenerate: (context: { stressLevel: "low" | "medium" | "high"; travel: boolean; availableMinutes: number; note: string }) => Promise<ScheduleAdjustment[]>;
  onAccept: (adjustment: ScheduleAdjustment) => Promise<void>;
}) {
  const [stressLevel, setStressLevel] = useState<"low" | "medium" | "high">("medium");
  const [travel, setTravel] = useState(false);
  const [availableMinutes, setAvailableMinutes] = useState(10);
  const [note, setNote] = useState("");

  return (
    <section className="stack">
      <SectionTitle title="Streak Protection" detail={`${habits.length} due`} />
      <div className="planner-panel">
        <div className="segmented">
          {(["low", "medium", "high"] as const).map((level) => (
            <button key={level} type="button" className={stressLevel === level ? "active" : ""} onClick={() => setStressLevel(level)}>
              {level}
            </button>
          ))}
        </div>
        <label className="toggle-row">
          <span>Travel day</span>
          <input type="checkbox" checked={travel} onChange={(event) => setTravel(event.target.checked)} />
        </label>
        <label className="range-row">
          <span>{availableMinutes} minutes available</span>
          <input type="range" min="1" max="90" value={availableMinutes} onChange={(event) => setAvailableMinutes(Number(event.target.value))} />
        </label>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Context for the planner" rows={3} />
        <button className="primary-action" onClick={() => onGenerate({ stressLevel, travel, availableMinutes, note })}>
          Generate JSON plan
        </button>
      </div>
      {lastPlan.map((adjustment) => (
        <article className="json-card" key={`${adjustment.habitId}-${adjustment.decision}`}>
          <pre>{JSON.stringify(adjustment, null, 2)}</pre>
          <button className="secondary-action" onClick={() => onAccept(adjustment)}>
            Accept option
          </button>
        </article>
      ))}
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
            <span>{reward.durationMinutes} min</span>
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
  lifetimeXp,
  lifetimeCoins,
  health,
  redemptions,
  pendingCount,
}: {
  lifetimeXp: number;
  lifetimeCoins: number;
  health: number;
  redemptions: number;
  pendingCount: number;
}) {
  const stats = useMemo(
    () => [
      ["Lifetime XP", lifetimeXp],
      ["Coins earned", lifetimeCoins],
      ["Health", `${health}%`],
      ["Rewards used", redemptions],
      ["Queued syncs", pendingCount],
    ],
    [health, lifetimeCoins, lifetimeXp, pendingCount, redemptions],
  );

  return (
    <section className="stack">
      <SectionTitle title="Profile" detail="Local-first" />
      <div className="profile-grid">
        {stats.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="architecture-note">
        <h2>Offline-first architecture</h2>
        <p>Habits, check-ins, rewards, wallet entries, and sync mutations are stored in IndexedDB. The service worker caches the app shell, and pending mutations are marked processed when the app comes back online.</p>
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
