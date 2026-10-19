// O'zbek matnini qidiruv uchun normallashtirish.
// O'zbek tili lotin va kirill yozuvida yoziladi, apostrof esa kamida 6 xil belgi bilan
// (o' oʻ o‘ o’ o` oʼ). Indeks va so'rov bir xil shaklga keltirilmasa, qidiruv ishlamaydi.

const APOSTROPHES = /[ʻʼ‘’`´ʹ]/g;

const UZ_CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ё: "yo", ж: "j", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "x", ц: "s", ч: "ch", ш: "sh", щ: "sh", ъ: "'", ь: "", ы: "i", э: "e",
  ю: "yu", я: "ya", ў: "o'", қ: "q", ғ: "g'", ҳ: "h",
};

const VOWELS_LATIN = new Set(["a", "e", "i", "o", "u"]);

/** O'zbek kirill matnini lotin yozuviga o'giradi (1995-yilgi alifbo qoidalari, soddalashtirilgan). */
export function transliterateUzCyrillic(input: string): string {
  let out = "";
  const chars = [...input];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    const lower = ch.toLowerCase();
    let mapped: string | undefined;
    if (lower === "е") {
      // "е" so'z boshida va unlidan keyin "ye" bo'ladi: ер -> yer, поезд -> poyezd
      const prev = out.at(-1)?.toLowerCase();
      mapped = prev === undefined || !/[a-z']/.test(prev) || VOWELS_LATIN.has(prev) ? "ye" : "e";
    } else {
      mapped = UZ_CYRILLIC[lower];
    }
    if (mapped === undefined) {
      out += ch;
      continue;
    }
    if (ch !== lower && mapped.length > 0) {
      // Bosh harfni saqlash: Ш -> Sh, Ў -> O'
      mapped = mapped[0]!.toUpperCase() + mapped.slice(1);
    }
    out += mapped;
  }
  return out;
}

/** Apostrof variantlarini oddiy ' belgisiga keltiradi. */
export function unifyApostrophes(input: string): string {
  return input.replace(APOSTROPHES, "'");
}

/**
 * Qidiruv indeksi va so'rovlar uchun yagona shakl: apostroflar birlashtiriladi,
 * o'zbek kirill matni lotinga o'giriladi, kichik harf, ortiqcha bo'shliqlar olib tashlanadi.
 * Rus tilidagi matn transliteratsiya qilinmaydi (aks holda rus so'zlari buziladi).
 */
export function normalizeForSearch(input: string, lang?: string): string {
  let text = unifyApostrophes(input.normalize("NFC"));
  if (lang === "uz-cyrl") text = transliterateUzCyrillic(text);
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Qidiruv uchun so'zlarga ajratish (apostrof so'z ichida qoladi: o'zbek, g'oya). */
export function tokenize(normalized: string): string[] {
  return normalized.match(/[\p{L}\p{N}]+(?:'[\p{L}]+)*/gu) ?? [];
}
