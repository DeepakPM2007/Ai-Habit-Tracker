export function createId(prefix: string): string {
  if ("crypto" in globalThis && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function createIdempotencyKey(parts: string[]): string {
  return parts.join(":").toLowerCase();
}
