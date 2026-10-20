import { createHash, randomBytes } from "node:crypto";
import {
  DEFAULT_STYLE,
  chunkText,
  defaultDisclosure,
  detectLang,
  extractPhone,
  handleTurn,
  normalizeForSearch,
  parseTelegramExport,
  type ChatTurn,
  type Citation,
  type ClonePersona,
  type Embedder,
  type LLMRouter,
  type Locator,
  type Reranker,
  type Section,
  type StyleProfile,
} from "@ai-clone/core";
import { FREE_PLAN } from "./billing.js";
import { paywallReply, type MonetizationService, type Offer } from "./monetization.js";
import { PgKnowledgeStore } from "./knowledge-store.js";
import { toVector, withTenant, type Db, type Tx } from "./pool.js";

export type Channel = "web" | "telegram" | "instagram" | "whatsapp" | "api";
export type ConversationMode = "bot" | "human" | "paused";

export interface CloneRecord {
  id: string;
  tenantId: string;
  slug: string;
  persona: ClonePersona;
  ownerTelegramChatId: string | null;
  /** Bilimi avtomatik sinxronlanadigan Telegram kanali (egasi tasdiqlagan). */
  telegramSync: { chatId: string; title: string } | null;
}

export interface CreateCloneInput {
  slug: string;
  name: string;
  bio?: string;
  languages?: string[];
  style?: Partial<StyleProfile>;
  grounded?: boolean;
  ownerTelegramChatId?: string;
}

export interface AddSourceInput {
  type: "text" | "url" | "pdf" | "doc" | "youtube" | "voice" | "interview";
  title: string;
  text: string;
  uri?: string;
  locator?: Locator;
}

export interface ChatInput {
  channel: Channel;
  externalId: string;
  name?: string;
  message: string;
  /** Xabar ovozdan olingan bo'lsa (STT xarajatini kuzatish uchun): uzunligi ma'lum bo'lsa soniyada. */
  meta?: { voice?: boolean; voiceSeconds?: number };
}

export interface ChatOutcome {
  conversationId: string;
  /** Javob yo'q bo'lsa — suhbat inson qo'lida yoki limit tugagan. */
  reply: string | null;
  messageId: string | null;
  mode: ConversationMode;
  citations: Citation[];
  escalated: boolean;
  escalationReasons: string[];
  leadCaptured: boolean;
  limitReached: boolean;
  /** Bepul savollar tugagan — obunachiga to'lov takliflari (vidjet ularni tugma sifatida ko'rsatadi). */
  paywall?: { offers: Offer[] };
}

const PLAN_LIMITS: Record<string, number> = { free: 100, creator: 2000, pro: 6000, business: 25000, enterprise: 1_000_000 };

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Ilova servisi: API va Telegram bot shu sinf orqali ishlaydi. Har bir tenant
 * operatsiyasi withTenant() ichida — RLS boshqa tenant ma'lumotini ko'rsatmaydi.
 */
export interface CloneServiceOptions {
  reranker?: Reranker;
  /** Kichik modeldagi klassifikator va so'rovni qayta yozish (04-hujjat §3.3, §3.1). */
  smart?: { classifier?: boolean; rewrite?: boolean };
  /** Klon monetizatsiyasi: bepul savollardan keyin pullik kirish. */
  paywall?: MonetizationService;
}

const MAX_MEMORY_FACTS = 20;

export class CloneService {
  constructor(
    private readonly db: Db,
    private readonly embedder: Embedder,
    private readonly router: LLMRouter,
    private readonly opts: CloneServiceOptions = {},
  ) {}

  // --- Tenantlar (admin, RLS'dan tashqarida) ---

  async createTenant(name: string, plan: keyof typeof PLAN_LIMITS = "free"): Promise<{ tenantId: string; apiKey: string }> {
    const apiKey = `ac_${randomBytes(24).toString("base64url")}`;
    const { rows } = await this.db.query<{ id: string }>(
      "INSERT INTO tenants (name, plan, api_key_hash, monthly_message_limit) VALUES ($1, $2, $3, $4) RETURNING id",
      [name, plan, hashApiKey(apiKey), PLAN_LIMITS[plan] ?? 100],
    );
    return { tenantId: rows[0]!.id, apiKey };
  }

  async authenticate(apiKey: string): Promise<string | null> {
    const { rows } = await this.db.query<{ id: string }>("SELECT id FROM tenants WHERE api_key_hash = $1", [hashApiKey(apiKey)]);
    return rows[0]?.id ?? null;
  }

