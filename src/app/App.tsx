import React, { useState, useEffect, type FormEvent, useMemo } from "react";
import type { AiCommandMessage, Difficulty, Habit, HabitKind, Reward, RewardRedemption, TabKey } from "../types/domain";
import { useLevelUpStore } from "../hooks/useLevelUpStore";
import { formatShortDate, toDateKey } from "../utils/dates";
import { levelProgress, xpForNextLevel } from "../utils/leveling";
import { createId } from "../utils/id";
import { playAddictiveDing } from "../utils/audio";

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


class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: any}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ color: 'red', padding: '20px', background: 'white' }}>
          <h1>Something went wrong.</h1>
          <pre>{this.state.error?.message}</pre>
          <pre>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  return (
    <ErrorBoundary>
      <InnerApp />
    </ErrorBoundary>
  );
}

function InnerApp() {
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
        {activeTab === "rewards" && <RewardsView rewards={store.rewards} redemptions={store.redemptions} coins={store.wallet.coins} onRedeem={store.redeemReward} onUseItem={store.useInventoryItem} onCompleteItem={store.completeInventoryItem} />}
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
  
  const [b1Title, setB1Title] = useState("");
  const [b1Time, setB1Time] = useState("10");
  
  const [b2Title, setB2Title] = useState("");
  const [b2Time, setB2Time] = useState("10");

  const [q1Title, setQ1Title] = useState("");
  const [q1Time, setQ1Time] = useState("10");

  const handleNext = () => setStep(step + 1);

  const finish = () => {
    const defaultDiff = "medium" as Difficulty;
    const habits: Habit[] = [];
    
    // Quick helper to calc coins like we do in useLevelUpStore
    const calcRewards = (kind: string, timeStr: string, diff: string) => {
      const time = parseInt(timeStr, 10) || 10;
      // Quit habits are hard one-time daily resistances, give them a flat base equivalent to 60 mins
      const baseCoin = kind === "quit" ? 30 : Math.max(1, Math.floor(time / 2));
      const multipliers: Record<string, number> = { easy: 1, medium: 1.6, hard: 2.2, heroic: 3 };
      const m = multipliers[diff];
      return {
        coin: Math.round(baseCoin * m),
        xp: Math.round(baseCoin * 2.5 * m),
        hpPenalty: kind === "quit" ? Math.round(5 * m) : 3,
      };
    };

    const makeHabit = (title: string, kind: HabitKind, time: string) => {
      const r = calcRewards(kind, time, defaultDiff);
      return {
        id: createId("habit"),
        title,
        description: "My starting habit",
        kind,
        difficulty: defaultDiff,
        cadence: "daily" as const,
        targetCount: parseInt(time, 10) || 10,
        targetUnit: "minutes",
        coinReward: r.coin,
        xpReward: r.xp,
        healthPenalty: r.hpPenalty,
        color: kind === "quit" ? "#d95d39" : "#4fb286",
        currentStreak: 0,
        bestStreak: 0,
        nextDueDate: toDateKey(),
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    };

    if (b1Title.trim()) habits.push(makeHabit(b1Title, "build", b1Time));
    if (b2Title.trim()) habits.push(makeHabit(b2Title, "build", b2Time));
    if (q1Title.trim()) habits.push(makeHabit(q1Title, "quit", q1Time));

    onComplete(name || "Player", parseInt(age) || 18, habits);
  };

  return (
    <div className="app-shell" style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "20px" }}>
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: "8px", marginBottom: "8px" }}>
              <input placeholder="Habit 1 (e.g. Reading)" value={b1Title} onChange={e => setB1Title(e.target.value)} style={{ margin: 0 }} />
              <input type="number" placeholder="Mins" value={b1Time} onChange={e => setB1Time(e.target.value)} style={{ margin: 0 }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: "8px", marginBottom: "16px" }}>
              <input placeholder="Habit 2 (e.g. Workout)" value={b2Title} onChange={e => setB2Title(e.target.value)} style={{ margin: 0 }} />
              <input type="number" placeholder="Mins" value={b2Time} onChange={e => setB2Time(e.target.value)} style={{ margin: 0 }} />
            </div>
            <button className="primary-action" onClick={handleNext}>Next</button>
          </>
        )}
        {step === 3 && (
          <>
            <h2>Choose 1 Habit to Quit</h2>
            <p>What is one thing you want to stop doing?</p>
            <input placeholder="Bad Habit (e.g. Doomscrolling)" value={q1Title} onChange={e => setQ1Title(e.target.value)} style={{ marginBottom: "16px" }} />
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
  onComplete: (habit: Habit, status?: any) => Promise<void>;
}) {
  return (
    <section className="stack">
      <SectionTitle title="Today" detail={`${habits.length} due`} />
      {habits.length === 0 ? (
        <EmptyState title="You are clear for today" body="Open rewards, enjoy the win, or add a new habit for tomorrow." />
      ) : (
        habits.map((habit) => (
          <HabitCard key={habit.id} habit={habit} completed={completedToday.has(habit.id)} onComplete={(status) => onComplete(habit, status)} />
        ))
      )}
    </section>
  );
}

