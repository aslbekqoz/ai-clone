import { AnthropicProvider, DEFAULT_POLICY, ElevenLabsStt, HashingEmbedder, LLMRouter, MockProvider, TeiEmbedder, mockPolicy, type Embedder, type SpeechToText } from "@ai-clone/core";
import { BillingService, billingConfigFromEnv } from "./billing.js";
import { createPool, type Db } from "./pool.js";
import { CloneService } from "./service.js";

export interface Runtime {
  db: Db;
  service: CloneService;
  billing: BillingService;
  llm: "anthropic" | "mock";
  embedder: Embedder;
  /** ELEVENLABS_API_KEY bo'lsa — ovozli xabarlar va subtitrsiz YouTube videolari uchun. */
  stt: SpeechToText | null;
}

/**
 * Muhit o'zgaruvchilaridan servisni yig'adi (API va bot uchun umumiy):
 * - ANTHROPIC_API_KEY bo'lsa — Claude (marshrutlash: DEFAULT_POLICY), aks holda MockProvider.
 * - TEI_URL bo'lsa — BGE-M3 embeddinglar, aks holda oflayn HashingEmbedder.
 * - ELEVENLABS_API_KEY bo'lsa — STT (ElevenLabs Scribe).
 */
export function createRuntime(env: NodeJS.ProcessEnv = process.env): Runtime {
  const db = createPool(env.DATABASE_URL);
  const embedder: Embedder = env.TEI_URL ? new TeiEmbedder(env.TEI_URL) : new HashingEmbedder();
  const llm = env.ANTHROPIC_API_KEY ? "anthropic" : "mock";
  const router =
    llm === "anthropic" ? new LLMRouter([new AnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY! })], DEFAULT_POLICY) : new LLMRouter([new MockProvider()], mockPolicy());
  const stt = env.ELEVENLABS_API_KEY ? new ElevenLabsStt(env.ELEVENLABS_API_KEY, env.ELEVENLABS_STT_MODEL ?? "scribe_v2") : null;
  if (llm === "mock") console.warn("⚠️  ANTHROPIC_API_KEY yo'q — MockProvider ishlatilmoqda (javoblar manbadan iqtibos, haqiqiy model emas).");
  return { db, service: new CloneService(db, embedder, router), billing: new BillingService(db, billingConfigFromEnv(env)), llm, embedder, stt };
}
