import { transliterateUzCyrillic } from "@ai-clone/core";
import { withTenant, type Db } from "./pool.js";

export const CATEGORIES = {
  education: "Ta'lim",
  business: "Biznes",
  health: "Salomatlik",
  beauty: "Go'zallik",
  tech: "Texnologiya",
  creative: "Ijod",
  sport: "Sport",
  other: "Boshqa",
} as const;
export type Category = keyof typeof CATEGORIES;

export type ReportReason = "impersonation" | "harmful" | "spam" | "other";

export class MarketplaceError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 422 = 422,
  ) {
    super(message);
    this.name = "MarketplaceError";
  }
}

export interface ListingSettings {
  listed: boolean;
  category: Category | null;
  tagline: string;
  /** Admin bloklagan bo'lsa — sababi bilan. */
  blocked: { reason: string | null } | null;
}

export interface MarketplaceCard {
  slug: string;
  name: string;
  tagline: string;
  category: Category;
  languages: string[];
  /** Kamida 5 ta baho bo'lsa: ijobiy ulush (0–1) va ovozlar soni. */
  rating: { positive: number; votes: number } | null;
  conversations30d: number;
  /** Pullik kirish yoqilgan bo'lsa — eng arzon faol mahsulot narxi. */
  priceFromUzs: number | null;
}

/** Ijobiy baholar ulushining Wilson quyi chegarasi: kam ovozli klon tasodifiy 5/5 bilan tepaga chiqmaydi. */
export function wilsonLowerBound(up: number, total: number, z = 1.96): number {
  if (total <= 0) return 0;
  const p = up / total;
  const z2 = z * z;
  return (p + z2 / (2 * total) - z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) / (1 + z2 / total);
}

/** Saralash: baho (70%) + 30 kunlik suhbatlar soni logarifmik (30%). */
export function rankScore(up: number, total: number, conversations30d: number): number {
  const popularity = Math.min(1, Math.log1p(conversations30d) / Math.log(1000));
  return 0.7 * wilsonLowerBound(up, total) + 0.3 * popularity;
}

const MIN_VOTES = 5;

/**
 * Ommaviy katalog. Qidiruv barcha tenantlar bo'yicha (faqat egasi ro'yxatga qo'ygan va bloklanmagan
 * klonlar, faqat ommaviy maydonlar); sozlash va shikoyatlar alohida.
 */
export class MarketplaceService {
  constructor(private readonly db: Db) {}

  async settings(tenantId: string, cloneId: string): Promise<ListingSettings> {
    return withTenant(this.db, tenantId, async (tx) => {
      const { rows } = await tx.query<{ listed: boolean; category: Category | null; tagline: string; moderation: string; moderation_reason: string | null }>(
        "SELECT listed, category, tagline, moderation, moderation_reason FROM clones WHERE id = $1",
        [cloneId],
      );
      const r = rows[0];
      if (!r) throw new MarketplaceError("Klon topilmadi", 404);
      return { listed: r.listed, category: r.category, tagline: r.tagline, blocked: r.moderation === "blocked" ? { reason: r.moderation_reason } : null };
    });
  }

  /** Katalogga qo'yish uchun: kategoriya, qisqa tavsif va kamida bitta bilim manbai kerak. */
  async update(tenantId: string, cloneId: string, patch: { listed?: boolean; category?: Category; tagline?: string }): Promise<ListingSettings> {
    await withTenant(this.db, tenantId, async (tx) => {
      const { rows } = await tx.query<{ category: Category | null; tagline: string; sources: number }>(
        "SELECT category, tagline, (SELECT count(*)::int FROM sources s WHERE s.clone_id = c.id) AS sources FROM clones c WHERE id = $1 FOR UPDATE",
        [cloneId],
      );
      const cur = rows[0];
      if (!cur) throw new MarketplaceError("Klon topilmadi", 404);
      const category = patch.category ?? cur.category;
      const tagline = (patch.tagline ?? cur.tagline).trim();
      if (patch.listed) {
        if (!category) throw new MarketplaceError("Katalog uchun kategoriyani tanlang");
        if (tagline.length < 10) throw new MarketplaceError("Katalog uchun qisqa tavsif yozing (kamida 10 belgi)");
        if (!cur.sources) throw new MarketplaceError("Katalogga qo'yishdan oldin kamida bitta bilim manbaini yuklang");
      }
      await tx.query("UPDATE clones SET listed = COALESCE($2, listed), category = $3, tagline = $4 WHERE id = $1", [cloneId, patch.listed ?? null, category, tagline]);
    });
    return this.settings(tenantId, cloneId);
  }

