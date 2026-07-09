export function levelFromXp(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(xp / 100)) + 1);
}

export function xpForNextLevel(level: number): number {
  return level * level * 100;
}

export function levelProgress(xp: number): number {
  const level = levelFromXp(xp);
  const previous = level <= 1 ? 0 : (level - 1) * (level - 1) * 100;
  const next = xpForNextLevel(level);
  return Math.min(100, Math.round(((xp - previous) / (next - previous)) * 100));
}
