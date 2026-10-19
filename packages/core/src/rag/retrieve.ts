import type { Embedder, SimilarityThresholds } from "../embed/embedder.js";
import { detectLang } from "../text/lang.js";
import { normalizeForSearch } from "../text/normalize.js";
import type { KnowledgeStore, SearchHit, VerifiedAnswer } from "./types.js";

/** Reciprocal Rank Fusion: bir nechta reytingni ballarni kalibrlamasdan birlashtiradi. */
export function reciprocalRankFusion(lists: SearchHit[][], k = 60): SearchHit[] {
  const fused = new Map<string, { hit: SearchHit; score: number }>();
  for (const list of lists) {
    list.forEach((hit, rank) => {
      const entry = fused.get(hit.chunkId);
      const add = 1 / (k + rank + 1);
      if (entry) entry.score += add;
      else fused.set(hit.chunkId, { hit, score: add });
    });
  }
  return [...fused.values()].sort((a, b) => b.score - a.score).map((e) => ({ ...e.hit, score: e.score }));
}

/** Ixtiyoriy cross-encoder reranker (Cohere, bge-reranker). Yo'q bo'lsa RRF tartibi saqlanadi. */
export interface Reranker {
  rerank(query: string, docs: string[], topN: number): Promise<{ index: number; score: number }[]>;
}

export interface RetrieveOptions extends SimilarityThresholds {
  candidates?: number;
  topK?: number;
  reranker?: Reranker;
}

export interface Retrieval {
  hits: SearchHit[];
  verified: VerifiedAnswer | null;
  /** Kamida bitta ishonchli manba topildimi. */
  answerable: boolean;
  /** Eng yaxshi vektor o'xshashligi — kuzatuv va baholash uchun. */
  confidence: number;
  queryEmbedding: number[];
}

export async function retrieve(
  store: KnowledgeStore,
  embedder: Embedder,
  cloneId: string,
  query: string,
  opts: RetrieveOptions,
): Promise<Retrieval> {
  const candidates = opts.candidates ?? 40;
  const topK = opts.topK ?? 6;
  const normalized = normalizeForSearch(query, detectLang(query));
  const [queryEmbedding] = await embedder.embed([normalized], "query");
  if (!queryEmbedding) throw new Error("Embedder bo'sh natija qaytardi");

  const [vector, keyword, verified] = await Promise.all([
    store.vectorSearch(cloneId, queryEmbedding, candidates),
    store.keywordSearch(cloneId, normalized, candidates),
    store.findVerifiedAnswer(cloneId, queryEmbedding, opts.verifiedAnswerSimilarity),
  ]);

  const confidence = vector[0]?.score ?? 0;
  const trustedVector = vector.filter((h) => h.score >= opts.minVectorSimilarity);
  let hits = reciprocalRankFusion([trustedVector, keyword]);

  if (opts.reranker && hits.length > 0) {
    const pool = hits.slice(0, 30);
    const ranked = await opts.reranker.rerank(query, pool.map((h) => h.text), topK);
    hits = ranked.flatMap((r) => {
      const h = pool[r.index];
      return h ? [{ ...h, score: r.score }] : [];
    });
  }

  hits = hits.slice(0, topK);
  return { hits, verified, answerable: hits.length > 0 || verified !== null, confidence, queryEmbedding };
}
