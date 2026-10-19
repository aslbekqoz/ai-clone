import { costUsd } from "./pricing.js";
import { RetryableProviderError, type GenerateRequest, type GenerateResult, type LLMProvider, type Purpose } from "./types.js";

export interface ModelRef {
  provider: string;
  model: string;
}

export type ModelPolicy = Record<Purpose, ModelRef[]>;

/**
 * Standart marshrutlash (04-hujjat §5): oddiy vazifalar kichik modelda, murakkab javoblar
 * o'rta modelda, oflayn tahlil eng kuchli modelda. Har bir zanjirning keyingi elementlari — fallback.
 * Marja shu taqsimotga bog'liq; boshqa modelga o'tish uchun policy'ni almashtiring.
 */
export const DEFAULT_POLICY: ModelPolicy = {
  classify: [{ provider: "anthropic", model: "claude-haiku-5-5" }],
  rewrite: [{ provider: "anthropic", model: "claude-haiku-5-5" }],
  answer: [
    { provider: "anthropic", model: "claude-haiku-5-5" },
    { provider: "anthropic", model: "claude-sonnet-5-5" },
  ],
  answer_complex: [
    { provider: "anthropic", model: "claude-sonnet-5-5" },
    { provider: "anthropic", model: "claude-haiku-5-5" },
  ],
  memory_extract: [{ provider: "anthropic", model: "claude-haiku-5-5" }],
  style_extract: [{ provider: "anthropic", model: "claude-opus-5-5" }],
  judge: [{ provider: "anthropic", model: "claude-opus-5-5" }],
};

export function mockPolicy(): ModelPolicy {
  const ref = [{ provider: "mock", model: "mock" }];
  return { classify: ref, rewrite: ref, answer: ref, answer_complex: ref, memory_extract: ref, style_extract: ref, judge: ref };
}

/** Provayder bo'yicha oddiy circuit breaker: oxirgi oynada xatolar ko'p bo'lsa, vaqtincha o'tkazib yuboriladi. */
class CircuitBreaker {
  private events = new Map<string, { at: number; ok: boolean }[]>();
  constructor(
    private readonly windowMs = 60_000,
    private readonly failureRate = 0.2,
    private readonly minCalls = 5,
  ) {}

  record(provider: string, ok: boolean, now = Date.now()): void {
    const list = (this.events.get(provider) ?? []).filter((e) => now - e.at < this.windowMs);
    list.push({ at: now, ok });
    this.events.set(provider, list);
  }

  isOpen(provider: string, now = Date.now()): boolean {
    const list = (this.events.get(provider) ?? []).filter((e) => now - e.at < this.windowMs);
    if (list.length < this.minCalls) return false;
    return list.filter((e) => !e.ok).length / list.length > this.failureRate;
  }
}

export class AllModelsFailedError extends Error {
  constructor(readonly attempts: { ref: ModelRef; error: string }[]) {
    super(`Barcha modellar ishlamadi: ${attempts.map((a) => `${a.ref.model} (${a.error})`).join("; ")}`);
    this.name = "AllModelsFailedError";
  }
}

export class LLMRouter {
  private readonly providers: Map<string, LLMProvider>;
  private readonly breaker = new CircuitBreaker();

  constructor(
    providers: LLMProvider[],
    private readonly policy: ModelPolicy = DEFAULT_POLICY,
  ) {
    this.providers = new Map(providers.map((p) => [p.id, p]));
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const chain = this.policy[req.metadata.purpose];
    const attempts: { ref: ModelRef; error: string }[] = [];

    for (const ref of chain) {
      const provider = this.providers.get(ref.provider);
      if (!provider) {
        attempts.push({ ref, error: "provayder ulanmagan" });
        continue;
      }
      if (this.breaker.isOpen(ref.provider) && ref !== chain.at(-1)) {
        attempts.push({ ref, error: "circuit open" });
        continue;
      }
      const started = Date.now();
      try {
        const result = await provider.generate(ref.model, req);
        this.breaker.record(ref.provider, true);
        // Rad etish (refusal) — keyingi modelda bir marta urinib ko'riladi.
        if (result.finishReason === "refusal" && ref !== chain.at(-1)) {
          attempts.push({ ref, error: "refusal" });
          continue;
        }
        return { ...result, costUsd: costUsd(ref.model, result.usage), latencyMs: Date.now() - started };
      } catch (err) {
        if (!(err instanceof RetryableProviderError)) throw err;
        this.breaker.record(ref.provider, false);
        attempts.push({ ref, error: err.message });
      }
    }
    throw new AllModelsFailedError(attempts);
  }
}