  /** Ommaviy kanallar (vidjet, bot) klonni slug bo'yicha topadi — tenant ID shundan olinadi. */
  async resolveSlug(slug: string): Promise<{ tenantId: string; cloneId: string } | null> {
    const { rows } = await this.db.query<{ tenant_id: string; id: string }>("SELECT tenant_id, id FROM clones WHERE slug = $1", [slug]);
    return rows[0] ? { tenantId: rows[0].tenant_id, cloneId: rows[0].id } : null;
  }

  // --- Klonlar ---

  async createClone(tenantId: string, input: CreateCloneInput): Promise<CloneRecord> {
    const style: StyleProfile = { ...DEFAULT_STYLE, ...input.style };
    return withTenant(this.db, tenantId, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO clones (tenant_id, slug, display_name, bio, languages, style_profile, grounded, disclosure_text, owner_telegram_chat_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [tenantId, input.slug, input.name, input.bio ?? "", input.languages ?? ["uz"], style, input.grounded ?? true, defaultDisclosure(input.name), input.ownerTelegramChatId ?? null],
      );
      await audit(tx, tenantId, "owner", "clone.create", rows[0]!.id);
      return (await getClone(tx, rows[0]!.id))!;
    });
  }

  async getClone(tenantId: string, cloneId: string): Promise<CloneRecord | null> {
    return withTenant(this.db, tenantId, (tx) => getClone(tx, cloneId));
  }

  async listClones(tenantId: string): Promise<CloneRecord[]> {
    return withTenant(this.db, tenantId, async (tx) => {
      const { rows } = await tx.query<{ id: string }>("SELECT id FROM clones ORDER BY created_at");
      const out: CloneRecord[] = [];
      for (const r of rows) out.push((await getClone(tx, r.id))!);
      return out;
    });
  }

  /** Klonning asosiy sozlamalari (ism, bio, grounded rejim, egasining Telegram chat ID'si). */
  async updateClone(tenantId: string, cloneId: string, patch: { name?: string; bio?: string; grounded?: boolean; ownerTelegramChatId?: string | null }): Promise<CloneRecord | null> {
    return withTenant(this.db, tenantId, async (tx) => {
      await tx.query(
        `UPDATE clones SET display_name = COALESCE($2, display_name), bio = COALESCE($3, bio), grounded = COALESCE($4, grounded),
                owner_telegram_chat_id = CASE WHEN $5::boolean THEN $6::bigint ELSE owner_telegram_chat_id END,
                disclosure_text = CASE WHEN $2 IS NULL THEN disclosure_text ELSE $7 END
          WHERE id = $1`,
        [cloneId, patch.name ?? null, patch.bio ?? null, patch.grounded ?? null, patch.ownerTelegramChatId !== undefined, patch.ownerTelegramChatId ?? null, patch.name ? defaultDisclosure(patch.name) : null],
      );
      await audit(tx, tenantId, "owner", "clone.update", cloneId);
      return getClone(tx, cloneId);
    });
  }

  async listSources(tenantId: string, cloneId: string) {
    return withTenant(this.db, tenantId, async (tx) => {
      const { rows } = await tx.query(
        `SELECT s.id, s.type, s.title, s.uri, s.status, s.created_at, count(c.id)::int AS chunks
           FROM sources s LEFT JOIN chunks c ON c.source_id = s.id
          WHERE s.clone_id = $1 GROUP BY s.id ORDER BY s.created_at DESC`,
        [cloneId],
      );
      return rows;
    });
  }

  async deleteSource(tenantId: string, sourceId: string): Promise<void> {
    await withTenant(this.db, tenantId, async (tx) => {
      const r = await tx.query("DELETE FROM sources WHERE id = $1", [sourceId]);
      if (!r.rowCount) throw new Error("Manba topilmadi");
      await audit(tx, tenantId, "owner", "source.delete", sourceId);
    });
  }

  async updateStyle(tenantId: string, cloneId: string, style: Partial<StyleProfile>): Promise<CloneRecord | null> {
    return withTenant(this.db, tenantId, async (tx) => {
      await tx.query("UPDATE clones SET style_profile = style_profile || $2::jsonb WHERE id = $1", [cloneId, JSON.stringify(style)]);
      return getClone(tx, cloneId);
    });
  }

  // --- Bilim ---

  /** Matnni bo'laklaydi, normallashtiradi, embedding qiladi. Bir xil kontent ikki marta yuklanmaydi. */
  async addSource(tenantId: string, cloneId: string, input: AddSourceInput): Promise<{ sourceId: string; chunks: number; duplicate: boolean }> {
    return this.addSections(tenantId, cloneId, {
      type: input.type,
      title: input.title,
      ...(input.uri ? { uri: input.uri } : {}),
      sections: [{ text: input.text, locator: { ...input.locator, ...(input.uri?.startsWith("http") ? { url: input.uri } : {}) } }],
    });
  }

  /**
   * Bo'limlarga ajratilgan manba (PDF sahifalari, YouTube daqiqalari): har bir bo'lim alohida
   * bo'laklanadi va o'z locator'ini saqlaydi — iqtibos aniq sahifa yoki daqiqaga olib boradi.
   */
  async addSections(
    tenantId: string,
    cloneId: string,
    input: { type: AddSourceInput["type"]; title: string; uri?: string; sections: Section[] },
  ): Promise<{ sourceId: string; chunks: number; duplicate: boolean }> {
    const hash = createHash("sha256").update(input.sections.map((s) => s.text).join("\u0000")).digest("hex");
    const prepared = input.sections.flatMap((section) =>
      chunkText(section.text).map((p) => {
        const lang = detectLang(p.text);
        return { text: p.text, lang, norm: normalizeForSearch(p.text, lang), locator: section.locator };
      }),
    );
    if (!prepared.length) throw new Error("Manbada matn yo'q");
    const embeddings = await this.embedder.embed(prepared.map((p) => p.norm), "doc");

    return withTenant(this.db, tenantId, async (tx) => {
      const existing = await tx.query<{ id: string }>("SELECT id FROM sources WHERE clone_id = $1 AND content_hash = $2", [cloneId, hash]);
      if (existing.rows[0]) return { sourceId: existing.rows[0].id, chunks: 0, duplicate: true };

      const { rows } = await tx.query<{ id: string }>(
        "INSERT INTO sources (tenant_id, clone_id, type, title, uri, status, content_hash) VALUES ($1, $2, $3, $4, $5, 'ready', $6) RETURNING id",
        [tenantId, cloneId, input.type, input.title, input.uri ?? null, hash],
      );
      const sourceId = rows[0]!.id;
      for (const [i, p] of prepared.entries()) {
        await tx.query(
          `INSERT INTO chunks (tenant_id, clone_id, source_id, ord, title, text_original, text_norm, lang, locator, embedding, embedding_model)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector, $11)`,
          [tenantId, cloneId, sourceId, i, input.title, p.text, p.norm, p.lang, p.locator, toVector(embeddings[i]!), this.embedder.model],
        );
      }
      return { sourceId, chunks: prepared.length, duplicate: false };
    });
  }

  /** Kanal sinxronlashni yoqish (chatId) yoki o'chirish (null). */
  async setTelegramSync(tenantId: string, cloneId: string, sync: { chatId: string; title: string } | null): Promise<void> {
    await withTenant(this.db, tenantId, async (tx) => {
      await tx.query("UPDATE clones SET telegram_sync_chat_id = $2, telegram_sync_title = $3 WHERE id = $1", [cloneId, sync?.chatId ?? null, sync?.title ?? null]);
      await audit(tx, tenantId, "owner", sync ? "telegram.sync.on" : "telegram.sync.off", cloneId);
    });
  }

  /**
   * Kanal posti bilimga qo'shiladi; tahrirlangan post eski versiyasini almashtiradi.
   * Juda qisqa postlar (e'lon, emoji) o'tkazib yuboriladi — eksport parseridagi qoida bilan bir xil.
   */
  async syncChannelPost(tenantId: string, cloneId: string, post: { chatId: string; messageId: number; text: string; date: Date; channelTitle: string }): Promise<{ added: boolean }> {
    const uri = `tg://channel/${post.chatId}/${post.messageId}`;
    await withTenant(this.db, tenantId, (tx) => tx.query("DELETE FROM sources WHERE clone_id = $1 AND uri = $2", [cloneId, uri]));
    const text = post.text.trim();
    if (text.length < 40) return { added: false };
    const r = await this.addSource(tenantId, cloneId, { type: "text", title: `${post.channelTitle} — ${post.date.toISOString().slice(0, 10)}`, text, uri, locator: { post: String(post.messageId) } });
    return { added: !r.duplicate };
  }

  /** Telegram eksporti: har bir post — alohida manba (iqtibosda post sanasi), egasining javoblari — uslub namunalari. */
  async importTelegram(tenantId: string, cloneId: string, json: unknown, ownerIds: string[] = []): Promise<{ posts: number; exemplars: number }> {
    const exp = parseTelegramExport(json, ownerIds);
    let posts = 0;
    for (const post of exp.posts) {
      const r = await this.addSource(tenantId, cloneId, { type: "text", title: `${exp.name} — ${post.date.slice(0, 10)}`, text: post.text, locator: { post: String(post.id) } });
      if (!r.duplicate) posts++;
    }
    for (const ex of exp.exemplars) await this.addExemplar(tenantId, cloneId, ex.question, ex.answer, "telegram");
    return { posts, exemplars: exp.exemplars.length };
  }

  async addExemplar(tenantId: string, cloneId: string, question: string, answer: string, origin: "telegram" | "correction" | "interview" | "manual"): Promise<void> {
    const [emb] = await this.embedder.embed([normalizeForSearch(question, detectLang(question))], "doc");
    await withTenant(this.db, tenantId, (tx) =>
      tx.query("INSERT INTO exemplars (tenant_id, clone_id, question, answer, origin, embedding) VALUES ($1, $2, $3, $4, $5, $6::vector)", [tenantId, cloneId, question, answer, origin, toVector(emb!)]),
    );
  }

  // --- Suhbat ---

  async chat(tenantId: string, cloneId: string, input: ChatInput): Promise<ChatOutcome> {
    const clone = await this.getClone(tenantId, cloneId);
    if (!clone) throw new Error("Klon topilmadi");

    // 1. Foydalanuvchi, suhbat va tarixni olish; inson rejimida bot javob bermaydi.
    const ctx = await withTenant(this.db, tenantId, async (tx) => {
      const endUserId = await upsertEndUser(tx, tenantId, cloneId, input);
      const conv = await openConversation(tx, tenantId, cloneId, endUserId);
      const history = await loadHistory(tx, conv.id);
      const limit = await usageExceeded(tx, tenantId);
      const memory = (await tx.query<{ memory: string[] }>("SELECT memory FROM end_users WHERE id = $1", [endUserId])).rows[0]?.memory ?? [];
      return { endUserId, conv, history, limit, memory };
    });

    const base: Omit<ChatOutcome, "reply" | "messageId"> = {
      conversationId: ctx.conv.id,
      mode: ctx.conv.mode,
      citations: [],
      escalated: false,
      escalationReasons: [],
      leadCaptured: false,
      limitReached: ctx.limit,
    };

    if (ctx.conv.mode !== "bot" || ctx.limit) {
      await withTenant(this.db, tenantId, (tx) => insertMessage(tx, tenantId, ctx.conv.id, { role: "user", content: input.message, lang: detectLang(input.message), ...(input.meta ? { flags: input.meta } : {}) }));
      if (ctx.limit) {
        const reply = "Hozir javob bera olmayman — savolingiz egamga yetkazildi, tez orada javob berishadi.";
        return { ...base, reply, messageId: null };
      }
      return { ...base, reply: null, messageId: null };
    }

    // 1b. Monetizatsiya: bepul savollar tugagan va huquq yo'q — LLM chaqirilmaydi, to'lov taklif qilinadi.
    let entitlementId: string | undefined;
    if (this.opts.paywall) {
      const access = await this.opts.paywall.checkAccess(tenantId, cloneId, ctx.endUserId);
      if (!access.allowed) {
        const offers = await this.opts.paywall.offers(tenantId, cloneId, ctx.endUserId);
        const lang = detectLang(input.message);
        const reply = paywallReply(lang, access.freeMessages, offers);
        const messageId = await withTenant(this.db, tenantId, async (tx) => {
          await insertMessage(tx, tenantId, ctx.conv.id, { role: "user", content: input.message, lang, ...(input.meta ? { flags: input.meta } : {}) });
          return insertMessage(tx, tenantId, ctx.conv.id, { role: "assistant", content: reply, lang, answerSource: "paywall" });
        });
        return { ...base, reply, messageId, paywall: { offers } };
      }
      entitlementId = access.entitlementId;
    }

    // 2. AI javobi — ochiq tranzaksiyasiz (qidiruv so'rovlari o'z tranzaksiyalarida).
    const result = await handleTurn(
      {
        store: new PgKnowledgeStore(this.db, tenantId),
        embedder: this.embedder,
        router: this.router,
        ...(this.opts.reranker ? { reranker: this.opts.reranker } : {}),
        ...(this.opts.smart ? { smart: this.opts.smart } : {}),
      },
      { tenantId, cloneId, persona: clone.persona, message: input.message, history: ctx.history, memory: ctx.memory, firstTurn: ctx.history.length === 0 },
    );

    // 3. Saqlash: xabarlar, xarajat, eskalatsiya, lid.
    return withTenant(this.db, tenantId, async (tx) => {
      await insertMessage(tx, tenantId, ctx.conv.id, { role: "user", content: input.message, lang: result.lang, ...(input.meta ? { flags: input.meta } : {}) });
      const messageId = await insertMessage(tx, tenantId, ctx.conv.id, {
        role: "assistant",
        content: result.reply,
        lang: result.lang,
        citations: result.citations,
        answerSource: result.source,
        model: result.model,
        provider: result.provider,
        tokensIn: result.usage?.inputTokens ?? 0,
        tokensCached: result.usage?.cachedInputTokens ?? 0,
        tokensOut: result.usage?.outputTokens ?? 0,
        costUsd: result.costUsd,
        latencyMs: result.latencyMs,
        confidence: result.confidence,
        flags: {
          escalate: result.escalate,
          reasons: result.escalationReasons,
          purchaseIntent: result.purchaseIntent,
          ...(result.classification ? { intent: result.classification.intent } : {}),
          ...(result.searchQuery !== input.message ? { searchQuery: result.searchQuery } : {}),
        },
      });
      const fact = result.classification?.memoryFact;
      if (fact && !ctx.memory.includes(fact)) {
        // Uzoq muddatli xotira (04-hujjat §3.4): eng yangi faktlar saqlanadi.
        await tx.query("UPDATE end_users SET memory = $2::jsonb WHERE id = $1", [ctx.endUserId, JSON.stringify([...ctx.memory, fact].slice(-MAX_MEMORY_FACTS))]);
      }
      await tx.query(
        `INSERT INTO usage_ledger (tenant_id, day, messages, tokens_in, tokens_out, cost_usd) VALUES ($1, current_date, 1, $2, $3, $4)
         ON CONFLICT (tenant_id, day) DO UPDATE SET messages = usage_ledger.messages + 1, tokens_in = usage_ledger.tokens_in + EXCLUDED.tokens_in,
           tokens_out = usage_ledger.tokens_out + EXCLUDED.tokens_out, cost_usd = usage_ledger.cost_usd + EXCLUDED.cost_usd`,
        [tenantId, result.usage?.inputTokens ?? 0, result.usage?.outputTokens ?? 0, result.costUsd],
      );

      if (result.escalate) {
        const open = await tx.query("SELECT 1 FROM handoffs WHERE conversation_id = $1 AND status = 'open'", [ctx.conv.id]);
        if (!open.rowCount) await tx.query("INSERT INTO handoffs (tenant_id, conversation_id, reasons) VALUES ($1, $2, $3)", [tenantId, ctx.conv.id, result.escalationReasons.length ? result.escalationReasons : ["unanswerable"]]);
      }

      const phone = extractPhone(input.message);
      let leadCaptured = false;
      if (phone || result.purchaseIntent) {
        if (phone) await tx.query("UPDATE end_users SET phone = $2 WHERE id = $1", [ctx.endUserId, phone]);
        const lead = await tx.query(
          `INSERT INTO leads (tenant_id, clone_id, end_user_id, conversation_id, phone, note) VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (clone_id, end_user_id) DO UPDATE SET phone = COALESCE(EXCLUDED.phone, leads.phone) RETURNING (xmax = 0) AS inserted`,
          [tenantId, cloneId, ctx.endUserId, ctx.conv.id, phone, input.message.slice(0, 500)],
        );
        leadCaptured = Boolean(lead.rows[0]?.inserted) || phone !== null;
      }

      if (entitlementId) await this.opts.paywall!.consume(entitlementId);
      return { ...base, reply: result.reply, messageId, citations: result.citations, escalated: result.escalate, escalationReasons: result.escalationReasons, leadCaptured };
    });
  }

  /** Human takeover: egasi suhbatni qo'lga oladi ('human') yoki botga qaytaradi ('bot'). */
  async setMode(tenantId: string, conversationId: string, mode: ConversationMode): Promise<void> {
    await withTenant(this.db, tenantId, async (tx) => {
      const r = await tx.query("UPDATE conversations SET mode = $2 WHERE id = $1", [conversationId, mode]);
      if (!r.rowCount) throw new Error("Suhbat topilmadi");
      if (mode === "bot") await tx.query("UPDATE handoffs SET status = 'resolved', resolved_at = now() WHERE conversation_id = $1 AND status = 'open'", [conversationId]);
      await audit(tx, tenantId, "owner", `conversation.mode.${mode}`, conversationId);
    });
  }

  /** Egasining javobi: saqlanadi va kanalga yetkazish uchun manzil qaytariladi. */
  async ownerReply(tenantId: string, conversationId: string, text: string): Promise<{ channel: Channel; externalId: string; cloneId: string }> {
    return withTenant(this.db, tenantId, async (tx) => {
      const { rows } = await tx.query<{ channel: Channel; external_id: string; clone_id: string }>(
        "SELECT u.channel, u.external_id, c.clone_id FROM conversations c JOIN end_users u ON u.id = c.end_user_id WHERE c.id = $1",
        [conversationId],
      );
      if (!rows[0]) throw new Error("Suhbat topilmadi");
      await insertMessage(tx, tenantId, conversationId, { role: "owner", content: text, lang: detectLang(text) });
      return { channel: rows[0].channel, externalId: rows[0].external_id, cloneId: rows[0].clone_id };
    });
  }

  /**
   * Baho va tuzatish. Tuzatish berilsa — oldingi foydalanuvchi savoli bilan tasdiqlangan javob
   * va uslub namunasi yaratiladi: klon bu xatoni boshqa qaytarmaydi (04-hujjat §6).
   */
  async feedback(tenantId: string, messageId: string, rating: 1 | -1, correction?: string, byRole: "owner" | "end_user" = "owner"): Promise<{ verifiedAnswerCreated: boolean }> {
    const target = await withTenant(this.db, tenantId, async (tx) => {
      const { rows } = await tx.query<{ clone_id: string; question: string | null }>(
        `SELECT c.clone_id,
                (SELECT u.content FROM messages u WHERE u.conversation_id = m.conversation_id AND u.role = 'user' AND u.created_at <= m.created_at
                  ORDER BY u.created_at DESC LIMIT 1) AS question
           FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.id = $1 AND m.role = 'assistant'`,
        [messageId],
      );
      if (!rows[0]) throw new Error("Klon xabari topilmadi");
      await tx.query("INSERT INTO feedback (tenant_id, message_id, by_role, rating, correction) VALUES ($1, $2, $3, $4, $5)", [tenantId, messageId, byRole, rating, correction ?? null]);
      return { cloneId: rows[0].clone_id, question: rows[0].question };
    });

    if (!correction || byRole !== "owner" || !target.question) return { verifiedAnswerCreated: false };
    const [emb] = await this.embedder.embed([normalizeForSearch(target.question, detectLang(target.question))], "doc");
    await withTenant(this.db, tenantId, (tx) =>
      tx.query("INSERT INTO verified_answers (tenant_id, clone_id, question, answer, embedding, source_message_id) VALUES ($1, $2, $3, $4, $5::vector, $6)", [tenantId, target.cloneId, target.question, correction, toVector(emb!), messageId]),
    );
    await this.addExemplar(tenantId, target.cloneId, target.question, correction, "correction");
    return { verifiedAnswerCreated: true };
  }

  /** Obunachining 👍/👎 bahosi (vidjet). Faqat o'z suhbatidagi klon javobiga; qayta bosilsa — o'zgartiriladi. */
  async visitorFeedback(tenantId: string, cloneId: string, channel: Channel, externalId: string, messageId: string, rating: 1 | -1): Promise<boolean> {
    return withTenant(this.db, tenantId, async (tx) => {
      const { rows } = await tx.query(
        `SELECT 1 FROM messages m JOIN conversations cv ON cv.id = m.conversation_id JOIN end_users u ON u.id = cv.end_user_id
          WHERE m.id = $1 AND m.role = 'assistant' AND cv.clone_id = $2 AND u.channel = $3 AND u.external_id = $4`,
        [messageId, cloneId, channel, externalId],
      );
      if (!rows.length) return false;
      await tx.query(
        `INSERT INTO feedback (tenant_id, message_id, by_role, rating) VALUES ($1, $2, 'end_user', $3)
         ON CONFLICT (message_id) WHERE by_role = 'end_user' DO UPDATE SET rating = EXCLUDED.rating, created_at = now()`,
        [tenantId, messageId, rating],
      );
      return true;
    });
  }

  async listConversations(tenantId: string, cloneId: string, filter?: "escalated") {
    return withTenant(this.db, tenantId, async (tx) => {
      const { rows } = await tx.query(
        `SELECT c.id, c.mode, c.last_msg_at, u.channel, u.name, u.phone,
                EXISTS (SELECT 1 FROM handoffs h WHERE h.conversation_id = c.id AND h.status = 'open') AS needs_attention,
                (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message
           FROM conversations c JOIN end_users u ON u.id = c.end_user_id
          WHERE c.clone_id = $1 ${filter === "escalated" ? "AND EXISTS (SELECT 1 FROM handoffs h WHERE h.conversation_id = c.id AND h.status = 'open')" : ""}
          ORDER BY c.last_msg_at DESC LIMIT 100`,
        [cloneId],
      );
      return rows;
    });
  }

  async getMessages(tenantId: string, conversationId: string) {
    return withTenant(this.db, tenantId, async (tx) => {
      const { rows } = await tx.query(
        "SELECT id, role, content, citations, answer_source, model, cost_usd, confidence, flags, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at",
        [conversationId],
      );
      return rows;
    });
  }

  /** Vidjet uchun: egasi inson rejimida yozgan javoblar (berilgan vaqtdan keyingilari). */
  async ownerMessagesSince(tenantId: string, cloneId: string, channel: Channel, externalId: string, after: Date) {
    return withTenant(this.db, tenantId, async (tx) => {
      const { rows } = await tx.query<{ id: string; content: string; created_at: Date }>(
        `SELECT m.id, m.content, m.created_at FROM messages m
           JOIN conversations c ON c.id = m.conversation_id JOIN end_users u ON u.id = c.end_user_id
          WHERE u.clone_id = $1 AND u.channel = $2 AND u.external_id = $3 AND m.role = 'owner' AND m.created_at > $4
          ORDER BY m.created_at LIMIT 20`,
        [cloneId, channel, externalId, after],
      );
      return rows;
    });
  }

  async listLeads(tenantId: string, cloneId: string) {
    return withTenant(this.db, tenantId, async (tx) => {
      const { rows } = await tx.query(
        "SELECT l.id, l.phone, l.note, l.stage, l.created_at, u.name, u.channel FROM leads l JOIN end_users u ON u.id = l.end_user_id WHERE l.clone_id = $1 ORDER BY l.created_at DESC",
        [cloneId],
      );
      return rows;
    });
  }

  async stats(tenantId: string, cloneId: string) {
    return withTenant(this.db, tenantId, async (tx) => {
      const { rows } = await tx.query(
        `SELECT
           (SELECT count(*) FROM conversations WHERE clone_id = $1)::int AS conversations,
           (SELECT count(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.clone_id = $1 AND m.role = 'assistant')::int AS answers,
           (SELECT count(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.clone_id = $1 AND m.answer_source = 'unanswerable')::int AS unanswered,
           (SELECT count(*) FROM leads WHERE clone_id = $1)::int AS leads,
           (SELECT coalesce(sum(m.cost_usd), 0) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.clone_id = $1)::float AS cost_usd,
           (SELECT coalesce(avg(f.rating), 0) FROM feedback f JOIN messages m ON m.id = f.message_id JOIN conversations c ON c.id = m.conversation_id WHERE c.clone_id = $1)::float AS avg_rating`,
        [cloneId],
      );
      return rows[0];
    });
  }

  /** Foydalanuvchi /forget so'raganda: xotira va suhbatlar o'chiriladi. */
  async forgetEndUser(tenantId: string, cloneId: string, channel: Channel, externalId: string): Promise<boolean> {
    return withTenant(this.db, tenantId, async (tx) => {
      const r = await tx.query("DELETE FROM end_users WHERE clone_id = $1 AND channel = $2 AND external_id = $3", [cloneId, channel, externalId]);
      return (r.rowCount ?? 0) > 0;
    });
  }
}

