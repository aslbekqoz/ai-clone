export interface ChunkOptions {
  /** Maqsadli chunk hajmi tokenlarda (taxminan 4 belgi = 1 token). */
  targetTokens?: number;
  /** Qo'shni chunklar orasidagi ustma-ustlik ulushi. */
  overlap?: number;
  /** Shu hajmdan kichik bloklar keyingisi bilan birlashtiriladi. */
  minTokens?: number;
}

export interface TextChunk {
  ord: number;
  text: string;
}

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Strukturaga mos bo'laklash: avval bo'sh qatorlar bo'yicha bloklarga (paragraf, ro'yxat,
 * jadval) ajratiladi, bloklar maqsadli hajmgacha yig'iladi. Haddan tashqari katta blok
 * gaplarga bo'linadi. Ro'yxat va jadval qatorlari bitta blok ichida qoladi.
 */
export function chunkText(text: string, opts: ChunkOptions = {}): TextChunk[] {
  const target = (opts.targetTokens ?? 500) * CHARS_PER_TOKEN;
  const overlap = Math.floor(target * (opts.overlap ?? 0.15));
  const min = (opts.minTokens ?? 80) * CHARS_PER_TOKEN;

  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .flatMap((b) => (b.length > target ? splitSentences(b, target) : [b]));

  const chunks: string[] = [];
  let current = "";
  for (const block of blocks) {
    if (current && current.length + block.length + 2 > target) {
      chunks.push(current);
      current = tail(current, overlap);
    }
    current = current ? `${current}\n\n${block}` : block;
  }
  if (current) {
    const last = chunks.at(-1);
    if (last !== undefined && current.length < min && last.length + current.length <= target * 1.5) {
      chunks[chunks.length - 1] = `${last}\n\n${current}`;
    } else {
      chunks.push(current);
    }
  }
  return chunks.map((t, ord) => ({ ord, text: t }));
}

function splitSentences(block: string, max: number): string[] {
  const sentences = block.match(/[^.!?…\n]+[.!?…]*\s*/g) ?? [block];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && cur.length + s.length > max) {
      out.push(cur.trim());
      cur = "";
    }
    if (s.length > max) {
      for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max).trim());
      continue;
    }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Ustma-ustlik uchun oxirgi qismni so'z chegarasida kesib oladi. */
function tail(text: string, size: number): string {
  if (size <= 0 || text.length <= size) return "";
  const slice = text.slice(text.length - size);
  const space = slice.indexOf(" ");
  return space >= 0 ? slice.slice(space + 1) : slice;
}
