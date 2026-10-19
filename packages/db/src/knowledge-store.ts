import { tokenize, type Exemplar, type KnowledgeStore, type SearchHit, type VerifiedAnswer } from "@ai-clone/core";
import { toVector, withTenant, type Db, type Tx } from "./pool.js";

interface ChunkRow {
  id: string;
  source_id: string;
  title: string;
  text_original: string;
  locator: SearchHit["locator"];
  score: number;
}

const toHit = (r: ChunkRow): SearchHit => ({
  chunkId: r.id,
  documentId: r.source_id,
  title: r.title,
  text: r.text_original,
  locator: r.locator,
  score: Number(r.score),
});

/**
 * Postgres + pgvector bilim ombori. Har bir so'rov o'zining qisqa tenant tranzaksiyasida (RLS):
 * LLM chaqiruvi davomida ulanish band bo'lib turmaydi.
 */
export class PgKnowledgeStore implements KnowledgeStore {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  private q<T extends object>(sql: string, params: unknown[]): Promise<T[]> {
    return withTenant(this.db, this.tenantId, async (tx: Tx) => (await tx.query<T>(sql, params)).rows);
  }

  async vectorSearch(cloneId: string, embedding: number[], k: number): Promise<SearchHit[]> {
    const rows = await this.q<ChunkRow>(
      `SELECT id, source_id, title, text_original, locator, 1 - (embedding <=> $2::vector) AS score
         FROM chunks WHERE clone_id = $1
         ORDER BY embedding <=> $2::vector LIMIT $3`,
      [cloneId, toVector(embedding), k],
    );
    return rows.map(toHit);
  }

  /**
   * Kalit so'z qidiruvi: `simple` tsvector (Postgres'da o'zbek stemmeri yo'q) OR-so'rov bilan,
   * qo'shimcha ravishda pg_trgm word_similarity — imlo xatolari va qo'shimchalar uchun.
   */
  async keywordSearch(cloneId: string, normalizedQuery: string, k: number): Promise<SearchHit[]> {
    const terms = [...new Set(tokenize(normalizedQuery).filter((t) => t.length > 2))].map((t) => t.replace(/'/g, "''"));
    if (terms.length === 0) return [];
    const tsquery = terms.map((t) => `'${t}':*`).join(" | ");
    const rows = await this.q<ChunkRow>(
      `SELECT id, source_id, title, text_original, locator,
              ts_rank_cd(tsv, to_tsquery('simple', $2)) + 0.5 * word_similarity($3, text_norm) AS score
         FROM chunks
        WHERE clone_id = $1 AND (tsv @@ to_tsquery('simple', $2) OR $3 <% text_norm)
        ORDER BY score DESC LIMIT $4`,
      [cloneId, tsquery, normalizedQuery, k],
    );
    return rows.map(toHit);
  }

  async findVerifiedAnswer(cloneId: string, embedding: number[], minSimilarity: number): Promise<VerifiedAnswer | null> {
    const rows = await this.q<{ question: string; answer: string; similarity: number }>(
      `SELECT question, answer, 1 - (embedding <=> $2::vector) AS similarity
         FROM verified_answers WHERE clone_id = $1
         ORDER BY embedding <=> $2::vector LIMIT 1`,
      [cloneId, toVector(embedding)],
    );
    const row = rows[0];
    return row && Number(row.similarity) >= minSimilarity ? { question: row.question, answer: row.answer, similarity: Number(row.similarity) } : null;
  }

  async findExemplars(cloneId: string, embedding: number[], k: number): Promise<Exemplar[]> {
    return this.q<Exemplar>(`SELECT question, answer FROM exemplars WHERE clone_id = $1 ORDER BY embedding <=> $2::vector LIMIT $3`, [cloneId, toVector(embedding), k]);
  }
}
