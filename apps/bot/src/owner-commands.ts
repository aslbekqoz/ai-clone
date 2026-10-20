// Egasi o'z Telegram chatidan bot orqali suhbatlarni boshqaradi:
//   /reply <suhbat-id> <matn>   — foydalanuvchiga o'z nomidan javob yozish (suhbat inson rejimiga o'tadi)
//   /takeover <suhbat-id>       — suhbatni qo'lga olish (bot jim turadi)
//   /bot <suhbat-id>            — suhbatni klonga qaytarish
//   /sync <kanal-id>            — kanal postlarini bilimga avtomatik qo'shish (bot kanal admini bo'lishi kerak)
//   /unsync                     — sinxronlashni to'xtatish

export type OwnerCommand =
  | { kind: "reply"; conversationId: string; text: string }
  | { kind: "takeover"; conversationId: string }
  | { kind: "bot"; conversationId: string }
  | { kind: "sync"; chatId: string }
  | { kind: "unsync" };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function parseOwnerCommand(text: string): OwnerCommand | null {
  const reply = text.match(new RegExp(`^/reply(?:@\\w+)?\\s+(${UUID})\\s+([\\s\\S]+)$`, "i"));
  if (reply) return { kind: "reply", conversationId: reply[1]!.toLowerCase(), text: reply[2]!.trim() };
  const mode = text.match(new RegExp(`^/(takeover|bot)(?:@\\w+)?\\s+(${UUID})\\s*$`, "i"));
  if (mode) return { kind: mode[1]!.toLowerCase() as "takeover" | "bot", conversationId: mode[2]!.toLowerCase() };
  const sync = text.match(/^\/sync(?:@\w+)?\s+(-100\d{5,15})\s*$/i);
  if (sync) return { kind: "sync", chatId: sync[1]! };
  if (/^\/unsync(?:@\w+)?\s*$/i.test(text)) return { kind: "unsync" };
  return null;
}

/** Eskalatsiya haqida egasiga yuboriladigan xabar. */
export function escalationNotice(opts: { conversationId: string; userName: string; message: string; reasons: string[]; leadCaptured: boolean }): string {
  const reasons: Record<string, string> = {
    human_requested: "inson bilan gaplashmoqchi",
    purchase_intent: "sotib olish niyati",
    complaint: "shikoyat",
    sensitive_topic: "nozik mavzu",
    self_harm: "⚠️ xavfli holat",
    unanswerable: "klon javob topa olmadi",
    llm_unavailable: "⚠️ AI vaqtincha ishlamayapti — javobni siz bering",
    human_mode: "suhbat sizning qo'lingizda",
  };
  const why = (opts.reasons.length ? opts.reasons : ["unanswerable"]).map((r) => reasons[r] ?? r).join(", ");
  return [
    `🔔 ${opts.leadCaptured ? "Yangi lid · " : ""}${why}`,
    `👤 ${opts.userName}`,
    `💬 ${opts.message.slice(0, 500)}`,
    "",
    `Javob: /reply ${opts.conversationId} <matn>`,
    `Qo'lga olish: /takeover ${opts.conversationId}`,
  ].join("\n");
}
