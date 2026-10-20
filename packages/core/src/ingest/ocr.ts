import Anthropic from "@anthropic-ai/sdk";
import type { Section } from "./files.js";

// Skanerlangan PDF va rasmlardan matn olish (OCR). Claude PDF sahifalarini rasm sifatida ko'radi,
// shuning uchun matn qatlami yo'q hujjatlar ham o'qiladi. Natija sahifalar bo'yicha qaytadi —
// iqtibosda sahifa raqami saqlanadi.

export interface DocumentOcr {
  ocrPdf(data: Uint8Array): Promise<Section[]>;
  ocrImage(data: Uint8Array, mimeType: "image/png" | "image/jpeg" | "image/webp"): Promise<Section[]>;
}

/** Bitta so'rovda o'qiladigan sahifalar chegarasi (javob uzunligi va narx uchun). */
export const MAX_OCR_PAGES = 40;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["pages"],
  properties: {
    pages: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["page", "text"], properties: { page: { type: "integer" }, text: { type: "string" } } },
    },
  },
} as const;

const PROMPT = `Hujjatdagi barcha matnni har bir sahifa uchun alohida, aynan qanday yozilgan bo'lsa shunday ko'chir (o'zbek lotin, kirill, rus yoki ingliz).
- Tarjima qilma, qisqartirma, izoh qo'shma.
- Paragraflarni bo'sh qator bilan ajrat; jadvallarni "ustun | ustun" ko'rinishida yoz.
- Sarlavha, sahifa raqami va kolontitullarni tashlab ket.
- Matni yo'q sahifa uchun text bo'sh bo'lsin.`;

export class OcrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcrError";
  }
}

export class ClaudeOcr implements DocumentOcr {
  private readonly client: Anthropic;

  constructor(
    opts: { apiKey?: string } = {},
    private readonly model = "claude-opus-5-5",
  ) {
    this.client = new Anthropic({ ...(opts.apiKey ? { apiKey: opts.apiKey } : {}), timeout: 10 * 60_000 });
  }

  async ocrPdf(data: Uint8Array): Promise<Section[]> {
    return this.run({ type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(data).toString("base64") } });
  }

  async ocrImage(data: Uint8Array, mimeType: "image/png" | "image/jpeg" | "image/webp"): Promise<Section[]> {
    return this.run({ type: "image", source: { type: "base64", media_type: mimeType, data: Buffer.from(data).toString("base64") } });
  }

  private async run(block: Anthropic.Beta.BetaContentBlockParam): Promise<Section[]> {
    // Uzun javob bo'lishi mumkin — streaming (HTTP timeoutlarsiz); rad etilsa server zaxira modelga o'tadi.
    const message = await this.client.beta.messages
      .stream({
        model: this.model,
        max_tokens: 64_000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
        messages: [{ role: "user", content: [block, { type: "text", text: PROMPT }] }],
      })
      .finalMessage();
    if (message.stop_reason === "refusal") throw new OcrError("Model hujjatni o'qishni rad etdi");
    if (message.stop_reason === "max_tokens") throw new OcrError(`Hujjat juda katta — ${MAX_OCR_PAGES} betgacha bo'lib yuklang`);
    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return parseOcrJson(text);
  }
}

/** Model javobidan bo'limlarni ajratadi (bo'sh sahifalar tashlanadi). */
export function parseOcrJson(text: string): Section[] {
  let data: { pages?: { page?: number; text?: string }[] };
  try {
    data = JSON.parse(text);
  } catch {
    throw new OcrError("OCR javobi JSON emas");
  }
  return (data.pages ?? [])
    .filter((p) => typeof p.text === "string" && p.text.trim().length > 0)
    .map((p, i) => ({ text: p.text!.trim(), locator: { page: Number.isInteger(p.page) ? p.page! : i + 1 } }));
}
