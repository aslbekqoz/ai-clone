import { serve } from "@hono/node-server";
import { createRuntime, migrate, readiness, systemStats } from "@ai-clone/db";
import { createApp } from "./app.js";
import { configChecks, formatChecks } from "./preflight.js";
import { createAvatarRequester, createRuntimeWorker } from "./jobs.js";

// Prod'da xavfli konfiguratsiya bilan ishga tushmaymiz (sukut ADMIN_TOKEN, http:// manzil va h.k.). STRICT_CONFIG=0 — chetlab o'tish.
if (process.env.NODE_ENV === "production" && process.env.STRICT_CONFIG !== "0") {
  const bad = configChecks(process.env).filter((r) => r.status === "fail");
  if (bad.length) {
    console.error(`Konfiguratsiya xatolari:\n${formatChecks(bad)}\nTo'liq tekshiruv: pnpm smoke`);
    process.exit(1);
  }
}

const rt = createRuntime();
await migrate(rt.db);

// Sukut bo'yicha worker API jarayonining ichida ishlaydi; yuklama oshsa RUN_WORKER=0 qilib, `pnpm worker`ni alohida ko'paytiring.
const worker = process.env.RUN_WORKER === "0" ? null : createRuntimeWorker(rt, { concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4) });
worker?.start();

const app = createApp(rt.service, {
  ...(process.env.ADMIN_TOKEN ? { adminToken: process.env.ADMIN_TOKEN } : {}),
  ...(process.env.TELEGRAM_BOT_TOKEN ? { telegramBotToken: process.env.TELEGRAM_BOT_TOKEN } : {}),
  ...(process.env.PUBLIC_BASE_URL ? { publicBaseUrl: process.env.PUBLIC_BASE_URL } : {}),
  stt: rt.stt,
  telegram: rt.telegram,
  meta: rt.meta,
  voice: rt.voice,
  monetization: rt.monetization,
  marketplace: rt.marketplace,
  whiteLabel: rt.whiteLabel,
  avatar: { service: rt.avatar, request: rt.jobs ? createAvatarRequester(rt.avatar, rt.jobs, worker ? () => worker.notify() : undefined) : null },
  ocr: rt.ocr,
  ops: {
    readiness: () => readiness(rt.db),
    stats: () => systemStats(rt.db),
    ...(process.env.METRICS_TOKEN ? { metricsToken: process.env.METRICS_TOKEN } : {}),
    logRequests: process.env.LOG_REQUESTS !== "0",
  },
  jobs: rt.jobs ? { queue: rt.jobs, ...(worker ? { notify: () => worker.notify() } : {}) } : null,
}, rt.billing);

const port = Number(process.env.PORT ?? 8787);
const server = serve({ fetch: app.fetch, port }, () =>
  console.log(
    `AI Clone API: http://localhost:${port} (LLM: ${rt.llm}, embedder: ${rt.embedder.model}, Telegram: ${rt.telegram ? "ko'p klonli webhook" : "o'chiq"}, navbat: ${rt.jobs ? (worker ? "ichki worker" : "tashqi worker") : "o'chiq"})`,
  ),
);

const shutdown = async () => {
  server.close();
  await worker?.stop();
  await rt.db.end();
  process.exit(0);
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
