import type { LLMRouter } from "../llm/router.js";
import type { ChatTurn } from "../llm/types.js";
import type { EscalationReason } from "./escalation.js";

// Kichik modeldagi strukturali klassifikator (04-hujjat §3.3): qoidalar o'tkazib yuboradigan
// holatlarni ushlaydi — bilvosita so'rovlar, kinoya, aralash tildagi shikoyatlar.
// Qoidalar baribir birinchi ishlaydi: o'z-o'ziga zarar holatida LLM chaqirilmaydi.

export interface Classification {
  intent: "question" | "smalltalk" | "purchase" | "human_request" | "complaint" | "sensitive" | "other";
  /** Klon javob berishi mumkin, lekin egasi xabardor qilinishi kerakmi. */
  escalate: boolean;
  reasons: EscalationReason[];
  /** Foydalanuvchi ismi yoki telefon kabi xotirada saqlashga arziydigan fakt (bo'lmasa bo'sh). */
  memoryFact: string;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "escalate", "reasons", "memory_fact"],
  properties: {
    intent: { type: "string", enum: ["question", "smalltalk", "purchase", "human_request", "complaint", "sensitive", "other"] },
    escalate: { type: "boolean" },
    reasons: { type: "array", items: { type: "string", enum: ["human_requested", "purchase_intent", "complaint", "sensitive_topic"] } },
    memory_fact: { type: "string" },
  },
} as const;

const SYSTEM = `Sen ekspertning AI-kloniga kelgan xabarlarni tasniflaysan. Xabar o'zbek (lotin yoki kirill), rus yoki ingliz tilida, aralash bo'lishi mumkin.
intent:
- question — bilim yoki xizmat haqida savol
- smalltalk — salomlashish, rahmat
- purchase — sotib olish, yozilish, to'lash, narx so'rab xarid niyati
- human_request — egasining o'zi yoki operator bilan gaplashish istagi (bilvosita ham: "o'zingiz javob bering", "bot emas, siz kerak")
- complaint — norozilik, shikoyat, pulni qaytarish
- sensitive — tibbiy, huquqiy, moliyaviy qaror yoki ruhiy holat
- other — boshqa
escalate=true: human_request, complaint, sensitive yoki egasi albatta bilishi kerak bo'lgan holat. Oddiy savol va xarid niyati uchun escalate=false (xarid — lid sifatida alohida belgilanadi).
reasons: mos sabablar (purchase uchun purchase_intent).
memory_fact: foydalanuvchi o'zi haqida aytgan muhim fakt (ism, maqsad, daraja), qisqa, o'zbekcha; bo'lmasa "".
Faqat JSON qaytar.`;

const REASON_BY_INTENT: Partial<Record<Classification["intent"], EscalationReason>> = {
  purchase: "purchase_intent",
  human_request: "human_requested",
  complaint: "complaint",
  sensitive: "sensitive_topic",
};

export async function classifyMessage(
  router: LLMRouter,
  input: { tenantId: string; cloneId: string; message: string; history: ChatTurn[] },
): Promise<{ classification: Classification; costUsd: number }> {
  const recent = input.history.slice(-4).map((t) => `${t.role === "user" ? "Foydalanuvchi" : "Klon"}: ${t.content.slice(0, 300)}`).join("\n");
  const result = await router.generate({
    system: SYSTEM,
    messages: [{ role: "user", content: `${recent ? `Oldingi xabarlar:\n${recent}\n\n` : ""}Yangi xabar: ${input.message}` }],
    maxTokens: 300,
    effort: "low",
    responseSchema: SCHEMA,
    metadata: { tenantId: input.tenantId, cloneId: input.cloneId, purpose: "classify" },
  });
  const raw = result.json as { intent?: string; escalate?: boolean; reasons?: string[]; memory_fact?: string } | undefined;
  if (!raw || typeof raw.intent !== "string") throw new Error("Klassifikator JSON qaytarmadi");
  const intent = (SCHEMA.properties.intent.enum as readonly string[]).includes(raw.intent) ? (raw.intent as Classification["intent"]) : "other";
  const reasons = new Set<EscalationReason>((raw.reasons ?? []).filter((r): r is EscalationReason => ["human_requested", "purchase_intent", "complaint", "sensitive_topic"].includes(r)));
  const byIntent = REASON_BY_INTENT[intent];
  if (byIntent) reasons.add(byIntent);
  return {
    classification: { intent, escalate: Boolean(raw.escalate) || [...reasons].some((r) => r !== "purchase_intent"), reasons: [...reasons], memoryFact: (raw.memory_fact ?? "").trim().slice(0, 200) },
    costUsd: result.costUsd,
  };
}
