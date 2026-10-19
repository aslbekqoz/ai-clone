import type { LLMRouter } from "../llm/router.js";
import type { ChatTurn } from "../llm/types.js";

// Suhbat tarixidan mustaqil qidiruv so'rovini yasash (04-hujjat §3.1): "uning narxi qancha?"
// kabi savollar oldingi xabarsiz qidiruvda hech narsa topmaydi.

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["query"],
  properties: { query: { type: "string" } },
} as const;

const SYSTEM = `Suhbat tarixiga qarab foydalanuvchining oxirgi xabarini bilim bazasida qidirish uchun mustaqil so'rovga aylantir.
- Olmoshlar va "u", "bu", "uning", "его", "это" kabi havolalarni aniq nomga almashtir.
- Xabar tilini saqla (o'zbekcha savolga o'zbekcha so'rov).
- Qisqa bo'lsin (20 so'zgacha), javob berma — faqat so'rov.
Faqat JSON qaytar.`;

/** Qayta yozish kerakmi: tarix bor va xabar qisqa yoki havola so'zlarini o'z ichiga oladi. */
export function needsRewrite(message: string, history: ChatTurn[]): boolean {
  if (!history.length) return false;
  const short = message.trim().split(/\s+/).length <= 8;
  const deictic = /\b(u|bu|shu|uning|bunga|unga|ular|qancha|qachon|qayerda|it|this|that|its)\b|(?:^|\s)(его|её|это|он|она|там|сколько|когда)(?=\s|$|[?.!,])/i.test(message);
  return short || deictic;
}

export async function rewriteQuery(
  router: LLMRouter,
  input: { tenantId: string; cloneId: string; message: string; history: ChatTurn[] },
): Promise<{ query: string; costUsd: number }> {
  const recent = input.history.slice(-6).map((t) => `${t.role === "user" ? "Foydalanuvchi" : "Klon"}: ${t.content.slice(0, 400)}`).join("\n");
  const result = await router.generate({
    system: SYSTEM,
    messages: [{ role: "user", content: `Suhbat:\n${recent}\n\nOxirgi xabar: ${input.message}` }],
    maxTokens: 200,
    effort: "low",
    responseSchema: SCHEMA,
    metadata: { tenantId: input.tenantId, cloneId: input.cloneId, purpose: "rewrite" },
  });
  const query = (result.json as { query?: unknown } | undefined)?.query;
  if (typeof query !== "string" || !query.trim()) throw new Error("Qayta yozish JSON qaytarmadi");
  return { query: query.trim().slice(0, 500), costUsd: result.costUsd };
}
