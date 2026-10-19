// LLM'ga yuborishdan oldin shaxsiy ma'lumotlarni niqoblash (chegaradan tashqari qayta ishlashni
// kamaytirish uchun, 04-hujjat §1). Javobda placeholder'lar asl qiymatga qaytariladi.

const RULES: { kind: string; re: RegExp }[] = [
  { kind: "EMAIL", re: /[\w.+-]+@[\w-]+\.[\w.-]+/g },
  { kind: "CARD", re: /\b(?:\d[ -]?){15,18}\d\b/g },
  { kind: "PHONE", re: /(?:\+?998[\s-]?)?\(?\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/g },
  { kind: "PASSPORT", re: /\b[A-Z]{2}\s?\d{7}\b/g },
];

export class PiiMasker {
  private readonly forward = new Map<string, string>();
  private readonly back = new Map<string, string>();
  private counters: Record<string, number> = {};

  mask(text: string): string {
    let out = text;
    for (const { kind, re } of RULES) {
      out = out.replace(re, (match) => {
        const existing = this.forward.get(match);
        if (existing) return existing;
        const n = (this.counters[kind] = (this.counters[kind] ?? 0) + 1);
        const token = `[${kind}_${n}]`;
        this.forward.set(match, token);
        this.back.set(token, match);
        return token;
      });
    }
    return out;
  }

  unmask(text: string): string {
    return text.replace(/\[(EMAIL|CARD|PHONE|PASSPORT)_\d+\]/g, (t) => this.back.get(t) ?? t);
  }
}

/** Matndan telefon raqamini ajratib olish (lid yig'ish uchun). */
export function extractPhone(text: string): string | null {
  const m = text.match(/(?:\+?998[\s-]?)?\(?\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, "");
  return digits.length === 9 ? `+998${digits}` : digits.length === 12 ? `+${digits}` : null;
}
