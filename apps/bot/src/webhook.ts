import type { SpeechToText } from "@ai-clone/core";
import type { CloneService, TelegramChannels } from "@ai-clone/db";
import type { Bot, ApiClientOptions } from "grammy";
import type { Update, UserFromGetMe } from "grammy/types";
import { createBot } from "./bot.js";

export interface WebhookDispatcherOptions {
  stt?: SpeechToText | null;
  /** Testlar uchun: Telegram API so'rovlarini almashtirish. */
  client?: ApiClientOptions;
  /** Bot nusxasi shuncha vaqt keshlanadi — klon sozlamalari o'zgarsa, keyin yangilanadi. */
  cacheMs?: number;
}

/**
 * Ko'p klonli webhook: POST /telegram/<id> → shu klonning boti. Bot nusxalari keshlanadi
 * (grammY middleware'larini har so'rovda qayta qurmaslik uchun).
 */
export function createWebhookDispatcher(svc: CloneService, channels: TelegramChannels, opts: WebhookDispatcherOptions = {}) {
  const cache = new Map<string, { bot: Bot; at: number }>();
  const ttl = opts.cacheMs ?? 60_000;

  /** false — kanal topilmadi yoki sir noto'g'ri (401 qaytariladi). */
  return async function dispatch(id: string, secretHeader: string | undefined, update: Update): Promise<boolean> {
    const resolved = await channels.resolveWebhook(id, secretHeader);
    if (!resolved) return false;
    let entry = cache.get(id);
    if (!entry || Date.now() - entry.at > ttl) {
      const clone = await svc.getClone(resolved.tenantId, resolved.cloneId);
      if (!clone) return false;
      const bot = createBot(svc, {
        token: resolved.token,
        tenantId: resolved.tenantId,
        clone,
        botInfo: resolved.botInfo as unknown as UserFromGetMe,
        ...(opts.stt ? { stt: opts.stt } : {}),
        ...(opts.client ? { client: opts.client } : {}),
      });
      entry = { bot, at: Date.now() };
      cache.set(id, entry);
    }
    await entry.bot.handleUpdate(update);
    return true;
  };
}
