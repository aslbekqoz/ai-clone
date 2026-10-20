import { randomUUID } from "node:crypto";
import type { Db } from "./pool.js";

export interface EnqueueOptions {
  tenantId?: string;
  /** Shu kalitli vazifa allaqachon bo'lsa, yangisi yaratilmaydi (takroriy webhook). */
  singletonKey?: string;
  /** Bir guruh vazifalari navbat tartibida, bittadan bajariladi. */
  groupKey?: string;
  maxAttempts?: number;
  delayMs?: number;
  blob?: Uint8Array;
}

export interface Job<P = Record<string, unknown>> {
  id: string;
  queue: string;
  payload: P;
  blob: Uint8Array | null;
  tenantId: string | null;
  attempts: number;
  maxAttempts: number;
}

export interface JobStatus {
  id: string;
  queue: string;
  status: "queued" | "running" | "done" | "failed";
  attempts: number;
  result: unknown;
  error: string | null;
  createdAt: Date;
  finishedAt: Date | null;
}

/** Qayta urinib bo'lmaydigan xato (masalan, video subtitrsiz va STT yo'q): vazifa darhol failed bo'ladi. */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}

type JobRow = { id: string; queue: string; payload: Record<string, unknown>; blob: Buffer | null; tenant_id: string | null; attempts: number; max_attempts: number };

/**
 * Postgres ustidagi navbat (alohida broker kerak emas): FOR UPDATE SKIP LOCKED bilan bir nechta
 * worker xavfsiz ishlaydi, osilib qolgan vazifa qulf muddati tugagach qayta olinadi.
 */
export class JobQueue {
  constructor(
    private readonly db: Db,
    private readonly opts: { lockMs?: number } = {},
  ) {}