  async search(opts: { q?: string; category?: Category; limit?: number; offset?: number } = {}): Promise<MarketplaceCard[]> {
    const params: unknown[] = [];
    const where = ["c.listed", "c.moderation = 'ok'"];
    if (opts.category) {
      params.push(opts.category);
      where.push(`c.category = $${params.length}`);
    }
    const q = opts.q?.trim().slice(0, 100);
    if (q) {
      const like = (s: string) => `%${s.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      params.push([...new Set([like(q), like(transliterateUzCyrillic(q))])]);
      where.push(`(c.display_name || ' ' || c.tagline || ' ' || c.bio) ILIKE ANY($${params.length})`);
    }
    const { rows } = await this.db.query<{
      slug: string;
      display_name: string;
      tagline: string;
      category: Category;
      languages: string[];
      up: number;
      votes: number;
      conversations: number;
      price_from: number | null;
    }>(
      `SELECT c.slug, c.display_name, c.tagline, c.category, c.languages,
              COALESCE(f.up, 0) AS up, COALESCE(f.votes, 0) AS votes, COALESCE(v.n, 0) AS conversations,
              CASE WHEN c.paywall_enabled THEN (SELECT min(p.price_uzs) FROM products p WHERE p.clone_id = c.id AND p.active) END AS price_from
         FROM clones c
         LEFT JOIN LATERAL (
           SELECT count(*) FILTER (WHERE fb.rating = 1)::int AS up, count(*)::int AS votes
             FROM feedback fb JOIN messages m ON m.id = fb.message_id JOIN conversations cv ON cv.id = m.conversation_id
            WHERE cv.clone_id = c.id AND fb.by_role = 'end_user' AND fb.created_at > now() - interval '90 days') f ON true
         LEFT JOIN LATERAL (
           SELECT count(*)::int AS n FROM conversations cv WHERE cv.clone_id = c.id AND cv.last_msg_at > now() - interval '30 days') v ON true
        WHERE ${where.join(" AND ")}`,
      params,
    );
    return rows
      .map((r) => ({ r, score: rankScore(r.up, r.votes, r.conversations) }))
      .sort((a, b) => b.score - a.score || a.r.display_name.localeCompare(b.r.display_name))
      .slice(opts.offset ?? 0, (opts.offset ?? 0) + Math.min(opts.limit ?? 24, 100))
      .map(({ r }) => ({
        slug: r.slug,
        name: r.display_name,
        tagline: r.tagline,
        category: r.category,
        languages: r.languages,
        rating: r.votes >= MIN_VOTES ? { positive: r.up / r.votes, votes: r.votes } : null,
        conversations30d: r.conversations,
        priceFromUzs: r.price_from,
      }));
  }

  /** Klon sahifasida "← Katalog" havolasi va shikoyat tugmasi uchun. */
  async isListed(cloneId: string): Promise<boolean> {
    const { rows } = await this.db.query("SELECT 1 FROM clones WHERE id = $1 AND listed AND moderation = 'ok'", [cloneId]);
    return rows.length > 0;
  }

  /** Bitta shikoyatchi (vidjet tashrifchisi) bitta klonga bir marta. */
  async report(cloneId: string, reporter: string, reason: ReportReason, details = ""): Promise<{ created: boolean }> {
    const r = await this.db.query(
      "INSERT INTO marketplace_reports (clone_id, reporter, reason, details) VALUES ($1, $2, $3, $4) ON CONFLICT (clone_id, reporter) DO NOTHING",
      [cloneId, reporter, reason, details.slice(0, 2000)],
    );
    return { created: (r.rowCount ?? 0) > 0 };
  }

  async openReports(limit = 100) {
    const { rows } = await this.db.query<{ id: string; clone_id: string; slug: string; reason: ReportReason; details: string; created_at: Date; total: number }>(
      `SELECT r.id, r.clone_id, c.slug, r.reason, r.details, r.created_at,
              count(*) OVER (PARTITION BY r.clone_id)::int AS total
         FROM marketplace_reports r JOIN clones c ON c.id = r.clone_id
        WHERE NOT r.resolved ORDER BY total DESC, r.created_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({ id: r.id, cloneId: r.clone_id, slug: r.slug, reason: r.reason, details: r.details, createdAt: r.created_at, reportsForClone: r.total }));
  }

  /** Admin: bloklash katalogdan olib tashlaydi; ochiq shikoyatlar yopiladi. */
  async moderate(cloneId: string, status: "ok" | "blocked", reason?: string): Promise<boolean> {
    const r = await this.db.query("UPDATE clones SET moderation = $2, moderation_reason = $3 WHERE id = $1", [cloneId, status, status === "blocked" ? (reason ?? null) : null]);
    if (!r.rowCount) return false;
    await this.db.query("UPDATE marketplace_reports SET resolved = true WHERE clone_id = $1 AND NOT resolved", [cloneId]);
    return true;
  }
}
