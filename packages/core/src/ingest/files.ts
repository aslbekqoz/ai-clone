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
    super(`Fayl turi qo'llab-quvvatlanmaydi: ${name}. Ruxsat etilgan: PDF, DOCX, TXT, MD, PNG, JPG.`);
    this.name = "UnsupportedFileError";
  }
}

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Matn qatlami yo'q hujjat (skanerlangan PDF yoki rasm) — OCR kerak. */
export class NeedsOcrError extends Error {
  constructor(
    readonly kind: "pdf" | "image",
    readonly mimeType: string,
    readonly pages: number,
    readonly title: string,
  ) {
    super(kind === "pdf" ? "PDF'da matn qatlami yo'q (skanerlangan hujjat) — OCR kerak" : "Rasm — matnni OCR orqali olish kerak");
    this.name = "NeedsOcrError";
  }
}

const IMAGE_TYPES: Record<string, "image/png" | "image/jpeg" | "image/webp"> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
/** Sahifadagi o'rtacha belgilar shundan kam bo'lsa — PDF skanerlangan deb hisoblanadi. */
const MIN_CHARS_PER_PAGE = 30;

/** Fayl nomi va MIME turi bo'yicha formatni aniqlab, matnni ajratadi. */
export async function parseFile(name: string, mimeType: string, data: Uint8Array): Promise<ParsedDocument> {
  const ext = name.toLowerCase().split(".").at(-1) ?? "";
  const title = name.replace(/\.[^.]+$/, "") || name;

  if (ext === "pdf" || mimeType === "application/pdf" || startsWith(data, "%PDF")) {
    // unpdf (PDF.js) sahifalarni alohida qaytaradi — iqtibosda sahifa raqami ko'rsatiladi.
    const { text, totalPages } = await extractText(new Uint8Array(data), { mergePages: false });
    const sections = text.map((t, i) => ({ text: cleanup(t), locator: { page: i + 1 } })).filter((s) => s.text.length > 0);
    const chars = sections.reduce((n, s) => n + s.text.length, 0);
    if (chars < MIN_CHARS_PER_PAGE * Math.max(1, totalPages)) throw new NeedsOcrError("pdf", "application/pdf", totalPages, title);
    return { type: "pdf", title, sections };
  }

  if (ext === "docx" || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(data) });
    return { type: "doc", title, sections: [{ text: cleanup(value), locator: {} }] };
  }

  if (["txt", "md", "markdown", "csv"].includes(ext) || mimeType.startsWith("text/")) {
    return { type: "text", title, sections: [{ text: cleanup(new TextDecoder().decode(data)), locator: {} }] };
  }

  const image = IMAGE_TYPES[ext] ?? (Object.values(IMAGE_TYPES) as string[]).find((t) => t === mimeType);
  if (image) throw new NeedsOcrError("image", image, 1, title);

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
