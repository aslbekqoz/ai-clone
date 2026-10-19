import type { Usage } from "./types.js";

/** Narxlar USD / 1 mln token. Prod'ga chiqishdan oldin provayderlarning rasmiy narx sahifasidan yangilang. */
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const PRICES: Record<string, ModelPrice> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  mock: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

export function costUsd(model: string, usage: Usage): number {
  const p = PRICES[model];
  if (!p) return 0;
  return (
    (usage.inputTokens * p.input +
      usage.cachedInputTokens * p.cacheRead +
      usage.cacheWriteTokens * p.cacheWrite +
      usage.outputTokens * p.output) /
    1_000_000
  );
}
