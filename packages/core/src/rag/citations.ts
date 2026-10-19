import type { SearchHit } from "./types.js";

export interface Citation {
  id: string;
  chunkId: string;
  title: string;
  url?: string;
}

/**
 * Model javobidagi [S1], [S2] belgilarini tekshiradi: mavjud bo'lmagan ID'lar olib tashlanadi,
 * ishlatilgan manbalar ro'yxati va noto'g'ri ID'lar (`invalid`) qaytariladi.
 */
export function resolveCitations(text: string, sources: SearchHit[]): { text: string; citations: Citation[]; invalid: string[] } {
  const byId = new Map(sources.map((s, i) => [`S${i + 1}`, s]));
  const used = new Map<string, Citation>();
  const invalid: string[] = [];

  const cleaned = text
    .replace(/\[(S\d+(?:\s*,\s*S\d+)*)\]/g, (_m, group: string) => {
      const ids = group.split(/\s*,\s*/);
      const ok = ids.filter((id) => {
        const src = byId.get(id);
        if (!src) {
          invalid.push(id);
          return false;
        }
        if (!used.has(id)) {
          used.set(id, { id, chunkId: src.chunkId, title: src.title, ...(src.locator.url ? { url: src.locator.url } : {}) });
        }
        return true;
      });
      return ok.length ? `[${ok.join(", ")}]` : "";
    })
    .replace(/ +([.,!?])/g, "$1")
    .trim();

  return { text: cleaned, citations: [...used.values()], invalid };
}

/** Foydalanuvchiga ko'rsatishdan oldin [S1] belgilarini olib tashlash (manbalar alohida ko'rsatiladi). */
export function stripCitationMarkers(text: string): string {
  return text.replace(/\s*\[S\d+(?:\s*,\s*S\d+)*\]/g, "").trim();
}
