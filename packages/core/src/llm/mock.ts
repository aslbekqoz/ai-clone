import type { GenerateRequest, GenerateResult, LLMProvider } from "./types.js";

/**
 * API kalitisiz ishlab chiqish va testlar uchun provayder: kontekstdagi birinchi manbani
 * iqtibos bilan qaytaradi. Haqiqiy model emas — faqat butun zanjirni tekshirish uchun.
 */
export class MockProvider implements LLMProvider {
  readonly id = "mock";
  calls: { model: string; req: GenerateRequest }[] = [];

  constructor(private readonly reply?: (req: GenerateRequest) => string) {}

  async generate(model: string, req: GenerateRequest): Promise<Omit<GenerateResult, "costUsd" | "latencyMs">> {
    this.calls.push({ model, req });
    const text = this.reply ? this.reply(req) : defaultReply(req);
    return {
      text,
      model,
      provider: this.id,
      finishReason: "stop",
      usage: { inputTokens: Math.ceil((req.system.length + (req.context?.length ?? 0)) / 4), cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: Math.ceil(text.length / 4) },
    };
  }
}

function defaultReply(req: GenerateRequest): string {
  const source = req.context?.match(/<source id="(S\d+)"[^>]*>\n([\s\S]*?)\n<\/source>/);
  if (!source) return "Bu haqida ma'lumotim yo'q.";
  const firstSentence = source[2]!.split(/(?<=[.!?])\s/)[0] ?? source[2]!;
  return `${firstSentence.trim()} [${source[1]}]`;
}
