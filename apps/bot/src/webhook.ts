import type { SpeechToText } from "@ai-clone/core";
import type { CloneService, ResolvedBot, TelegramChannels, VoiceService } from "@ai-clone/db";
import type { Bot, ApiClientOptions } from "grammy";
import type { Update, UserFromGetMe } from "grammy/types";
import { createBot } from "./bot.js";

export interface WebhookDispatcherOptions {
  stt?: SpeechToText | null;
  voice?: VoiceService | null;
  /** Testlar uchun: Telegram API so'rovlarini almashtirish. */
  client?: ApiClientOptions;
  /** Bot nusxasi shuncha vaqt keshlanadi — klon sozlamalari o'zgarsa, keyin yangilanadi. */
  cacheMs?: number;
}

/**
 * Ko'p klonli webhook: POST /telegram/<id> → shu klonning boti. Bot nusxalari keshlanadi
 * (grammY middleware'larini har so'rovda qayta qurmaslik uchun).
 */
export interface WebhookDispatcher {
  /** Sirni tekshirib, yangilanishni darhol qayta ishlaydi. false — kanal topilmadi yoki sir noto'g'ri (401). */
  (id: string, secretHeader: string | undefined, update: Update): Promise<boolean>;
  /** Sir oldin tekshirilgan (navbat worker'i). false — bot uzilgan. */
  handle(id: string, update: Update): Promise<boolean>;
}

export function createWebhookDispatcher(svc: CloneService, channels: TelegramChannels, opts: WebhookDispatcherOptions = {}): WebhookDispatcher {
  const cache = new Map<string, { bot: Bot; at: number }>();
  const ttl = opts.cacheMs ?? 60_000;

  async function run(resolved: ResolvedBot, update: Update): Promise<boolean> {
    let entry = cache.get(resolved.id);
    if (!entry || Date.now() - entry.at > ttl) {
      const clone = await svc.getClone(resolved.tenantId, resolved.cloneId);
      if (!clone) return false;
      const bot = createBot(svc, {
        token: resolved.token,
        tenantId: resolved.tenantId,
        clone,
        botInfo: resolved.botInfo as unknown as UserFromGetMe,
        ...(opts.stt ? { stt: opts.stt } : {}),
        ...(opts.voice ? { voice: opts.voice } : {}),
        ...(opts.client ? { client: opts.client } : {}),
      });
      entry = { bot, at: Date.now() };
      cache.set(resolved.id, entry);
    }
    await entry.bot.handleUpdate(update);
    return true;
  }

  const dispatch = async (id: string, secretHeader: string | undefined, update: Update) => {
    const resolved = await channels.resolveWebhook(id, secretHeader);
    return resolved ? run(resolved, update) : false;
  };
  return Object.assign(dispatch, {
    handle: async (id: string, update: Update) => {
      const resolved = await channels.resolveById(id);
      return resolved ? run(resolved, update) : false;
    },
  });
}
