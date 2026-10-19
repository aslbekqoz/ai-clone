import { tokenize, unifyApostrophes } from "./normalize.js";

export type Lang = "uz" | "uz-cyrl" | "ru" | "en" | "unknown";

const UZ_CYRL_ONLY = /[ўқғҳЎҚҒҲ]/;
const UZ_CYRL_WORDS = new Set(["ва", "учун", "билан", "бу", "ҳам", "эмас", "керак", "менга", "сиз", "мен", "нима", "қандай", "бор", "йўқ", "ҳақида"]);
const RU_WORDS = new Set(["и", "в", "не", "что", "на", "это", "как", "я", "вы", "мне", "для", "по", "есть", "можно", "сколько", "здравствуйте", "привет"]);
const UZ_LAT_WORDS = new Set(["va", "uchun", "bilan", "bu", "ham", "emas", "kerak", "menga", "siz", "men", "nima", "qanday", "bor", "yo'q", "haqida", "qancha", "salom", "assalomu", "alaykum", "rahmat", "kurs", "narxi"]);
const EN_WORDS = new Set(["the", "and", "is", "you", "what", "how", "to", "of", "for", "i", "my", "can", "do", "hello", "price"]);

/**
 * Yengil til aniqlagich: xabar va chunklar uchun yetarli. Aralash yozuvda
 * (masalan "salom, kak dela") ko'proq so'z topilgan til tanlanadi.
 */
export function detectLang(input: string): Lang {
  const text = unifyApostrophes(input);
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return "unknown";
  const cyr = letters.filter((c) => /\p{Script=Cyrillic}/u.test(c)).length;
  const words = tokenize(text.toLowerCase());

  if (cyr > letters.length / 2) {
    if (UZ_CYRL_ONLY.test(text)) return "uz-cyrl";
    const uz = words.filter((w) => UZ_CYRL_WORDS.has(w)).length;
    const ru = words.filter((w) => RU_WORDS.has(w)).length;
    return uz > ru ? "uz-cyrl" : "ru";
  }

  const uz = words.filter((w) => UZ_LAT_WORDS.has(w)).length + (text.match(/[og]'/gi)?.length ?? 0);
  const en = words.filter((w) => EN_WORDS.has(w)).length;
  if (uz === 0 && en === 0) return "unknown";
  return uz >= en ? "uz" : "en";
}
