import { describe, expect, it } from "vitest";
import { chunkText, detectLang, normalizeForSearch, transliterateUzCyrillic, unifyApostrophes } from "../src/index.js";

describe("transliterateUzCyrillic", () => {
  it("o'zbek kirillni lotinga o'giradi", () => {
    expect(transliterateUzCyrillic("Ўзбекистон")).toBe("O'zbekiston");
    expect(transliterateUzCyrillic("қўшиқ")).toBe("qo'shiq");
    expect(transliterateUzCyrillic("ғоя")).toBe("g'oya");
    expect(transliterateUzCyrillic("Шаҳар")).toBe("Shahar");
  });

  it("е so'z boshida va unlidan keyin ye bo'ladi", () => {
    expect(transliterateUzCyrillic("ер")).toBe("yer");
    expect(transliterateUzCyrillic("поезд")).toBe("poyezd");
    expect(transliterateUzCyrillic("келди")).toBe("keldi");
  });
});

describe("normalizeForSearch", () => {
  it("apostrof variantlarini birlashtiradi", () => {
    expect(unifyApostrophes("oʻzbek g‘oya o’qish o`rin")).toBe("o'zbek g'oya o'qish o'rin");
  });

  it("lotin va kirill yozuvdagi bir xil matn bir xil shaklga keladi", () => {
    expect(normalizeForSearch("Курс нархи қанча?", "uz-cyrl")).toBe(normalizeForSearch("Kurs narxi qancha?"));
    expect(normalizeForSearch("Ўқитувчи", "uz-cyrl")).toBe(normalizeForSearch("Oʻqituvchi"));
  });

  it("rus matnini transliteratsiya qilmaydi", () => {
    expect(normalizeForSearch("Сколько стоит курс?", "ru")).toBe("сколько стоит курс?");
  });
});

describe("detectLang", () => {
  it.each([
    ["Assalomu alaykum, kurs narxi qancha?", "uz"],
    ["Курс нархи қанча?", "uz-cyrl"],
    ["Здравствуйте, сколько стоит курс?", "ru"],
    ["Hello, what is the price of the course?", "en"],
  ])("%s → %s", (text, lang) => {
    expect(detectLang(text)).toBe(lang);
  });
});

describe("chunkText", () => {
  it("qisqa matn bitta chunk bo'ladi", () => {
    expect(chunkText("Birinchi paragraf.\n\nIkkinchi paragraf.")).toHaveLength(1);
  });

  it("uzun matnni maqsadli hajmga bo'ladi va ustma-ustlik qoldiradi", () => {
    const para = "IELTS imtihoniga tayyorlanish uchun har kuni o'qish kerak. ".repeat(12);
    const text = Array.from({ length: 10 }, () => para).join("\n\n");
    const chunks = chunkText(text, { targetTokens: 300 });
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(300 * 4 * 1.5);
    expect(chunks.map((c) => c.ord)).toEqual(chunks.map((_, i) => i));
  });

  it("bitta juda uzun paragrafni gaplar bo'yicha bo'ladi", () => {
    const text = "Bu gap. ".repeat(1000);
    const chunks = chunkText(text, { targetTokens: 200, overlap: 0 });
    expect(chunks.length).toBeGreaterThan(5);
  });
});
