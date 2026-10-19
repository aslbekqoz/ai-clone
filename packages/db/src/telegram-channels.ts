import { randomBytes, timingSafeEqual } from "node:crypto";
import { decryptSecret, encryptSecret } from "./crypto.js";
import { withTenant, type Db } from "./pool.js";

type FetchFn = typeof fetch;

export interface TelegramBotInfo {
  id: number;
  is_bot: true;
  first_name: string;
  username: string;
  can_join_groups: boolean;
  can_read_all_group_messages: boolean;
  supports_inline_queries: boolean;
  can_connect_to_business: boolean;
  has_main_web_app: boolean;
  [k: string]: unknown;
}

export interface ResolvedBot {
  id: string;
  tenantId: string;
  cloneId: string;
  token: string;
  botInfo: TelegramBotInfo;
}

export class TelegramConnectError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 | 502 = 400,
  ) {
    super(message);
    this.name = "TelegramConnectError";
  }
}

const TOKEN_RE = /^\d{5,15}:[\w-]{30,60}$/;

/**
 * Klonlarning Telegram botlari: ulash (getMe + setWebhook), uzish, webhook marshrutlash.
 * Token faqat shifrlangan holda saqlanadi va API javoblarida hech qachon qaytarilmaydi.
 */
export class TelegramChannels {
  constructor(
    private readonly db: Db,
    private readonly key: Buffer,
    private readonly publicBaseUrl: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  private async call<T>(token: string, method: string, params: Record<string, unknown> = {}): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchFn(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new TelegramConnectError("Telegram API'ga ulanib bo'lmadi", 502);
    }
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
    if (!data.ok) {
      if (res.status === 401 || res.status === 404) throw new TelegramConnectError("Bot tokeni noto'g'ri — BotFather'dan qayta nusxalang");
      throw new TelegramConnectError(`Telegram: ${data.description ?? res.status}`, 502);
    }
    return data.result as T;
  }

  async connect(tenantId: string, cloneId: string, token: string): Promise<{ botUsername: string }> {
    const clean = token.trim();
    if (!TOKEN_RE.test(clean)) throw new TelegramConnectError("Token formati noto'g'ri (masalan: 123456789:AA…)");
    const me = await this.call<TelegramBotInfo>(clean, "getMe");

    const taken = await this.db.query<{ clone_id: string }>("SELECT clone_id FROM telegram_bots WHERE bot_id = $1", [me.id]);
    if (taken.rows[0] && taken.rows[0].clone_id !== cloneId) throw new TelegramConnectError(`@${me.username} boshqa klonga ulangan`, 409);

    // Klon shu tenantga tegishliligini RLS orqali tekshiramiz.
    const own = await withTenant(this.db, tenantId, async (tx) => (await tx.query("SELECT 1 FROM clones WHERE id = $1", [cloneId])).rowCount);
    if (!own) throw new TelegramConnectError("Klon topilmadi", 400);

    const secret = randomBytes(24).toString("hex");
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO telegram_bots (tenant_id, clone_id, bot_id, bot_username, bot_info, token_enc, webhook_secret) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (clone_id) DO UPDATE SET bot_id = EXCLUDED.bot_id, bot_username = EXCLUDED.bot_username, bot_info = EXCLUDED.bot_info,
         token_enc = EXCLUDED.token_enc, webhook_secret = EXCLUDED.webhook_secret, created_at = now()
       RETURNING id`,
      [tenantId, cloneId, me.id, me.username, me, encryptSecret(clean, this.key), secret],
    );
    const id = rows[0]!.id;
    try {
      await this.call(clean, "setWebhook", {
        url: `${this.publicBaseUrl.replace(/\/$/, "")}/telegram/${id}`,
        secret_token: secret,
        allowed_updates: ["message"],
        drop_pending_updates: true,
      });
      await this.call(clean, "setMyCommands", {
        commands: [
          { command: "start", description: "Boshlash" },
          { command: "forget", description: "Mening ma'lumotlarimni o'chirish" },
        ],
      });
    } catch (err) {
      await this.db.query("DELETE FROM telegram_bots WHERE id = $1", [id]);
      throw err;
    }
    return { botUsername: me.username };
  }

  async disconnect(tenantId: string, cloneId: string): Promise<boolean> {
    const bot = await this.resolveByClone(tenantId, cloneId);
    if (!bot) return false;
    await this.call(bot.token, "deleteWebhook", { drop_pending_updates: true }).catch(() => {});
    await this.db.query("DELETE FROM telegram_bots WHERE id = $1 AND tenant_id = $2", [bot.id, tenantId]);
    return true;
  }

  /** Xabar yuborish (egasining javobi). Tarmoq yoki Telegram xatosida false — xabar baribir saqlangan. */
  async sendMessage(token: string, chatId: string, text: string): Promise<boolean> {
    try {
      await this.call(token, "sendMessage", { chat_id: chatId, text });
      return true;
    } catch {
      return false;
    }
  }

  /** Dashboard uchun: token va sirsiz ma'lumot (RLS bilan). */
  async status(tenantId: string, cloneId: string): Promise<{ botUsername: string; connectedAt: Date } | null> {
    return withTenant(this.db, tenantId, async (tx) => {
      const { rows } = await tx.query<{ bot_username: string; created_at: Date }>("SELECT bot_username, created_at FROM telegram_bots WHERE clone_id = $1", [cloneId]);
      return rows[0] ? { botUsername: rows[0].bot_username, connectedAt: rows[0].created_at } : null;
    });
  }

  /** Webhook: ID va Telegram yuborgan sir (X-Telegram-Bot-Api-Secret-Token) bo'yicha botni topadi. */
  async resolveWebhook(id: string, secretHeader: string | undefined): Promise<ResolvedBot | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { rows } = await this.db.query<{ tenant_id: string; clone_id: string; token_enc: string; webhook_secret: string; bot_info: TelegramBotInfo }>(
      "SELECT tenant_id, clone_id, token_enc, webhook_secret, bot_info FROM telegram_bots WHERE id = $1",
      [id],
    );
    const r = rows[0];
    if (!r || !safeEqual(r.webhook_secret, secretHeader ?? "")) return null;
    return { id, tenantId: r.tenant_id, cloneId: r.clone_id, token: decryptSecret(r.token_enc, this.key), botInfo: r.bot_info };
  }

  async resolveByClone(tenantId: string, cloneId: string): Promise<ResolvedBot | null> {
    const { rows } = await this.db.query<{ id: string; token_enc: string; bot_info: TelegramBotInfo }>("SELECT id, token_enc, bot_info FROM telegram_bots WHERE clone_id = $1 AND tenant_id = $2", [cloneId, tenantId]);
    const r = rows[0];
    return r ? { id: r.id, tenantId, cloneId, token: decryptSecret(r.token_enc, this.key), botInfo: r.bot_info } : null;
  }
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
