import { normalizeForSearch } from "../text/normalize.js";

export type EscalationReason = "human_requested" | "purchase_intent" | "complaint" | "sensitive_topic" | "self_harm" | "llm_unavailable";

export interface Signals {
  escalate: boolean;
  reasons: EscalationReason[];
  /** Sotuv niyati — murakkab modelga yo'naltirish va lid sifatida belgilash uchun. */
  purchaseIntent: boolean;
  selfHarm: boolean;
}

// Kalit iboralar normallashtirilgan (kichik harf, lotin) shaklda. MVP uchun qoida asosida;
// v1 da arzon modeldagi strukturali klassifikator bilan to'ldiriladi (04-hujjat §3.3).
/** Matndan aniqlanadigan sabablar (llm_unavailable — tizim holati, matn emas). */
type TextReason = Exclude<EscalationReason, "llm_unavailable">;
const PATTERNS: Record<TextReason, RegExp[]> = {
  human_requested: [
    /\b(odam|inson|operator|admin|o'zingiz|o'zi bilan|jonli)\b.*\b(gaplash|bog'lan|yoz|kerak)/,
    /(человек|оператор|живой|администратор|менеджер)/,
    /\b(real person|human|operator|talk to (him|her|you personally))\b/,
  ],
  purchase_intent: [
    /\b(sotib ol|xarid|to'lov|to'lamoqchi|yozilmoqchi|ro'yxatdan o'tmoqchi|buyurtma)/,
    /(купить|оплат|записаться|заказ)/,
    /\b(buy|purchase|sign up|enroll|pay)\b/,
  ],
  complaint: [/\b(shikoyat|aldad|pulimni qaytar|norozi|firibgar)/, /(жалоб|обман|верните деньги|мошенни)/, /\b(complain|scam|refund)\b/],
  sensitive_topic: [
    /\b(dori|tashxis|kasallik|sud|advokat|kredit|soliq)\b/,
    /(лекарств|диагноз|болезн|суд|адвокат|кредит)/,
    /\b(diagnos|medication|lawsuit|lawyer)\b/,
  ],
  self_harm: [/\b(o'zimni o'ldir|yashagim kelmay|o'z joniga qasd)/, /(покончить с собой|не хочу жить|суицид)/, /\b(kill myself|suicide|end my life)\b/],
};

export function detectSignals(message: string, lang?: string): Signals {
  const text = normalizeForSearch(message, lang);
  const reasons: EscalationReason[] = (Object.keys(PATTERNS) as TextReason[]).filter((r) => PATTERNS[r].some((re) => re.test(text)));
  return {
    escalate: reasons.some((r) => r !== "purchase_intent"),
    reasons,
    purchaseIntent: reasons.includes("purchase_intent"),
    selfHarm: reasons.includes("self_harm"),
  };
}

/** O'z-o'ziga zarar mavzusida statik xavfsizlik javobi — LLM chaqirilmaydi. */
export function selfHarmReply(lang: string): string {
  if (lang === "ru" || lang === "uz-cyrl") {
    return "Мне очень жаль, что вам так тяжело. Вы не одни — пожалуйста, прямо сейчас позвоните в службу экстренной помощи 103 или поговорите с близким человеком. Я также сообщу владельцу этого чата.";
  }
  if (lang === "en") {
    return "I'm really sorry you're going through this. You're not alone — please contact local emergency services (103 in Uzbekistan) or someone you trust right now. I'll also let the owner of this chat know.";
  }
  return "Sizga hozir og'ir ekanidan juda afsusdaman. Siz yolg'iz emassiz — iltimos, hoziroq 103 tez yordam xizmatiga qo'ng'iroq qiling yoki yaqin insoningiz bilan gaplashing. Men ham bu haqda chat egasiga xabar beraman.";
}
