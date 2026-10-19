import type { Embedder, SimilarityThresholds } from "../embed/embedder.js";
import { classifyMessage, type Classification } from "../guardrails/classifier.js";
import { detectSignals, selfHarmReply, type EscalationReason } from "../guardrails/escalation.js";
import { PiiMasker } from "../guardrails/pii.js";
import type { LLMRouter } from "../llm/router.js";
import type { ChatTurn, Purpose, Usage } from "../llm/types.js";
import { buildContext, buildSystemPrompt, unanswerableReply, type ClonePersona } from "../persona/prompt.js";
import { resolveCitations, type Citation } from "../rag/citations.js";
import { retrieve, type Reranker } from "../rag/retrieve.js";
import { needsRewrite, rewriteQuery } from "../rag/rewrite.js";
import type { KnowledgeStore } from "../rag/types.js";
import { detectLang } from "../text/lang.js";

export interface TurnDeps {
  store: KnowledgeStore;
  embedder: Embedder;
  router: LLMRouter;
  reranker?: Reranker;
  /** Reranker balli shundan past manbalar ishonchsiz (sigmoid 0..1 shkala; standart 0.05). */
  minRerankScore?: number;
  /** Standart: embedderning o'z chegaralari. */
  thresholds?: SimilarityThresholds;
  /** Kichik modeldagi qo'shimcha qadamlar (har biri xato bersa, qoidalarga qaytiladi). */
  smart?: { classifier?: boolean; rewrite?: boolean };
  /** Kuzatuv uchun: qo'shimcha qadam xatolari (default: console.warn). */
  onStepError?: (step: "classify" | "rewrite" | "rerank", err: unknown) => void;
}

export interface TurnInput {
  tenantId: string;
  cloneId: string;
  persona: ClonePersona;
  message: string;
  /** Oldingi xabarlar (eng eskisidan yangisiga), joriy xabarsiz. */
  history: ChatTurn[];
  memory?: string[];
  /** Suhbatning birinchi javobimi — oshkoralik matni qo'shiladi. */
  firstTurn: boolean;
  traceId?: string;
}

export interface TurnResult {
  reply: string;
  citations: Citation[];
  lang: string;
  /** "llm" — model javobi; "verified" — tasdiqlangan javob; "unanswerable"/"safety" — LLM chaqirilmagan. */
  source: "llm" | "unanswerable" | "safety";
  escalate: boolean;
  escalationReasons: EscalationReason[];
  purchaseIntent: boolean;
  confidence: number;
  /** LLM klassifikatori natijasi (yoqilgan bo'lsa). */
  classification?: Classification;
  /** Qidiruvda ishlatilgan so'rov (qayta yozilgan bo'lsa farq qiladi). */
  searchQuery: string;
  model?: string;
  provider?: string;
  usage?: Usage;
  costUsd: number;
  latencyMs: number;
}

const HISTORY_TURNS = 10;

/** Bitta foydalanuvchi xabarini qayta ishlash: guardrails → qidiruv → persona prompt → LLM → iqtiboslar. */
export async function handleTurn(deps: TurnDeps, input: TurnInput): Promise<TurnResult> {
  const started = Date.now();
  const lang = detectLang(input.message);
  const signals = detectSignals(input.message, lang);
  const base = { lang, escalate: signals.escalate, escalationReasons: signals.reasons, purchaseIntent: signals.purchaseIntent, citations: [] as Citation[] };
  const withDisclosure = (text: string) => (input.firstTurn ? `${input.persona.disclosure}\n\n${text}` : text);

  if (signals.selfHarm) {
    return { ...base, reply: withDisclosure(selfHarmReply(lang)), source: "safety", confidence: 0, searchQuery: input.message, costUsd: 0, latencyMs: Date.now() - started };
  }

  // Klassifikator va so'rovni qayta yozish parallel — kechikish bitta kichik model chaqiruvi qadar.
  const onStepError = deps.onStepError ?? ((step, err) => console.warn(`[turn] ${step} o'tkazib yuborildi:`, (err as Error).message));
  const ctx = { tenantId: input.tenantId, cloneId: input.cloneId, message: input.message, history: input.history };
  const [cls, rw] = await Promise.all([
    deps.smart?.classifier ? classifyMessage(deps.router, ctx).catch((err) => (onStepError("classify", err), null)) : null,
    deps.smart?.rewrite && needsRewrite(input.message, input.history) ? rewriteQuery(deps.router, ctx).catch((err) => (onStepError("rewrite", err), null)) : null,
  ]);
  let extraCost = (cls?.costUsd ?? 0) + (rw?.costUsd ?? 0);
  if (cls) {
    const reasons = [...new Set([...base.escalationReasons, ...cls.classification.reasons])];
    Object.assign(base, { escalationReasons: reasons, escalate: base.escalate || cls.classification.escalate, purchaseIntent: base.purchaseIntent || reasons.includes("purchase_intent") });
  }
  const searchQuery = rw?.query ?? input.message;
  const extra = { searchQuery, ...(cls ? { classification: cls.classification } : {}) };

  const thresholds = deps.thresholds ?? deps.embedder.thresholds;
  const retrieval = await retrieve(deps.store, deps.embedder, input.cloneId, searchQuery, {
    ...thresholds,
    ...(deps.reranker ? { reranker: deps.reranker, minRerankScore: deps.minRerankScore ?? 0.05, onRerankError: (err: unknown) => onStepError("rerank", err) } : {}),
  });

  if (input.persona.grounded && !retrieval.answerable) {
    return {
      ...base,
      ...extra,
      reply: withDisclosure(unanswerableReply(input.persona, lang)),
      source: "unanswerable",
      escalate: true,
      confidence: retrieval.confidence,
      costUsd: extraCost,
      latencyMs: Date.now() - started,
    };
  }

  const exemplars = await deps.store.findExemplars(input.cloneId, retrieval.queryEmbedding, 4);
  const masker = new PiiMasker();
  const messages: ChatTurn[] = [
    ...input.history.slice(-HISTORY_TURNS).map((t) => ({ role: t.role, content: masker.mask(t.content) })),
    { role: "user", content: masker.mask(input.message) },
  ];

  // Sotuv va uzun savollar o'rta modelga, qolganlari kichik modelga (marja uchun asosiy richag).
  const purpose: Purpose = base.purchaseIntent || input.message.length > 400 ? "answer_complex" : "answer";
  const result = await deps.router.generate({
    system: buildSystemPrompt(input.persona),
    context: buildContext({ sources: retrieval.hits, exemplars, verified: retrieval.verified, memory: input.memory ?? [] }),
    messages,
    maxTokens: 1024,
    effort: "low",
    metadata: { tenantId: input.tenantId, cloneId: input.cloneId, purpose, ...(input.traceId ? { traceId: input.traceId } : {}) },
  });

  const { text, citations } = resolveCitations(masker.unmask(result.text), retrieval.hits);
  extraCost += result.costUsd;
  return {
    ...base,
    ...extra,
    reply: withDisclosure(text),
    citations,
    source: "llm",
    confidence: retrieval.verified?.similarity ?? retrieval.confidence,
    model: result.model,
    provider: result.provider,
    usage: result.usage,
    costUsd: extraCost,
    latencyMs: Date.now() - started,
  };
}
