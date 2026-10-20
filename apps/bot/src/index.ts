// Ishga tushirish:  TELEGRAM_BOT_TOKEN=... CLONE_SLUG=dilnoza-demo pnpm dev:bot
// Lokal ishlab chiqish uchun long polling; prod'da webhook (bot.api.setWebhook) ishlatiladi.
import { createRuntime, migrate } from "@ai-clone/db";
import { createBot } from "./bot.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
const slug = process.env.CLONE_SLUG;
if (!token || !slug) {
  console.error("TELEGRAM_BOT_TOKEN va CLONE_SLUG o'rnatilishi kerak (BotFather'dan token oling).");
  process.exit(1);
}

const rt = createRuntime();
await migrate(rt.db);
const target = await rt.service.resolveSlug(slug);
if (!target) {
  console.error(`"${slug}" kloni topilmadi. Avval: pnpm seed`);
  process.exit(1);
}
const clone = (await rt.service.getClone(target.tenantId, target.cloneId))!;

const bot = createBot(rt.service, { token, tenantId: target.tenantId, clone, voice: rt.voice, ...(rt.stt ? { stt: rt.stt } : {}) });
await bot.api.setMyCommands([
  { command: "start", description: "Boshlash" },
  { command: "forget", description: "Mening ma'lumotlarimni o'chirish" },
]);
console.log(`🤖 ${clone.persona.name} kloni Telegramda ishlamoqda (LLM: ${rt.llm}, ovoz: ${rt.stt ? rt.stt.id : "o'chiq"})`);
await bot.start({ allowed_updates: ["message", "channel_post", "edited_channel_post", "my_chat_member"] });
