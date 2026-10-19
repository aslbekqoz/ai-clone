import { AnthropicProvider, DEFAULT_POLICY, ElevenLabsStt, ElevenLabsVoice, HashingEmbedder, LLMRouter, MockProvider, TeiEmbedder, TeiReranker, mockPolicy, type Embedder, type SpeechToText } from "@ai-clone/core";
import { BillingService, billingConfigFromEnv } from "./billing.js";
import { parseSecretKey } from "./crypto.js";
import { createPool, type Db } from "./pool.js";
import { MetaChannels } from "./meta-channels.js";
import { MonetizationService } from "./monetization.js";
import { TelegramChannels } from "./telegram-channels.js";
import { CloneService } from "./service.js";
import { VoiceService } from "./voice.js";

export interface Runtime {
  db: Db;
  service: CloneService;
  billing: BillingService;
  llm: "anthropic" | "mock";
  embedder: Embedder;
  /** ELEVENLABS_API_KEY bo'lsa — ovozli xabarlar va subtitrsiz YouTube videolari uchun. */
  stt: SpeechToText | null;
  /** CHANNEL_SECRET_KEY va PUBLIC_BASE_URL bo'lsa — har bir klon o'z Telegram botini ulaydi. */
  telegram: TelegramChannels | null;
  /** CHANNEL_SECRET_KEY va META_APP_SECRET bo'lsa — Instagram DM va WhatsApp. */
  meta: { channels: MetaChannels; appSecret: string; verifyToken: string } | null;
  /** Ovoz kloni (rozilik bilan). UZ tenantlari uchun xorijiy provayder VOICE_ALLOW_CROSS_BORDER=1 talab qiladi. */
  voice: VoiceService;
  /** PAYMENT_LINK_SECRET va PUBLIC_BASE_URL bo'lsa — obunachilar klonga pullik kirish oladi. */
  monetization: MonetizationService | null;
}

/**
 * Muhit o'zgaruvchilaridan servisni yig'adi (API va bot uchun umumiy):
 * - ANTHROPIC_API_KEY bo'lsa — Claude (marshrutlash: DEFAULT_POLICY), aks holda MockProvider.
 * - TEI_URL bo'lsa — BGE-M3 embeddinglar, aks holda oflayn HashingEmbedder.
 * - ELEVENLABS_API_KEY bo'lsa — STT (ElevenLabs Scribe).
 * - TEI_RERANK_URL bo'lsa — cross-encoder reranker (bge-reranker-v2-m3).
 * - Claude ulanganda LLM klassifikator va so'rovni qayta yozish yoqiladi (SMART_GUARDRAILS=0 — o'chirish).
 */
export function createRuntime(env: NodeJS.ProcessEnv = process.env): Runtime {
  const db = createPool(env.DATABASE_URL);
  const embedder: Embedder = env.TEI_URL ? new TeiEmbedder(env.TEI_URL) : new HashingEmbedder();
  const llm = env.ANTHROPIC_API_KEY ? "anthropic" : "mock";
  const router =
    llm === "anthropic" ? new LLMRouter([new AnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY! })], DEFAULT_POLICY) : new LLMRouter([new MockProvider()], mockPolicy());
  const stt = env.ELEVENLABS_API_KEY ? new ElevenLabsStt(env.ELEVENLABS_API_KEY, env.ELEVENLABS_STT_MODEL ?? "scribe_v2") : null;
  if (llm === "mock") console.warn("⚠️  ANTHROPIC_API_KEY yo'q — MockProvider ishlatilmoqda (javoblar manbadan iqtibos, haqiqiy model emas).");
  const smartOn = llm === "anthropic" && env.SMART_GUARDRAILS !== "0";
  const billing = new BillingService(db, billingConfigFromEnv(env));
  const monetization = env.PAYMENT_LINK_SECRET && env.PUBLIC_BASE_URL ? new MonetizationService(db, billing, env.PAYMENT_LINK_SECRET, env.PUBLIC_BASE_URL) : null;
  const service = new CloneService(db, embedder, router, {
    ...(monetization ? { paywall: monetization } : {}),
    ...(env.TEI_RERANK_URL ? { reranker: new TeiReranker(env.TEI_RERANK_URL) } : {}),
    ...(smartOn ? { smart: { classifier: true, rewrite: true } } : {}),
  });
  const telegram = env.CHANNEL_SECRET_KEY && env.PUBLIC_BASE_URL ? new TelegramChannels(db, parseSecretKey(env.CHANNEL_SECRET_KEY), env.PUBLIC_BASE_URL) : null;
  const meta =
    env.CHANNEL_SECRET_KEY && env.META_APP_SECRET
      ? { channels: new MetaChannels(db, parseSecretKey(env.CHANNEL_SECRET_KEY)), appSecret: env.META_APP_SECRET, verifyToken: env.META_VERIFY_TOKEN ?? "" }
      : null;
  const cloner = env.ELEVENLABS_API_KEY ? new ElevenLabsVoice(env.ELEVENLABS_API_KEY, env.ELEVENLABS_TTS_MODEL ?? "eleven_v3") : null;
  const voice = new VoiceService(db, cloner, stt, { allowCrossBorder: env.VOICE_ALLOW_CROSS_BORDER === "1" });
  return { db, service, telegram, meta, voice, monetization, billing, llm, embedder, stt };
}
