import { serve } from "@hono/node-server";
import { createRuntime, migrate } from "@ai-clone/db";
import { createApp } from "./app.js";

const rt = createRuntime();
await migrate(rt.db);

const app = createApp(rt.service, {
  ...(process.env.ADMIN_TOKEN ? { adminToken: process.env.ADMIN_TOKEN } : {}),
  ...(process.env.TELEGRAM_BOT_TOKEN ? { telegramBotToken: process.env.TELEGRAM_BOT_TOKEN } : {}),
  ...(process.env.PUBLIC_BASE_URL ? { publicBaseUrl: process.env.PUBLIC_BASE_URL } : {}),
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`AI Clone API: http://localhost:${port} (LLM: ${rt.llm}, embedder: ${rt.embedder.model})`));
