import { migrationFiles } from "./migrate.js";
import type { Db } from "./pool.js";

export interface SystemStats {
  jobs: { queue: string; queued: number; running: number; failed24h: number; oldestQueuedSec: number }[];
  today: { messages: number; costUsd: number; tokensIn: number; tokensOut: number };
  avatarRendersFailed24h: number;
}

/** Monitoring uchun (barcha tenantlar bo'yicha, faqat agregatlar). */
export async function systemStats(db: Db): Promise<SystemStats> {
  const [jobs, today, avatar] = await Promise.all([
    db.query<{ queue: string; queued: number; running: number; failed: number; oldest: number }>(
      `SELECT queue,
              count(*) FILTER (WHERE status = 'queued')::int AS queued,
              count(*) FILTER (WHERE status = 'running')::int AS running,
              count(*) FILTER (WHERE status = 'failed' AND finished_at > now() - interval '24 hours')::int AS failed,
              coalesce(extract(epoch FROM now() - min(run_at) FILTER (WHERE status = 'queued' AND run_at <= now())), 0)::float8 AS oldest
         FROM jobs GROUP BY queue`,
    ),
    db.query<{ messages: number; cost: number; tin: number; tout: number }>(
      "SELECT coalesce(sum(messages), 0)::int AS messages, coalesce(sum(cost_usd), 0)::float8 AS cost, coalesce(sum(tokens_in), 0)::float8 AS tin, coalesce(sum(tokens_out), 0)::float8 AS tout FROM usage_ledger WHERE day = current_date",
    ),
    db.query<{ n: number }>("SELECT count(*)::int AS n FROM avatar_renders WHERE status = 'failed' AND finished_at > now() - interval '24 hours'"),
  ]);
  const t = today.rows[0]!;
  return {
    jobs: jobs.rows.map((r) => ({ queue: r.queue, queued: r.queued, running: r.running, failed24h: r.failed, oldestQueuedSec: Math.round(r.oldest) })),
    today: { messages: t.messages, costUsd: t.cost, tokensIn: t.tin, tokensOut: t.tout },
    avatarRendersFailed24h: avatar.rows[0]!.n,
  };
}

/** Readiness: baza javob beradi va barcha migratsiyalar qo'llangan. */
export async function readiness(db: Db): Promise<{ ok: boolean; db: boolean; migrations: number; expected: number }> {
  const expectedMigrations = (await migrationFiles()).length;
  try {
    const { rows } = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM schema_migrations");
    return { ok: rows[0]!.n >= expectedMigrations, db: true, migrations: rows[0]!.n, expected: expectedMigrations };
  } catch {
    return { ok: false, db: false, migrations: 0, expected: expectedMigrations };
  }
}
