import { GRAPH_VERSION, waRecipient, type MetaKind } from "@ai-clone/core";
import { decryptSecret, encryptSecret } from "./crypto.js";
import { withTenant, type Db } from "./pool.js";

type FetchFn = typeof fetch;

export class MetaConnectError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 | 502 = 400,
  ) {
    super(message);
    this.name = "MetaConnectError";
  }
}

export interface ResolvedMetaChannel {
  id: string;
  tenantId: string;
  cloneId: string;
  kind: MetaKind;
  accountId: string;
  token: string;
}

const HOST: Record<MetaKind, string> = { instagram: "https://graph.instagram.com", whatsapp: "https://graph.facebook.com" };

/**
 * Instagram (Instagram API with Instagram Login) va WhatsApp Cloud API kanallari.
 * Ulashda token Graph API'da tekshiriladi va shifrlanib saqlanadi; tokenlar API javobida qaytmaydi.
 */
export class MetaChannels {
  constructor(
    private readonly db: Db,
    private readonly key: Buffer,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  private async graph<T>(kind: MetaKind, path: string, token: string, init: { method?: "GET" | "POST" | "DELETE"; body?: unknown } = {}): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchFn(`${HOST[kind]}/${GRAPH_VERSION}/${path}`, {
        method: init.method ?? "GET",
        headers: { authorization: `Bearer ${token}`, ...(init.body ? { "content-type": "application/json" } : {}) },
        ...(init.body ? { body: JSON.stringify(init.body) } : {}),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new MetaConnectError("Meta Graph API'ga ulanib bo'lmadi", 502);
    }
    const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
    if (!res.ok || data.error) {
      if (res.status === 400 || res.status === 401 || data.error?.code === 190) throw new MetaConnectError(`Token yoki ID noto'g'ri: ${data.error?.message ?? res.status}`);
      throw new MetaConnectError(`Meta: ${data.error?.message ?? res.status}`, 502);
    }
    return data;
  }

  async connectInstagram(tenantId: string, cloneId: string, accessToken: string): Promise<{ label: string }> {
    const token = accessToken.trim();
    // user_id — webhookdagi recipient.id bilan bir xil bo'lgan professional akkaunt ID'si (id emas).
    const me = await this.graph<{ user_id?: string; username?: string }>("instagram", "me?fields=user_id,username", token);
    if (!me.user_id) throw new MetaConnectError("Bu Instagram professional akkaunt tokeni emas");
    await this.graph("instagram", "me/subscribed_apps?subscribed_fields=messages", token, { method: "POST" });
    return this.save(tenantId, cloneId, "instagram", me.user_id, `@${me.username ?? me.user_id}`, token);
  }

  async connectWhatsApp(tenantId: string, cloneId: string, phoneNumberId: string, accessToken: string): Promise<{ label: string }> {
    const token = accessToken.trim();
    if (!/^\d{5,20}$/.test(phoneNumberId)) throw new MetaConnectError("phone_number_id raqamlardan iborat bo'lishi kerak");
    const info = await this.graph<{ display_phone_number?: string; verified_name?: string }>("whatsapp", `${phoneNumberId}?fields=display_phone_number,verified_name`, token);
    const label = [info.verified_name, info.display_phone_number].filter(Boolean).join(" · ") || phoneNumberId;
    return this.save(tenantId, cloneId, "whatsapp", phoneNumberId, label, token);
  }

  private async save(tenantId: string, cloneId: string, kind: MetaKind, accountId: string, label: string, token: string): Promise<{ label: string }> {
    const own = await withTenant(this.db, tenantId, async (tx) => (await tx.query("SELECT 1 FROM clones WHERE id = $1", [cloneId])).rowCount);
    if (!own) throw new MetaConnectError("Klon topilmadi");
    const taken = await this.db.query<{ clone_id: string }>("SELECT clone_id FROM meta_channels WHERE kind = $1 AND account_id = $2", [kind, accountId]);
    if (taken.rows[0] && taken.rows[0].clone_id !== cloneId) throw new MetaConnectError(`${label} boshqa klonga ulangan`, 409);
    await this.db.query(
      `INSERT INTO meta_channels (tenant_id, clone_id, kind, account_id, label, token_enc) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (clone_id, kind) DO UPDATE SET account_id = EXCLUDED.account_id, label = EXCLUDED.label, token_enc = EXCLUDED.token_enc, created_at = now()`,
      [tenantId, cloneId, kind, accountId, label, encryptSecret(token, this.key)],
    );
    return { label };
  }

  async list(tenantId: string, cloneId: string): Promise<{ kind: MetaKind; label: string; connectedAt: Date }[]> {
    return withTenant(this.db, tenantId, async (tx) => {
      const { rows } = await tx.query<{ kind: MetaKind; label: string; created_at: Date }>("SELECT kind, label, created_at FROM meta_channels WHERE clone_id = $1 ORDER BY kind", [cloneId]);
      return rows.map((r) => ({ kind: r.kind, label: r.label, connectedAt: r.created_at }));
    });
  }

  async disconnect(tenantId: string, cloneId: string, kind: MetaKind): Promise<boolean> {
    const r = await this.db.query("DELETE FROM meta_channels WHERE tenant_id = $1 AND clone_id = $2 AND kind = $3", [tenantId, cloneId, kind]);
    return (r.rowCount ?? 0) > 0;
  }

  async resolveByAccount(kind: MetaKind, accountId: string): Promise<ResolvedMetaChannel | null> {
    const { rows } = await this.db.query<{ id: string; tenant_id: string; clone_id: string; token_enc: string }>(
      "SELECT id, tenant_id, clone_id, token_enc FROM meta_channels WHERE kind = $1 AND account_id = $2",
      [kind, accountId],
    );
    const r = rows[0];
    return r ? { id: r.id, tenantId: r.tenant_id, cloneId: r.clone_id, kind, accountId, token: decryptSecret(r.token_enc, this.key) } : null;
  }

  async resolveByClone(tenantId: string, cloneId: string, kind: MetaKind): Promise<ResolvedMetaChannel | null> {
    const { rows } = await this.db.query<{ id: string; account_id: string; token_enc: string }>("SELECT id, account_id, token_enc FROM meta_channels WHERE tenant_id = $1 AND clone_id = $2 AND kind = $3", [tenantId, cloneId, kind]);
    const r = rows[0];
    return r ? { id: r.id, tenantId, cloneId, kind, accountId: r.account_id, token: decryptSecret(r.token_enc, this.key) } : null;
  }

  /** true — xabar birinchi marta ko'rilmoqda (Meta takroriy yetkazishlarini filtrlash). */
  async markProcessed(messageId: string): Promise<boolean> {
    const r = await this.db.query("INSERT INTO meta_processed_messages (message_id) VALUES ($1) ON CONFLICT DO NOTHING", [messageId]);
    return (r.rowCount ?? 0) > 0;
  }

  /**
   * Matnli javob. Meta faqat foydalanuvchining oxirgi xabaridan keyingi 24 soat ichida erkin
   * matnga ruxsat beradi — undan keyin (masalan, egasining kech javobi) false qaytadi.
   */
  async send(ch: ResolvedMetaChannel, to: string, text: string): Promise<boolean> {
    try {
      if (ch.kind === "whatsapp") {
        await this.graph("whatsapp", `${ch.accountId}/messages`, ch.token, {
          method: "POST",
          body: { messaging_product: "whatsapp", recipient_type: "individual", to: waRecipient(to), type: "text", text: { body: text.slice(0, 4096), preview_url: false } },
        });
      } else {
        // Instagram DM matni 1000 belgigacha.
        await this.graph("instagram", "me/messages", ch.token, { method: "POST", body: { recipient: { id: to }, message: { text: text.slice(0, 1000) } } });
      }
      return true;
    } catch {
      return false;
    }
  }

  /** WhatsApp media: avval /{media-id} dan vaqtinchalik URL, so'ng shu URL'dan token bilan yuklab olinadi. */
  async downloadWhatsAppMedia(ch: ResolvedMetaChannel, mediaId: string): Promise<{ data: Uint8Array; mimeType: string } | null> {
    try {
      const meta = await this.graph<{ url?: string; mime_type?: string }>("whatsapp", mediaId, ch.token);
      if (!meta.url) return null;
      const res = await this.fetchFn(meta.url, { headers: { authorization: `Bearer ${ch.token}` }, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) return null;
      return { data: new Uint8Array(await res.arrayBuffer()), mimeType: meta.mime_type ?? "audio/ogg" };
    } catch {
      return null;
    }
  }
}