  /** null — singletonKey bo'yicha vazifa allaqachon bor. */
  async enqueue(queue: string, payload: Record<string, unknown>, o: EnqueueOptions = {}): Promise<string | null> {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO jobs (queue, payload, tenant_id, singleton_key, group_key, max_attempts, run_at, blob)
       VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(secs => $7::float8 / 1000), $8)
       ON CONFLICT (singleton_key) WHERE singleton_key IS NOT NULL DO NOTHING
       RETURNING id`,
      [queue, payload, o.tenantId ?? null, o.singletonKey ?? null, o.groupKey ?? null, o.maxAttempts ?? 5, o.delayMs ?? 0, o.blob ? Buffer.from(o.blob) : null],
    );
    return rows[0]?.id ?? null;
  }

  /**
   * Bajarishga tayyor bitta vazifani oladi. Guruhda o'zidan oldingi ochiq vazifa bo'lsa, o'tkazib yuboriladi:
   * parallel worker'lar uni qulflangan bo'lsa ham "queued" holatida ko'radi, shuning uchun tartib buzilmaydi.
   */
  async claim(queues: string[]): Promise<Job | null> {
    const { rows } = await this.db.query<JobRow>(
      `UPDATE jobs j SET status = 'running', attempts = j.attempts + 1, locked_until = now() + make_interval(secs => $2::float8 / 1000)
       WHERE j.id = (
         SELECT c.id FROM jobs c
         WHERE c.queue = ANY($1)
           AND ((c.status = 'queued' AND c.run_at <= now()) OR (c.status = 'running' AND c.locked_until < now()))
           AND (c.group_key IS NULL OR NOT EXISTS (
             SELECT 1 FROM jobs e WHERE e.group_key = c.group_key AND e.id < c.id AND e.status IN ('queued', 'running')))
         ORDER BY c.run_at, c.id
         FOR UPDATE SKIP LOCKED
         LIMIT 1)
       RETURNING j.id, j.queue, j.payload, j.blob, j.tenant_id, j.attempts, j.max_attempts`,
      [queues, this.opts.lockMs ?? 15 * 60_000],
    );
    const r = rows[0];
    return r ? { id: r.id, queue: r.queue, payload: r.payload, blob: r.blob ? new Uint8Array(r.blob) : null, tenantId: r.tenant_id, attempts: r.attempts, maxAttempts: r.max_attempts } : null;
  }

  async complete(id: string, result: unknown = null): Promise<void> {
    await this.db.query("UPDATE jobs SET status = 'done', result = $2, blob = NULL, locked_until = NULL, last_error = NULL, finished_at = now() WHERE id = $1", [id, JSON.stringify(result ?? null)]);
  }

  /** Urinishlar tugamagan bo'lsa — 2^n · 5 soniya (10 daqiqagacha) kechikish bilan qayta navbatga. */
  async fail(job: Job, err: unknown): Promise<"retry" | "failed"> {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 2000);
    if (err instanceof PermanentJobError || job.attempts >= job.maxAttempts) {
      await this.db.query("UPDATE jobs SET status = 'failed', last_error = $2, blob = NULL, locked_until = NULL, finished_at = now() WHERE id = $1", [job.id, message]);
      return "failed";
    }
    const delay = Math.min(600_000, 5_000 * 2 ** (job.attempts - 1));
    await this.db.query("UPDATE jobs SET status = 'queued', last_error = $2, locked_until = NULL, run_at = now() + make_interval(secs => $3::float8 / 1000) WHERE id = $1", [job.id, message, delay]);
    return "retry";
  }

  /** Tenant faqat o'z vazifasini ko'radi. */
  async get(tenantId: string, id: string): Promise<JobStatus | null> {
    if (!/^\d{1,18}$/.test(id)) return null;
    const { rows } = await this.db.query<{ id: string; queue: string; status: JobStatus["status"]; attempts: number; result: unknown; last_error: string | null; created_at: Date; finished_at: Date | null }>(
      "SELECT id, queue, status, attempts, result, last_error, created_at, finished_at FROM jobs WHERE id = $1 AND tenant_id = $2",
      [id, tenantId],
    );
    const r = rows[0];
    return r ? { id: r.id, queue: r.queue, status: r.status, attempts: r.attempts, result: r.result, error: r.status === "failed" ? r.last_error : null, createdAt: r.created_at, finishedAt: r.finished_at } : null;
  }

  /** Tugagan vazifalarni o'chiradi (payload'da foydalanuvchi xabarlari bor — uzoq saqlanmaydi). */
  async cleanup(olderThanMs = 7 * 24 * 3600_000): Promise<number> {
    const r = await this.db.query("DELETE FROM jobs WHERE status IN ('done', 'failed') AND finished_at < now() - make_interval(secs => $1::float8 / 1000)", [olderThanMs]);
    return r.rowCount ?? 0;
  }
}

export type JobHandler = (job: Job) => Promise<unknown>;

export interface WorkerOptions {
  concurrency?: number;
  pollMs?: number;
  onError?: (job: Job, err: unknown, outcome: "retry" | "failed") => void;
  /** Tugagan vazifalarni tozalash oralig'i; 0 — o'chiq. */
  cleanupEveryMs?: number;
}

/** Navbatdan vazifalarni olib bajaradi. start() — fon tsikli, drain() — testlar uchun: navbat bo'shaguncha. */
export class JobWorker {
  readonly id = randomUUID();
  private running = false;
  private loops: Promise<void>[] = [];
  private cleanupTimer: NodeJS.Timeout | null = null;
  private readonly waiters = new Set<() => void>();

  constructor(
    private readonly queue: JobQueue,
    private readonly handlers: Record<string, JobHandler>,
    private readonly opts: WorkerOptions = {},
  ) {}

  private get queues(): string[] {
    return Object.keys(this.handlers);
  }

  /** Bitta vazifani bajaradi; navbat bo'sh bo'lsa false. */
  async runOnce(): Promise<boolean> {
    const job = await this.queue.claim(this.queues);
    if (!job) return false;
    try {
      const result = await this.handlers[job.queue]!(job);
      await this.queue.complete(job.id, result);
    } catch (err) {
      const outcome = await this.queue.fail(job, err);
      (this.opts.onError ?? defaultOnError)(job, err, outcome);
    }
    return true;
  }

  async drain(maxJobs = 1000): Promise<number> {
    let n = 0;
    while (n < maxJobs && (await this.runOnce())) n++;
    return n;
  }

  /** Yangi vazifa qo'shilganini bildiradi — kutayotgan tsikl darhol uyg'onadi. */
  notify(): void {
    for (const w of [...this.waiters]) w();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const poll = this.opts.pollMs ?? 1000;
    const loop = async () => {
      while (this.running) {
        let worked = false;
        try {
          worked = await this.runOnce();
        } catch (err) {
          console.error("Worker: navbatni o'qib bo'lmadi", err);
        }
        if (!worked && this.running)
          await new Promise<void>((resolve) => {
            const done = () => {
              clearTimeout(timer);
              this.waiters.delete(done);
              resolve();
            };
            const timer = setTimeout(done, poll);
            this.waiters.add(done);
          });
      }
    };
    this.loops = Array.from({ length: this.opts.concurrency ?? 4 }, loop);
    const every = this.opts.cleanupEveryMs ?? 3600_000;
    if (every > 0) {
      this.cleanupTimer = setInterval(() => void this.queue.cleanup().catch((err) => console.error("Navbatni tozalab bo'lmadi", err)), every);
      this.cleanupTimer.unref();
    }
  }

  /** Joriy vazifalar tugashini kutadi (SIGTERM). */
  async stop(): Promise<void> {
    this.running = false;
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.notify();
    await Promise.all(this.loops);
  }
}

function defaultOnError(job: Job, err: unknown, outcome: "retry" | "failed") {
  console.error(`Vazifa ${job.queue}#${job.id} (${job.attempts}/${job.maxAttempts}) ${outcome === "retry" ? "qayta urinadi" : "muvaffaqiyatsiz"}:`, (err as Error)?.message ?? err);
}
