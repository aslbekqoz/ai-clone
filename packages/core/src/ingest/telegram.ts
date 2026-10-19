// Telegram Desktop eksporti (result.json) parseri: kanal postlari — bilim, egasining
// izohlardagi javoblari — uslub namunalari (savol + egasining javobi).

export interface TelegramPost {
  id: number;
  date: string;
  text: string;
}

export interface TelegramExport {
  name: string;
  posts: TelegramPost[];
  exemplars: { question: string; answer: string }[];
}

type TextEntity = string | { type: string; text: string; href?: string };

interface RawMessage {
  id: number;
  type: string;
  date: string;
  from?: string;
  from_id?: string;
  text?: string | TextEntity[];
  reply_to_message_id?: number;
}

interface RawExport {
  name?: string;
  type?: string;
  id?: number;
  messages?: RawMessage[];
}

export function flattenText(text: RawMessage["text"]): string {
  if (!text) return "";
  if (typeof text === "string") return text;
  return text.map((e) => (typeof e === "string" ? e : e.type === "text_link" && e.href ? `${e.text} (${e.href})` : e.text)).join("");
}

/**
 * @param ownerIds — egasining `from_id` qiymatlari (masalan "channel123", "user456").
 *   Kanal postlari kanalning o'z ID'si bilan keladi; guruhdagi javoblar egasining user ID'si bilan.
 */
export function parseTelegramExport(json: unknown, ownerIds: string[] = []): TelegramExport {
  const data = json as RawExport;
  if (!data || !Array.isArray(data.messages)) throw new Error("Telegram eksporti noto'g'ri: `messages` massivi topilmadi");

  const owners = new Set(ownerIds);
  if (data.type?.includes("channel") && data.id !== undefined) owners.add(`channel${data.id}`);

  const messages = data.messages.filter((m) => m.type === "message");
  const byId = new Map(messages.map((m) => [m.id, m]));
  const isOwner = (m: RawMessage) => owners.size === 0 || (m.from_id !== undefined && owners.has(m.from_id));

  const posts: TelegramPost[] = [];
  const exemplars: TelegramExport["exemplars"] = [];

  for (const m of messages) {
    const text = flattenText(m.text).trim();
    if (!text || !isOwner(m)) continue;
    const parent = m.reply_to_message_id !== undefined ? byId.get(m.reply_to_message_id) : undefined;
    if (parent && !isOwner(parent)) {
      const question = flattenText(parent.text).trim();
      if (question) exemplars.push({ question, answer: text });
      continue;
    }
    if (text.length >= 40) posts.push({ id: m.id, date: m.date, text });
  }

  return { name: data.name ?? "Telegram", posts, exemplars };
}
