// Alohida worker jarayoni:  RUN_WORKER=0 pnpm dev:api  +  pnpm worker (bir nechta nusxa bo'lishi mumkin)
import { createRuntime, migrate } from "@ai-clone/db";
import { createRuntimeWorker } from "./jobs.js";

const rt = createRuntime();
await migrate(rt.db);
const worker = createRuntimeWorker(rt, { concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4) });
if (!worker) {
  console.error("JOBS=0 — navbat o'chirilgan, worker kerak emas.");
  process.exit(1);
}
worker.start();
console.log(`⚙️  Worker ishlamoqda (${worker.id}), LLM: ${rt.llm}`);

const shutdown = async () => {
  await worker.stop();
  await rt.db.end();
  process.exit(0);
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
