import { cosine } from "../embed/embedder.js";
import { tokenize } from "../text/normalize.js";
import type { Exemplar, KnowledgeStore, Locator, SearchHit, VerifiedAnswer } from "./types.js";

interface StoredChunk {
  chunkId: string;
  documentId: string;
  cloneId: string;
  title: string;
  text: string;
  textNorm: string;
  locator: Locator;
  embedding: number[];
}

interface StoredPair extends Exemplar {
  cloneId: string;
  embedding: number[];
}

/** Xotiradagi bilim ombori: testlar va bazasiz demo uchun. Postgres omboriga o'xshab ishlaydi. */
export class MemoryKnowledgeStore implements KnowledgeStore {
  chunks: StoredChunk[] = [];
  exemplars: StoredPair[] = [];
  verified: StoredPair[] = [];

  async vectorSearch(cloneId: string, embedding: number[], k: number): Promise<SearchHit[]> {
    return this.chunks
      .filter((c) => c.cloneId === cloneId)
      .map((c) => ({ ...toHit(c), score: cosine(embedding, c.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  async keywordSearch(cloneId: string, normalizedQuery: string, k: number): Promise<SearchHit[]> {
    const terms = new Set(tokenize(normalizedQuery).filter((t) => t.length > 2));
    if (terms.size === 0) return [];
    return this.chunks
      .filter((c) => c.cloneId === cloneId)
      .map((c) => {
        const words = tokenize(c.textNorm);
        const matched = words.filter((w) => terms.has(w)).length;
        return { ...toHit(c), score: matched / Math.sqrt(words.length || 1) };
      })
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  async findVerifiedAnswer(cloneId: string, embedding: number[], minSimilarity: number): Promise<VerifiedAnswer | null> {
    let best: VerifiedAnswer | null = null;
    for (const v of this.verified.filter((x) => x.cloneId === cloneId)) {
      const similarity = cosine(embedding, v.embedding);
      if (similarity >= minSimilarity && (!best || similarity > best.similarity)) {
        best = { question: v.question, answer: v.answer, similarity };
      }
    }
    return best;
  }

  async findExemplars(cloneId: string, embedding: number[], k: number): Promise<Exemplar[]> {
    return this.exemplars
      .filter((e) => e.cloneId === cloneId)
      .map((e) => ({ e, s: cosine(embedding, e.embedding) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, k)
      .map(({ e }) => ({ question: e.question, answer: e.answer }));
  }
}

function toHit(c: StoredChunk): Omit<SearchHit, "score"> {
  return { chunkId: c.chunkId, documentId: c.documentId, title: c.title, text: c.text, locator: c.locator };
}
