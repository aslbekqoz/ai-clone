import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NeedsOcrError, OcrError, parseFile, parseOcrJson } from "../src/index.js";

const fixture = (name: string) => readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", name));

describe("OCR", () => {
  it("matn qatlamisiz PDF skanerlangan deb aniqlanadi", async () => {
    const err = await parseFile("skan.pdf", "application/pdf", await fixture("skan.pdf")).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NeedsOcrError);
    expect(err).toMatchObject({ kind: "pdf", pages: 1, title: "skan" });
  });

  it("matnli PDF OCR'ga yuborilmaydi", async () => {
    await expect(parseFile("kurs.pdf", "application/pdf", await fixture("kurs.pdf"))).resolves.toMatchObject({ type: "pdf" });
  });

  it("model javobidan sahifalarni ajratadi, bo'sh sahifalarni tashlaydi", () => {
    const out = parseOcrJson(JSON.stringify({ pages: [{ page: 1, text: " IELTS kursi narxi " }, { page: 2, text: "" }, { page: 3, text: "Speaking" }] }));
    expect(out).toEqual([
      { text: "IELTS kursi narxi", locator: { page: 1 } },
      { text: "Speaking", locator: { page: 3 } },
    ]);
    expect(() => parseOcrJson("JSON emas")).toThrow(OcrError);
  });
});
