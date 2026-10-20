// Kuzatuv: Prometheus formatidagi metrikalar (tashqi kutubxonasiz) va JSON loglar.
import { randomUUID } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { matchedRoutes } from "hono/route";

type Labels = Record<string, string>;

const key = (labels: Labels) =>
  Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`)
    .join(",");

class Counter {
  private readonly values = new Map<string, number>();
  constructor(
    readonly name: string,
    readonly help: string,
  ) {}
  inc(labels: Labels = {}, by = 1): void {
    const k = key(labels);
    this.values.set(k, (this.values.get(k) ?? 0) + by);
  }
  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const [k, v] of this.values) lines.push(`${this.name}${k ? `{${k}}` : ""} ${v}`);
    return lines.join("\n");
  }
}

class Histogram {
  private readonly series = new Map<string, { buckets: number[]; sum: number; count: number }>();
  constructor(
    readonly name: string,
    readonly help: string,
    private readonly bounds = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  ) {}
  observe(labels: Labels, value: number): void {
    const k = key(labels);
    let s = this.series.get(k);
    if (!s) this.series.set(k, (s = { buckets: this.bounds.map(() => 0), sum: 0, count: 0 }));
    this.bounds.forEach((b, i) => {
      if (value <= b) s!.buckets[i]!++;
    });
    s.sum += value;
    s.count++;
  }
  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const [k, s] of this.series) {
      const pre = k ? `${k},` : "";
      this.bounds.forEach((b, i) => lines.push(`${this.name}_bucket{${pre}le="${b}"} ${s.buckets[i]}`));
      lines.push(`${this.name}_bucket{${pre}le="+Inf"} ${s.count}`, `${this.name}_sum${k ? `{${k}}` : ""} ${s.sum}`, `${this.name}_count${k ? `{${k}}` : ""} ${s.count}`);
    }
    return lines.join("\n");
  }
}

export class Metrics {
  readonly httpRequests = new Counter("aiclone_http_requests_total", "HTTP so'rovlar soni");
  readonly httpDuration = new Histogram("aiclone_http_request_duration_seconds", "HTTP javob vaqti");

  render(extra: string[] = []): string {
    return [this.httpRequests.render(), this.httpDuration.render(), ...extra].join("\n\n") + "\n";
  }
}

/** Bazadan o'qiladigan o'lchovlar (navbat, xarajat) — har bir scrape'da. */
export function gauge(name: string, help: string, rows: { labels?: Labels; value: number }[]): string {
  const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} gauge`];
  for (const r of rows) {
    const k = key(r.labels ?? {});
    lines.push(`${name}${k ? `{${k}}` : ""} ${r.value}`);
  }
  return lines.join("\n");
}

export type LogLevel = "info" | "warn" | "error";

/** Prod'da bir qatorli JSON (log yig'uvchilar uchun), lokal ishlab chiqishda o'qiladigan matn. */
export function log(level: LogLevel, msg: string, fields: Record<string, unknown> = {}): void {
  const out = process.env.NODE_ENV === "production" ? JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields }) : `${level === "info" ? "" : `[${level}] `}${msg} ${Object.keys(fields).length ? JSON.stringify(fields) : ""}`.trim();
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(out);
}

/** Mos kelgan marshrut shabloni (masalan, /v1/clones/:id/chat) — metrika belgilari cheksiz ko'paymasligi uchun. */
function routeOf(c: Context): string {
  const handlers = matchedRoutes(c).filter((r) => r.method !== "ALL");
  return handlers.at(-1)?.path ?? "unmatched";
}

/**
 * Har bir so'rov: X-Request-Id (kelgan bo'lsa — o'sha, aks holda yangi), metrikalar va kirish logi.
 * Logda query satri yozilmaydi: unda tashrifchi ID'si yoki tokenlar bo'lishi mumkin.
 */
export function observe(metrics: Metrics, opts: { logRequests?: boolean } = {}): MiddlewareHandler<{ Variables: { requestId: string } }> {
  return async (c, next) => {
    const incoming = c.req.header("x-request-id");
    const requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    c.set("requestId", requestId);
    const start = performance.now();
    await next();
    const seconds = (performance.now() - start) / 1000;
    const route = routeOf(c);
    const status = c.res.status;
    metrics.httpRequests.inc({ method: c.req.method, route, status: String(status) });
    metrics.httpDuration.observe({ route }, seconds);
    c.res.headers.set("x-request-id", requestId);
    if (opts.logRequests && route !== "/health")
      log(status >= 500 ? "error" : "info", "http", { requestId, method: c.req.method, route, path: c.req.path, status, ms: Math.round(seconds * 1000) });
  };
}