function HabitCard({ habit, completed, onComplete }: { habit: Habit; completed: boolean; onComplete: (status?: string) => void }) {
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
      <div style={{ display: "flex", gap: "8px" }}>
        <button className="primary-action" style={{ flex: 1 }} disabled={completed} onClick={() => onComplete()}>
          {completed ? "Logged" : habit.kind === "quit" ? "I resisted" : "Complete"}
        </button>
        {habit.kind === "quit" && !completed && (
          <button className="secondary-action" style={{ flex: 1, borderColor: "var(--danger)", color: "var(--danger)" }} onClick={() => onComplete("failed")}>
            I failed
          </button>
        )}
      </div>
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
    { label: "➕ Add", template: "Add a habit to read for 30 minutes on medium difficulty" },
    { label: "✏️ Alter", template: "Alter the habit called read to heroic" },
    { label: "🗑️ Delete", template: "Delete the habit called read" },
  ];

  return (
    <section className="stack">
      <SectionTitle title="AI Command Center" detail="Manage your app seamlessly" />
      <div className="planner-panel" style={{ padding: "12px", background: "rgba(30, 41, 59, 0.4)" }}>
        
        <div className="ai-chat-history" style={{ minHeight: "350px" }}>
          {commandHistory.length === 0 ? (
            <div className="empty-state" style={{ padding: "30px 10px", border: "none", background: "transparent" }}>
              <h3 style={{ marginBottom: "16px", color: "var(--fg)" }}>How can I help you level up?</h3>
              <p style={{ marginBottom: "20px" }}>I can manage your entire quest log. Just ask me!</p>
              
              <div style={{ display: "grid", gap: "10px", textAlign: "left" }}>
                {quickActions.map(a => (
                  <button 
                    key={a.label} 
                    onClick={() => setMessage(a.template)}
                    style={{ 
                      padding: "16px", 
                      borderRadius: "12px", 
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#fff",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      transition: "0.2s"
                    }}
                  >
                    <strong style={{ fontSize: "16px" }}>{a.label}</strong>
                    <span style={{ color: "var(--muted)", fontSize: "13px" }}>{a.template}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            commandHistory.map((msg) => (
              <div key={msg.id} className={`ai-message ${msg.role}`}>
                {msg.content}
              </div>
            ))
          )}
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell me what you want to do..."
            required
            autoComplete="off"
            style={{ borderRadius: "100px", padding: "0 24px" }}
          />
          <button type="submit" className="primary-action" style={{ width: "64px", minHeight: "48px", borderRadius: "100px" }}>Send</button>
        </form>
      </div>
    </section>
  );
}

function ConfirmModal({ isOpen, title, onConfirm, onCancel, confirmText = "Confirm" }: { isOpen: boolean; title: string; onConfirm: () => void; onCancel: () => void; confirmText?: string }) {
  if (!isOpen) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "24px" }}>
      <div style={{ background: "var(--surface)", padding: "24px", borderRadius: "var(--radius-lg)", width: "100%", maxWidth: "320px", display: "flex", flexDirection: "column", gap: "24px", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 24px 48px rgba(0,0,0,0.5)" }}>
        <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: "600", textAlign: "center" }}>{title}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <button className="secondary-action" onClick={onCancel}>Cancel</button>
          <button className="primary-action" onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

function ActiveTimer({ redemption, reward, onComplete }: { redemption: RewardRedemption; reward: Reward; onComplete: () => void }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    if (!redemption.activatedAt) return;
    const end = new Date(redemption.activatedAt).getTime() + (reward.durationMinutes * 60 * 1000);
    
    const tick = () => {
      const nowMs = Date.now();
      const diff = end - nowMs;
      if (diff <= 0) {
        onComplete();
        if (Notification.permission === "granted") {
          new Notification("Time's Up!", { body: `Your ${reward.title} has finished!` });
        }
        playAddictiveDing();
      } else {
        const m = Math.floor(diff / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${m}:${s.toString().padStart(2, "0")}`);
      }
    };
    
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [redemption, reward, onComplete]);

  return (
    <div style={{ background: "rgba(79, 178, 134, 0.1)", border: "1px solid var(--accent)", borderRadius: "var(--radius-md)", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <div style={{ fontSize: "0.85rem", color: "var(--accent)", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Active Perk</div>
        <div style={{ fontWeight: "600" }}>{reward.title}</div>
      </div>
      <div style={{ fontSize: "1.5rem", fontWeight: "bold", fontFamily: "monospace", color: "var(--accent)" }}>
        {timeLeft}
      </div>
    </div>
  );
}

function RewardsView({ rewards, redemptions, coins, onRedeem, onUseItem, onCompleteItem }: { rewards: Reward[]; redemptions: RewardRedemption[]; coins: number; onRedeem: (reward: Reward) => Promise<boolean>; onUseItem: (id: string) => Promise<boolean>; onCompleteItem: (id: string) => Promise<void> }) {
  const [confirmState, setConfirmState] = useState<{ isOpen: boolean; type: "buy" | "use" | null; reward?: Reward; item?: RewardRedemption }>({ isOpen: false, type: null });

  const activeItems = redemptions.filter(r => !r.isUsed && r.activatedAt);
  const unusedItems = redemptions.filter(r => !r.isUsed && !r.activatedAt);
  
  const handleConfirm = async () => {
    if (confirmState.type === "buy" && confirmState.reward) {
      await onRedeem(confirmState.reward);
    } else if (confirmState.type === "use" && confirmState.item) {
      if (Notification.permission === "default") {
        await Notification.requestPermission();
      }
      await onUseItem(confirmState.item.id);
    }
    setConfirmState({ isOpen: false, type: null });
  };

  return (
    <section className="stack">
      <ConfirmModal 
        isOpen={confirmState.isOpen} 
        title={confirmState.type === "buy" ? `Purchase ${confirmState.reward?.title} for ${confirmState.reward?.costCoins} coins?` : `Use ${confirmState.reward?.title}?`}
        onCancel={() => setConfirmState({ isOpen: false, type: null })}
        onConfirm={handleConfirm}
        confirmText={confirmState.type === "buy" ? "Purchase" : "Use"}
      />

      {activeItems.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "16px" }}>
          {activeItems.map(item => {
            const r = rewards.find(x => x.id === item.rewardId);
            if (!r) return null;
            return <ActiveTimer key={item.id} redemption={item} reward={r} onComplete={() => onCompleteItem(item.id)} />;
          })}
        </div>
      )}

      {unusedItems.length > 0 && (
        <>
          <SectionTitle title="Inventory" detail={`${unusedItems.length} items`} />
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "24px" }}>
            {unusedItems.map(item => {
              const r = rewards.find(x => x.id === item.rewardId);
              if (!r) return null;
              return (
                <button key={item.id} className="secondary-action" onClick={() => setConfirmState({ isOpen: true, type: "use", item, reward: r })}>
                  🧪 {r.title}
                </button>
              );
            })}
          </div>
        </>
      )}

      <SectionTitle title="Rewards" detail={`${coins} coins`} />
      {rewards.map((reward) => (
        <article className="reward-card" key={reward.id}>
          <div>
            <span>{reward.durationMinutes > 0 ? `${reward.durationMinutes} min` : "Instant"}</span>
            <h2>{reward.title}</h2>
            <p>{reward.description}</p>
          </div>
          <button className="coin-button" onClick={() => setConfirmState({ isOpen: true, type: "buy", reward })}>
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
      .slice(-7) // Show last 7 active days
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
          <h3>Consistency (Last 7 Days)</h3>
          <div style={{ height: "150px", width: "100%", display: "flex", alignItems: "flex-end", gap: "8px", marginTop: "16px", padding: "10px", borderBottom: "1px solid var(--line)", borderLeft: "1px solid var(--line)" }}>
            {chartData.map((d) => {
              const heightPct = Math.max(5, (d.completions / Math.max(1, Math.max(...chartData.map(x => x.completions)))) * 100);
              return (
                <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "100%", background: "#4fb286", height: `${heightPct}%`, borderRadius: "4px 4px 0 0", minHeight: "4px" }} title={`${d.completions} completions`} />
                  <span style={{ fontSize: "10px", color: "var(--muted)" }}>{d.date.slice(5)}</span>
                </div>
              )
            })}
          </div>
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
