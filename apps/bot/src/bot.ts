import { stripCitationMarkers } from "@ai-clone/core";
import type { CloneRecord, CloneService } from "@ai-clone/db";
import { Bot, type Context } from "grammy";
import { escalationNotice, parseOwnerCommand } from "./owner-commands.js";

export interface BotConfig {
  token: string;
  tenantId: string;
  clone: CloneRecord;
}

const CONSENT =
  "Suhbatni davom ettirish orqali xabarlaringiz javob tayyorlash uchun qayta ishlanishiga rozilik bildirasiz. Ma'lumotlaringizni o'chirish: /forget";

/** Bitta klon uchun Telegram bot. Ko'p klonli webhook marshrutlash — v1 (04-hujjat §9). */
export function createBot(svc: CloneService, cfg: BotConfig): Bot {
  const bot = new Bot(cfg.token);
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

  bot.on(["message:voice", "message:audio", "message:video_note"], (ctx) =>
    // STT (ElevenLabs Scribe / fine-tune Whisper) — MVP'ning keyingi qadami (02-hujjat F7).
    ctx.reply("🎙 Ovozli xabarlarni tez orada tushunadigan bo'laman. Hozircha savolingizni yozib yuboring, iltimos."),
  );

  bot.on("message:text", async (ctx) => {
    if (isOwner(ctx)) return ctx.reply("Siz klon egasisiz 🙂 Boshqaruv buyruqlari: /reply, /takeover, /bot");
    await ctx.replyWithChatAction("typing");
    const userName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ") || ctx.from.username || "Foydalanuvchi";
    const out = await svc.chat(tenantId, clone.id, { channel: "telegram", externalId: String(ctx.from.id), name: userName, message: ctx.message.text });

    if (out.reply) {
      const sources = out.citations.map((c) => (c.url ? `• ${c.title}: ${c.url}` : `• ${c.title}`));
      const text = stripCitationMarkers(out.reply);
      await ctx.reply(sources.length ? `${text}\n\n📚 Manba:\n${sources.join("\n")}` : text, { link_preview_options: { is_disabled: true } });
    }
    if (ownerChatId && (out.escalated || out.leadCaptured || out.mode !== "bot")) {
      await bot.api
        .sendMessage(ownerChatId, escalationNotice({ conversationId: out.conversationId, userName, message: ctx.message.text, reasons: out.mode !== "bot" ? ["human_mode"] : out.escalationReasons, leadCaptured: out.leadCaptured }))
        .catch((err: unknown) => console.error("Egasiga xabar yuborilmadi:", err));
    }
  });

  bot.catch((err) => {
    console.error("Bot xatosi:", err.error);
    void err.ctx.reply("Kechirasiz, texnik xatolik yuz berdi. Birozdan keyin qayta urinib ko'ring.").catch(() => {});
  });

  return bot;
}
