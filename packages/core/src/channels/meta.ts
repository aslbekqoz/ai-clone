import { createHmac, timingSafeEqual } from "node:crypto";

// Meta (Instagram Messaging + WhatsApp Cloud API) webhooklari uchun sof funksiyalar:
// imzo tekshiruvi va payloadni yagona "kiruvchi xabar" ko'rinishiga keltirish.

export const GRAPH_VERSION = "v26.0";

export type MetaKind = "instagram" | "whatsapp";

export interface MetaInbound {
  kind: MetaKind;
  /** Kanal identifikatori: Instagram professional akkaunt ID'si yoki WhatsApp phone_number_id. */
  accountId: string;
  /** Yuboruvchi: Instagram IGSID yoki WhatsApp telefon raqami (wa_id). */
  senderId: string;
  senderName?: string;
  /** Takroriy yetkazishni aniqlash uchun (Meta webhookni qayta yuborishi mumkin). */
  messageId: string;
  text?: string;
  /** WhatsApp ovozli xabari: media ID (Graph API orqali yuklab olinadi). */
  audioMediaId?: string;
}

/** X-Hub-Signature-256: "sha256=" + HMAC-SHA256(app_secret, xom body). */
export function verifyMetaSignature(rawBody: string, header: string | undefined, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`);
  const got = Buffer.from(header);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

interface IgPayload {
  object: "instagram";
  entry?: { id?: string; messaging?: { sender?: { id?: string }; recipient?: { id?: string }; message?: { mid?: string; text?: string; is_echo?: boolean; is_deleted?: boolean } }[] }[];
}

interface WaPayload {
  object: "whatsapp_business_account";
  entry?: {
    changes?: {
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: { from?: string; id?: string; type?: string; text?: { body?: string }; audio?: { id?: string }; voice?: { id?: string } }[];
      };
    }[];
  }[];
}

/**
 * Webhook payloadidan foydalanuvchi xabarlarini ajratadi. Echo (bizning javoblarimiz),
 * o'chirilgan xabarlar, status yangilanishlari va matnsiz xabarlar o'tkazib yuboriladi.
 */
export function parseMetaWebhook(body: unknown): MetaInbound[] {
  const out: MetaInbound[] = [];
  const obj = (body as { object?: string } | null)?.object;

  if (obj === "instagram") {
    for (const entry of (body as IgPayload).entry ?? []) {
      for (const m of entry.messaging ?? []) {
        const msg = m.message;
        if (!msg || msg.is_echo || msg.is_deleted || !msg.mid || !m.sender?.id) continue;
        const accountId = m.recipient?.id ?? entry.id;
        if (!accountId || !msg.text?.trim()) continue;
        out.push({ kind: "instagram", accountId, senderId: m.sender.id, messageId: msg.mid, text: msg.text.trim() });
      }
    }
  }

  if (obj === "whatsapp_business_account") {
    for (const entry of (body as WaPayload).entry ?? []) {
      for (const change of entry.changes ?? []) {
        const v = change.value;
        const accountId = v?.metadata?.phone_number_id;
        if (!accountId) continue;
        for (const m of v?.messages ?? []) {
          if (!m.from || !m.id) continue;
          const name = v?.contacts?.find((c) => c.wa_id === m.from)?.profile?.name;
          const base = { kind: "whatsapp" as const, accountId, senderId: m.from, messageId: m.id, ...(name ? { senderName: name } : {}) };
          if (m.type === "text" && m.text?.body?.trim()) out.push({ ...base, text: m.text.body.trim() });
          else if ((m.type === "audio" || m.type === "voice") && (m.audio?.id ?? m.voice?.id)) out.push({ ...base, audioMediaId: (m.audio?.id ?? m.voice?.id)! });
        }
      }
    }
  }
  return out;
}

/** WhatsApp `to` maydoni uchun: wa_id raqamlar bo'lib keladi, xalqaro format "+" bilan. */
export function waRecipient(waId: string): string {
  return waId.startsWith("+") ? waId : `+${waId}`;
}
