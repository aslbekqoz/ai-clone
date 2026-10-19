import type { Reranker } from "./retrieve.js";

type FetchFn = typeof fetch;

/**
 * text-embeddings-inference serveridagi cross-encoder (masalan, bge-reranker-v2-m3) —
 * o'z serverimizda, ko'p tilli, boshqariladigan rerank API'siga nisbatan arzon (04-hujjat §8).
 * POST /rerank {query, texts} → [{index, score}] (ball kamayish tartibida).
 */
export class TeiReranker implements Reranker {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async rerank(query: string, docs: string[], topN: number): Promise<{ index: number; score: number }[]> {
    if (!docs.length) return [];
    const res = await this.fetchFn(`${this.baseUrl.replace(/\/$/, "")}/rerank`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, texts: docs, truncate: true, raw_scores: false }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Rerank xatosi: ${res.status}`);
    const out = (await res.json()) as { index: number; score: number }[];
    return out
      .filter((r) => Number.isInteger(r.index) && r.index >= 0 && r.index < docs.length)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  }
}
