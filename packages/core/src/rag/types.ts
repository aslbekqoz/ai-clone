export interface Locator {
  url?: string;
  page?: number;
  /** Video/audio ichidagi vaqt (soniya). */
  ts?: number;
  /** Telegram post sanasi yoki ID'si. */
  post?: string;
}

export interface SearchHit {
  chunkId: string;
  documentId: string;
  title: string;
  text: string;
  locator: Locator;
  /** Vektor qidiruvda kosinus o'xshashlik; kalit so'z qidiruvda rank balli. */
  score: number;
}

export interface Exemplar {
  question: string;
  answer: string;
}

export interface VerifiedAnswer extends Exemplar {
  similarity: number;
}

/** Bilim ombori: Postgres (packages/db) yoki xotiradagi (testlar) amalga oshirish. */
export interface KnowledgeStore {
  vectorSearch(cloneId: string, embedding: number[], k: number): Promise<SearchHit[]>;
  keywordSearch(cloneId: string, normalizedQuery: string, k: number): Promise<SearchHit[]>;
  findVerifiedAnswer(cloneId: string, embedding: number[], minSimilarity: number): Promise<VerifiedAnswer | null>;
  findExemplars(cloneId: string, embedding: number[], k: number): Promise<Exemplar[]>;
}
