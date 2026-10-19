import mammoth from "mammoth";
import { extractText } from "unpdf";
import type { Locator } from "../rag/types.js";

/** Bilim manbasining bo'limi: har biri alohida bo'laklanadi va o'z locator'i bilan iqtibos qilinadi. */
export interface Section {
  text: string;
  locator: Locator;
}

export interface ParsedDocument {
  type: "pdf" | "doc" | "text";
  title: string;
  sections: Section[];
}

export class UnsupportedFileError extends Error {
  constructor(name: string) {
    super(`Fayl turi qo'llab-quvvatlanmaydi: ${name}. Ruxsat etilgan: PDF, DOCX, TXT, MD.`);
    this.name = "UnsupportedFileError";
  }
}

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Fayl nomi va MIME turi bo'yicha formatni aniqlab, matnni ajratadi. */
export async function parseFile(name: string, mimeType: string, data: Uint8Array): Promise<ParsedDocument> {
  const ext = name.toLowerCase().split(".").at(-1) ?? "";
  const title = name.replace(/\.[^.]+$/, "") || name;

  if (ext === "pdf" || mimeType === "application/pdf" || startsWith(data, "%PDF")) {
    // unpdf (PDF.js) sahifalarni alohida qaytaradi — iqtibosda sahifa raqami ko'rsatiladi.
    const { text } = await extractText(new Uint8Array(data), { mergePages: false });
    const sections = text.map((t, i) => ({ text: cleanup(t), locator: { page: i + 1 } })).filter((s) => s.text.length > 0);
    if (!sections.length) throw new Error("PDF'dan matn topilmadi — ehtimol skanerlangan rasm (OCR keyinroq qo'shiladi).");
    return { type: "pdf", title, sections };
  }

  if (ext === "docx" || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(data) });
    return { type: "doc", title, sections: [{ text: cleanup(value), locator: {} }] };
  }

  if (["txt", "md", "markdown", "csv"].includes(ext) || mimeType.startsWith("text/")) {
    return { type: "text", title, sections: [{ text: cleanup(new TextDecoder().decode(data)), locator: {} }] };
  }

  throw new UnsupportedFileError(name);
}

function startsWith(data: Uint8Array, prefix: string): boolean {
  return data.length >= prefix.length && [...prefix].every((ch, i) => data[i] === ch.charCodeAt(0));
}

/** PDF'dagi qator uzilishlari va ortiqcha bo'shliqlarni tozalash (paragraflar saqlanadi). */
function cleanup(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/(\p{L})-\n(\p{L})/gu, "$1$2")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
