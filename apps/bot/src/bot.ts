import { stripCitationMarkers, type SpeechToText } from "@ai-clone/core";
import type { CloneRecord, CloneService, VoiceService } from "@ai-clone/db";
import { Bot, InputFile, type ApiClientOptions, type Context } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { escalationNotice, parseOwnerCommand } from "./owner-commands.js";
import { transcribeTelegramFile, VOICE_REPLIES } from "./voice.js";

export interface BotConfig {
  token: string;
  tenantId: string;
  clone: CloneRecord;
  /** Yo'q bo'lsa, ovozli xabarlarga "yozib yuboring" deb javob beriladi. */
  stt?: SpeechToText;
  /** Egasining ovozida javob (rozilik va kvota VoiceService ichida tekshiriladi). */
  voice?: VoiceService;
  /** Testlar uchun: bot ma'lumoti (getMe chaqirilmaydi) va fayl yuklash funksiyasi. */
  botInfo?: UserFromGetMe;
  fetchFn?: typeof fetch;
  client?: ApiClientOptions;
}

const CONSENT =
  "Suhbatni davom ettirish orqali xabarlaringiz javob tayyorlash uchun qayta ishlanishiga rozilik bildirasiz. Ma'lumotlaringizni o'chirish: /forget";

/** Bitta klon uchun Telegram bot. Ko'p klonli rejimda webhook.ts har bir kanal uchun shu funksiyani chaqiradi. */
export function createBot(svc: CloneService, cfg: BotConfig): Bot {
  const bot = new Bot(cfg.token, { ...(cfg.botInfo ? { botInfo: cfg.botInfo } : {}), ...(cfg.client ? { client: cfg.client } : {}) });
  const { tenantId, clone } = cfg;
  const ownerChatId = clone.ownerTelegramChatId;
  const isOwner = (ctx: Context) => ownerChatId !== null && String(ctx.chat?.id) === ownerChatId;

  bot.command("start", (ctx) => ctx.reply(`${clone.persona.disclosure}\n\n${CONSENT}\n\nSavolingizni yozing 👇`));

  bot.command("forget", async (ctx) => {
    const removed = await svc.forgetEndUser(tenantId, clone.id, "telegram", String(ctx.from!.id));
    await ctx.reply(removed ? "✅ Suhbat tarixi va ma'lumotlaringiz o'chirildi." : "Sizga tegishli saqlangan ma'lumot yo'q.");
  });

  bot.command(["reply", "takeover", "bot"], async (ctx) => {
    if (!isOwner(ctx)) return;
    const cmd = parseOwnerCommand(ctx.message?.text ?? "");
    if (!cmd) return ctx.reply("Format: /reply <suhbat-id> <matn> · /takeover <suhbat-id> · /bot <suhbat-id>");
    try {
      if (cmd.kind === "reply") {
        await svc.setMode(tenantId, cmd.conversationId, "human");
        const dest = await svc.ownerReply(tenantId, cmd.conversationId, cmd.text);
        if (dest.channel === "telegram") await bot.api.sendMessage(dest.externalId, cmd.text);
        return ctx.reply(`✅ Yuborildi. Suhbat sizning qo'lingizda. Klonga qaytarish: /bot ${cmd.conversationId}`);
      }
      await svc.setMode(tenantId, cmd.conversationId, cmd.kind === "takeover" ? "human" : "bot");
      return ctx.reply(cmd.kind === "takeover" ? "✅ Suhbat sizda — klon jim turadi." : "✅ Suhbat klonga qaytarildi.");
    } catch (err) {
      return ctx.reply(`❌ ${(err as Error).message}`);
    }
  });

  /** Foydalanuvchi xabariga klon javobi (matn yoki ovozdan olingan matn). */
  async function answer(ctx: Context, message: string, voice?: { seconds: number }): Promise<void> {
    const from = ctx.from!;
    const userName = [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || "Foydalanuvchi";
    const out = await svc.chat(tenantId, clone.id, { channel: "telegram", externalId: String(from.id), name: userName, message, ...(voice ? { meta: { voiceSeconds: voice.seconds } } : {}) });

    if (out.reply) {
      const sources = out.citations.map((c) => (c.url ? `• ${c.title}: ${c.url}` : `• ${c.title}`));
      const text = stripCitationMarkers(out.reply);
      await ctx.reply(sources.length ? `${text}\n\n📚 Manba:\n${sources.join("\n")}` : text, { link_preview_options: { is_disabled: true } });
      if (cfg.voice) {
        // Ovoz qo'shimcha: xato bo'lsa, matnli javob baribir yetkazilgan.
        try {
          const audio = await cfg.voice.synthesizeReply(tenantId, clone.id, { conversationId: out.conversationId, text, userSentVoice: Boolean(voice) });
          if (audio) await ctx.replyWithVoice(new InputFile(audio.audio, "javob.mp3"));
        } catch (err) {
          console.error("Ovozli javob tayyorlanmadi:", (err as Error).message);
        }
      }
    }
    if (ownerChatId && (out.escalated || out.leadCaptured || out.mode !== "bot")) {
      await bot.api
        .sendMessage(ownerChatId, escalationNotice({ conversationId: out.conversationId, userName, message: voice ? `🎙 ${message}` : message, reasons: out.mode !== "bot" ? ["human_mode"] : out.escalationReasons, leadCaptured: out.leadCaptured }))
        .catch((err: unknown) => console.error("Egasiga xabar yuborilmadi:", err));
    }
  }

  bot.on(["message:voice", "message:audio", "message:video_note"], async (ctx) => {
    if (isOwner(ctx)) return;
    if (!cfg.stt) return void (await ctx.reply(VOICE_REPLIES.disabled));
    const media = ctx.message.voice ?? ctx.message.audio ?? ctx.message.video_note!;
    await ctx.replyWithChatAction("typing");
    const file = await ctx.api.getFile(media.file_id);
    if (!file.file_path) return void (await ctx.reply(VOICE_REPLIES.download_failed));
    const mimeType = "mime_type" in media && media.mime_type ? media.mime_type : ctx.message.video_note ? "video/mp4" : "audio/ogg";
    const result = await transcribeTelegramFile(cfg.stt, cfg.token, { filePath: file.file_path, mimeType, durationSec: media.duration }, cfg.fetchFn);
    if (!result.ok) return void (await ctx.reply(VOICE_REPLIES[result.reason]));
    // Foydalanuvchi nima tushunilganini ko'rsin — noto'g'ri tanilgan bo'lsa, yozib yuboradi.
    await ctx.reply(`🎙 «${result.text.slice(0, 300)}»`);
    await answer(ctx, result.text, { seconds: media.duration });
  });

  bot.on("message:text", async (ctx) => {
    if (isOwner(ctx)) return ctx.reply("Siz klon egasisiz 🙂 Boshqaruv buyruqlari: /reply, /takeover, /bot");
    await ctx.replyWithChatAction("typing");
    await answer(ctx, ctx.message.text);
  });

  bot.catch((err) => {
    console.error("Bot xatosi:", err.error);
    void err.ctx.reply("Kechirasiz, texnik xatolik yuz berdi. Birozdan keyin qayta urinib ko'ring.").catch(() => {});
  });

  return bot;
}
