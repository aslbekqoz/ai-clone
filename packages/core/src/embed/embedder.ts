import { normalizeForSearch, tokenize } from "../text/normalize.js";

export interface SimilarityThresholds {
  /** Shu kosinusdan past vektor natijasi ishonchsiz hisoblanadi. */
  minVectorSimilarity: number;
  /** Tasdiqlangan javob qo'llanishi uchun minimal o'xshashlik. */
  verifiedAnswerSimilarity: number;
}

export interface Embedder {
  readonly model: string;
  readonly dims: number;
  /** Kosinus shkalasi har bir modelda boshqacha — chegaralar golden set bo'yicha sozlanadi. */
  readonly thresholds: SimilarityThresholds;
  embed(texts: string[], kind: "query" | "doc"): Promise<number[][]>;
}

export const EMBEDDING_DIMS = 1024;

/**
 * Oflayn, deterministik embedder: so'zlar va belgi trigrammalari "feature hashing" bilan
 * 1024 o'lchamga joylanadi. Semantik sifati past, lekin API kalitisiz ishlab chiqish,
 * testlar va demo uchun yetarli. Prod'da TeiEmbedder (BGE-M3) yoki boshqariladigan API.
 */
export class HashingEmbedder implements Embedder {
  readonly model = "hashing-v1";
  readonly dims = EMBEDDING_DIMS;
  readonly thresholds = { minVectorSimilarity: 0.15, verifiedAnswerSimilarity: 0.6 };

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.embedOne(t));
  }

  private embedOne(text: string): number[] {
    const vec = new Array<number>(this.dims).fill(0);
    const words = tokenize(normalizeForSearch(text));
    for (const w of words) {
      add(vec, `w:${w}`, 1);
      const padded = ` ${w} `;
      for (let i = 0; i + 3 <= padded.length; i++) add(vec, `t:${padded.slice(i, i + 3)}`, 0.5);
    }
    const norm = Math.hypot(...vec) || 1;
    return vec.map((v) => v / norm);
  }
}

function add(vec: number[], feature: string, weight: number): void {
  const h = fnv1a(feature);
  const idx = h % vec.length;
  vec[idx] = (vec[idx] ?? 0) + (h & 0x80000000 ? -weight : weight);
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * HuggingFace text-embeddings-inference serveri (masalan, BGE-M3 o'z GPU serverimizda —
 * biometrik bo'lmagan, lekin UZ ichida qolishi kerak bo'lgan ma'lumotlar uchun suveren variant).
 */
export class TeiEmbedder implements Embedder {
  readonly dims = EMBEDDING_DIMS;
  readonly thresholds = { minVectorSimilarity: 0.35, verifiedAnswerSimilarity: 0.88 };
  constructor(
    private readonly baseUrl: string,
    readonly model = "bge-m3",
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inputs: texts, normalize: true, truncate: true }),
    });
    if (!res.ok) throw new Error(`TEI embed failed: ${res.status} ${await res.text()}`);
    const out = (await res.json()) as number[][];
    if (out[0] && out[0].length !== this.dims) {
      throw new Error(`Embedding o'lchami ${out[0].length}, kutilgan ${this.dims}`);
    }
    return out;
  }
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