async function getClone(tx: Tx, cloneId: string): Promise<CloneRecord | null> {
  const { rows } = await tx.query<{
    id: string;
    tenant_id: string;
    slug: string;
    display_name: string;
    bio: string;
    languages: string[];
    style_profile: StyleProfile;
    grounded: boolean;
    disclosure_text: string;
    owner_telegram_chat_id: string | null;
    telegram_sync_chat_id: string | null;
    telegram_sync_title: string | null;
  }>("SELECT * FROM clones WHERE id = $1", [cloneId]);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    tenantId: r.tenant_id,
    slug: r.slug,
    ownerTelegramChatId: r.owner_telegram_chat_id,
    telegramSync: r.telegram_sync_chat_id ? { chatId: String(r.telegram_sync_chat_id), title: r.telegram_sync_title ?? "" } : null,
    persona: { name: r.display_name, bio: r.bio, languages: r.languages, style: { ...DEFAULT_STYLE, ...r.style_profile }, grounded: r.grounded, disclosure: r.disclosure_text },
  };
}

async function upsertEndUser(tx: Tx, tenantId: string, cloneId: string, input: ChatInput): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO end_users (tenant_id, clone_id, channel, external_id, name, locale, consent_at) VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (clone_id, channel, external_id) DO UPDATE SET name = COALESCE(EXCLUDED.name, end_users.name) RETURNING id`,
    [tenantId, cloneId, input.channel, input.externalId, input.name ?? null, detectLang(input.message)],
  );
  return rows[0]!.id;
}

async function openConversation(tx: Tx, tenantId: string, cloneId: string, endUserId: string): Promise<{ id: string; mode: ConversationMode }> {
  const existing = await tx.query<{ id: string; mode: ConversationMode }>(
    "SELECT id, mode FROM conversations WHERE end_user_id = $1 AND status = 'open' ORDER BY last_msg_at DESC LIMIT 1",
    [endUserId],
  );
  if (existing.rows[0]) return existing.rows[0];
  const { rows } = await tx.query<{ id: string; mode: ConversationMode }>(
    "INSERT INTO conversations (tenant_id, clone_id, end_user_id) VALUES ($1, $2, $3) RETURNING id, mode",
    [tenantId, cloneId, endUserId],
  );
  return rows[0]!;
}

async function loadHistory(tx: Tx, conversationId: string): Promise<ChatTurn[]> {
  const { rows } = await tx.query<{ role: string; content: string }>(
    "SELECT role, content FROM (SELECT role, content, created_at FROM messages WHERE conversation_id = $1 AND role <> 'system' ORDER BY created_at DESC LIMIT 20) t ORDER BY created_at",
    [conversationId],
  );
  // Egasining javoblari model uchun assistant navbati sifatida ko'rinadi.
  return rows.map((r) => ({ role: r.role === "user" ? "user" : "assistant", content: r.content }));
}

async function usageExceeded(tx: Tx, tenantId: string): Promise<boolean> {
  const { rows } = await tx.query<{ used: number; lim: number; spent: number; cap: number }>(
    `SELECT coalesce((SELECT sum(messages) FROM usage_ledger WHERE tenant_id = $1 AND day >= date_trunc('month', current_date)), 0)::int AS used,
            CASE WHEN t.plan_expires_at < now() THEN $2 ELSE t.monthly_message_limit END AS lim,
            coalesce((SELECT cost_usd FROM usage_ledger WHERE tenant_id = $1 AND day = current_date), 0)::float AS spent,
            CASE WHEN t.plan_expires_at < now() THEN $3 ELSE t.daily_spend_cap_usd END::float AS cap
       FROM tenants t WHERE t.id = $1`,
    // Muddati o'tgan pullik tarif avtomatik bepul tarif limitlariga qaytadi (cron kerak emas).
    [tenantId, FREE_PLAN.monthlyMessages, FREE_PLAN.dailySpendCapUsd],
  );
  const r = rows[0];
  return !r || r.used >= r.lim || r.spent >= r.cap;
}

interface MessageInsert {
  role: "user" | "assistant" | "owner" | "system";
  content: string;
  lang?: string;
  citations?: Citation[];
  answerSource?: string;
  model?: string | undefined;
  provider?: string | undefined;
  tokensIn?: number;
  tokensCached?: number;
  tokensOut?: number;
  costUsd?: number;
  latencyMs?: number;
  confidence?: number;
  flags?: Record<string, unknown>;
}

async function insertMessage(tx: Tx, tenantId: string, conversationId: string, m: MessageInsert): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO messages (tenant_id, conversation_id, role, content, lang, citations, answer_source, model, provider, tokens_in, tokens_cached, tokens_out, cost_usd, latency_ms, confidence, flags)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id`,
    [
      tenantId, conversationId, m.role, m.content, m.lang ?? null, JSON.stringify(m.citations ?? []), m.answerSource ?? null, m.model ?? null, m.provider ?? null,
      m.tokensIn ?? 0, m.tokensCached ?? 0, m.tokensOut ?? 0, m.costUsd ?? 0, m.latencyMs ?? null, m.confidence ?? null, m.flags ?? {},
    ],
  );
  await tx.query("UPDATE conversations SET last_msg_at = now() WHERE id = $1", [conversationId]);
  return rows[0]!.id;
}

async function audit(tx: Tx, tenantId: string, actor: string, action: string, target: string): Promise<void> {
  await tx.query("INSERT INTO audit_log (tenant_id, actor, action, target) VALUES ($1, $2, $3, $4)", [tenantId, actor, action, target]);
}
