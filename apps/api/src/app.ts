import {
  MAX_FILE_BYTES,
  MAX_OCR_PAGES,
  NeedsOcrError,
  UnsupportedFileError,
  fetchYouTubeTranscript,
  parseFile,
  parseMetaWebhook,
  parseYouTubeId,
  verifyMetaSignature,
  type DocumentOcr,
  type ParsedDocument,
  type SpeechToText,
} from "@ai-clone/core";
import { createWebhookDispatcher } from "@ai-clone/bot";
import {
  AvatarError,
  CATEGORIES,
  MarketplaceError,
  MetaConnectError,
  MonetizationError,
  PaymentNotConfiguredError,
  TelegramConnectError,
  VoiceError,
  WhiteLabelError,
  type AvatarService,
  type BillingService,
  type CloneService,
  type Category,
  type JobQueue,
  type SystemStats,
  type MarketplaceService,
  type MetaChannels,
  type MonetizationService,
  type TelegramChannels,
  type VoiceService,
  type WhiteLabelService,
} from "@ai-clone/db";
import { QUEUES, telegramGroupKey, type AvatarRequest } from "./jobs.js";
import { processMetaInbound } from "./meta-webhook.js";
import type { ApiClientOptions } from "grammy";
import type { Update } from "grammy/types";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { fetchUrlText } from "./fetch-url.js";
import { RateLimiter } from "./rate-limit.js";
import { dashboardHtml } from "./dashboard.js";
import { Metrics, gauge, log, observe } from "./metrics.js";
import { PAGE_SIZE, exploreHtml } from "./explore.js";
import { clonePageHtml, payPageHtml, widgetJs } from "./widget.js";

export interface AppConfig {
  adminToken?: string;
  telegramBotToken?: string;
  publicBaseUrl?: string;
  /** Subtitrsiz YouTube videolari va ovozli xabarlar uchun. */
  stt?: SpeechToText | null;
  /** Ko'p klonli Telegram (CHANNEL_SECRET_KEY + PUBLIC_BASE_URL bo'lsa). */
  telegram?: TelegramChannels | null;
  /** Testlar uchun: webhook botlarining Telegram API so'rovlari. */
  telegramClient?: ApiClientOptions;
  /** Instagram DM va WhatsApp (Meta ilovasi). */
  meta?: { channels: MetaChannels; appSecret: string; verifyToken: string } | null;
  voice?: VoiceService | null;
  monetization?: MonetizationService | null;
  /** Ommaviy katalog (/explore). */
  marketplace?: MarketplaceService | null;
  /** Brending va o'z domeni. */
  whiteLabel?: WhiteLabelService | null;
  /** Video-avatar: sozlash va javob uchun video so'rovi (navbat orqali). */
  avatar?: { service: AvatarService; request: ((req: AvatarRequest) => Promise<string | null>) | null } | null;
  /** Skanerlangan PDF va rasmlar uchun. */
  ocr?: DocumentOcr | null;
  /**
   * Fon navbati: webhook'lar darhol 200 qaytaradi, javob worker'da tayyorlanadi; YouTube va OCR
   * 202 + vazifa ID qaytaradi. Bo'lmasa — hammasi so'rov ichida (testlar, oddiy lokal ishga tushirish).
   */
  jobs?: { queue: JobQueue; notify?: () => void } | null;
  /** Monitoring: /health/ready, /metrics (METRICS_TOKEN bilan) va kirish loglari. */
  ops?: {
    readiness?: () => Promise<{ ok: boolean } & Record<string, unknown>>;
    stats?: () => Promise<SystemStats>;
    metricsToken?: string;
    logRequests?: boolean;
  };
}

type Env = { Variables: { tenantId: string; requestId: string } };

const plan = z.enum(["free", "creator", "pro", "business", "enterprise"]);
const style = z
  .object({
    tone: z.string().max(200),
    address: z.enum(["siz", "sen"]),
    emoji: z.enum(["none", "rare", "often"]),
    length: z.enum(["short", "medium", "long"]),
    signaturePhrases: z.array(z.string().max(100)).max(20),
    avoidTopics: z.array(z.string().max(100)).max(50),
    callToAction: z.string().max(300),
  })
  .partial();

const schemas = {
  tenant: z.object({ name: z.string().min(1).max(200), plan: plan.default("free") }),
  clone: z.object({
    slug: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,40}$/, "slug: kichik lotin harflari, raqam, - va _ (3–41 belgi)"),
    name: z.string().min(1).max(100),
    bio: z.string().max(2000).optional(),
    languages: z.array(z.enum(["uz", "uz-cyrl", "ru", "en"])).optional(),
    style: style.optional(),
    grounded: z.boolean().optional(),
    ownerTelegramChatId: z.string().regex(/^-?\d+$/).optional(),
  }),
  clonePatch: z.object({
    name: z.string().min(1).max(100).optional(),
    bio: z.string().max(2000).optional(),
    grounded: z.boolean().optional(),
    ownerTelegramChatId: z.string().regex(/^-?\d+$/).nullable().optional(),
  }),
  source: z.object({
    type: z.enum(["text", "pdf", "doc", "youtube", "voice", "interview"]).default("text"),
    title: z.string().min(1).max(300),
    text: z.string().min(1).max(2_000_000),
    uri: z.string().url().optional(),
  }),
  urlSource: z.object({ url: z.string().url(), title: z.string().max(300).optional() }),
  youtube: z.object({ url: z.string().url(), title: z.string().max(300).optional() }),
  telegram: z.object({ export: z.unknown(), ownerIds: z.array(z.string()).default([]) }),
  exemplar: z.object({ question: z.string().min(1).max(2000), answer: z.string().min(1).max(4000) }),
  chat: z.object({ externalId: z.string().min(1).max(200), message: z.string().min(1).max(4000), name: z.string().max(200).optional() }),
  publicChat: z.object({ visitorId: z.string().regex(/^[\w-]{8,64}$/), message: z.string().min(1).max(2000) }),
  mode: z.object({ mode: z.enum(["bot", "human", "paused"]) }),
  reply: z.object({ text: z.string().min(1).max(4000) }),
  order: z.object({ plan: z.enum(["creator", "pro", "business"]), months: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]).default(1), provider: z.enum(["payme", "click"]) }),
  monetization: z.object({ enabled: z.boolean().optional(), freeMessages: z.number().int().min(0).max(1000).optional() }),
  product: z.object({
    title: z.string().min(1).max(120),
    kind: z.enum(["pack", "subscription"]),
    messages: z.number().int().min(1).max(100000).optional(),
    days: z.number().int().min(1).max(366).optional(),
    priceUzs: z.number().int().min(1000).max(100_000_000),
  }),
  productPatch: z.object({ active: z.boolean() }),
  payout: z.object({ tenantId: z.string().uuid(), amountUzs: z.number().int().min(1), reference: z.string().min(1).max(200) }),
  voiceMode: z.object({ mode: z.enum(["off", "voice_in", "always"]) }),
  voicePreview: z.object({ text: z.string().min(1).max(300) }),
  instagram: z.object({ accessToken: z.string().min(20).max(1000) }),
  whatsapp: z.object({ phoneNumberId: z.string().regex(/^\d{5,20}$/), accessToken: z.string().min(20).max(1000) }),
  telegramToken: z.object({ token: z.string().min(10).max(100) }),
  marketplace: z.object({
    listed: z.boolean().optional(),
    category: z.enum(Object.keys(CATEGORIES) as [Category, ...Category[]]).optional(),
    tagline: z.string().max(160).optional(),
  }),
  visitorFeedback: z.object({ visitorId: z.string().regex(/^[\w-]{8,64}$/), messageId: z.string().uuid(), rating: z.union([z.literal(1), z.literal(-1)]) }),
  report: z.object({ visitorId: z.string().regex(/^[\w-]{8,64}$/), reason: z.enum(["impersonation", "harmful", "spam", "other"]), details: z.string().max(500).default("") }),
  moderation: z.object({ status: z.enum(["ok", "blocked"]), reason: z.string().max(500).optional() }),
  brand: z
    .object({
      accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
      logoUrl: z.string().url().max(500).nullable(),
      hidePoweredBy: z.boolean(),
    })
    .partial(),
  avatarMode: z.object({ mode: z.enum(["off", "always"]) }),
  domain: z.object({ domain: z.string().min(4).max(253) }),
  feedback: z.object({ rating: z.union([z.literal(1), z.literal(-1)]), correction: z.string().max(4000).optional() }),
};

async function body<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  const json = await c.req.json().catch(() => {
    throw new HTTPException(400, { message: "JSON body kerak" });
  });
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new HTTPException(422, { message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
  return parsed.data;
}

export function createApp(svc: CloneService, cfg: AppConfig = {}, billing?: BillingService) {
  const app = new Hono<Env>();
  const metrics = new Metrics();
  app.use("*", observe(metrics, { logRequests: cfg.ops?.logRequests ?? false }));
  const publicLimiter = new RateLimiter(20, 60_000);

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    if (err instanceof PaymentNotConfiguredError) return c.json({ error: err.message }, 503);
    if (err instanceof TelegramConnectError || err instanceof MetaConnectError || err instanceof VoiceError || err instanceof MonetizationError || err instanceof MarketplaceError || err instanceof WhiteLabelError || err instanceof AvatarError) return c.json({ error: err.message }, err.status);
    if (err.message.includes("topilmadi")) return c.json({ error: err.message }, 404);
    if ((err as { code?: string }).code === "23505") return c.json({ error: "Bunday yozuv allaqachon mavjud" }, 409);
    if ((err as { code?: string }).code === "22P02") return c.json({ error: "Topilmadi" }, 404);
    log("error", err.message, { requestId: c.get("requestId"), path: c.req.path, stack: err.stack });
    return c.json({ error: "Ichki xato", requestId: c.get("requestId") }, 500);
  });

  // --- O'z domeni: ai.dilnoza.uz → shu klonning sahifasi. Boshqaruv yo'llari mijoz domenida ochilmaydi. ---
  const platformHost = cfg.publicBaseUrl ? new URL(cfg.publicBaseUrl).host : null;
  const hostCache = new Map<string, { at: number; target: { tenantId: string; cloneId: string; slug: string } | null }>();
  const resolveHost = async (host: string) => {
    const hit = hostCache.get(host);
    if (hit && Date.now() - hit.at < 60_000) return hit.target;
    const target = await cfg.whiteLabel!.resolveHost(host);
    if (hostCache.size > 5000) hostCache.clear();
    hostCache.set(host, { at: Date.now(), target });
    return target;
  };
  app.use("*", async (c, next) => {
    const host = c.req.header("host")?.toLowerCase();
    if (!cfg.whiteLabel || !host || host === platformHost || /^(localhost|127\.|\[::1\])/.test(host)) return next();
    const target = await resolveHost(host);
    if (!target) return next();
    const path = c.req.path;
    if (path === "/") return renderClonePage(c, target, `${c.req.header("x-forwarded-proto") ?? "https"}://${host}`);
    if (path.startsWith("/c/")) return c.redirect("/");
    if (/^\/(public|pay)\//.test(path) || path === "/widget.js" || path === "/health") return next();
    return c.text("Topilmadi", 404);
  });

  app.get("/health", (c) => c.json({ ok: true }));
  // Readiness: baza va migratsiyalar. Yuk balanslagich trafikni faqat 200 bo'lganda yuboradi.
  app.get("/health/ready", async (c) => {
    const r = cfg.ops?.readiness ? await cfg.ops.readiness() : { ok: true };
    return c.json(r, r.ok ? 200 : 503);
  });
  app.get("/metrics", async (c) => {
    const token = cfg.ops?.metricsToken;
    if (!token || c.req.header("authorization") !== `Bearer ${token}`) return c.text("Ruxsat yo'q", 401);
    const extra: string[] = [];
    if (cfg.ops?.stats) {
      const s = await cfg.ops.stats();
      extra.push(
        gauge("aiclone_jobs_queued", "Navbatdagi vazifalar", s.jobs.map((j) => ({ labels: { queue: j.queue }, value: j.queued }))),
        gauge("aiclone_jobs_running", "Bajarilayotgan vazifalar", s.jobs.map((j) => ({ labels: { queue: j.queue }, value: j.running }))),
        gauge("aiclone_jobs_failed_24h", "Oxirgi 24 soatda muvaffaqiyatsiz vazifalar", s.jobs.map((j) => ({ labels: { queue: j.queue }, value: j.failed24h }))),
        gauge("aiclone_jobs_oldest_queued_seconds", "Eng eski kutayotgan vazifa yoshi", s.jobs.map((j) => ({ labels: { queue: j.queue }, value: j.oldestQueuedSec }))),
        gauge("aiclone_messages_today", "Bugungi klon javoblari", [{ value: s.today.messages }]),
        gauge("aiclone_llm_cost_usd_today", "Bugungi LLM xarajati (USD)", [{ value: s.today.costUsd }]),
        gauge("aiclone_avatar_failed_24h", "Oxirgi 24 soatda chiqmagan videolar", [{ value: s.avatarRendersFailed24h }]),
      );
    }
    return c.text(metrics.render(extra), 200, { "content-type": "text/plain; version=0.0.4" });
  });
  // Caddy on-demand TLS: sertifikat faqat tasdiqlangan mijoz domeniga chiqariladi.
  app.get("/internal/tls-ask", async (c) => {
    const domain = c.req.query("domain") ?? "";
    return cfg.whiteLabel && (await cfg.whiteLabel.resolveHost(domain)) ? c.text("ok") : c.text("no", 404);
  });
  app.get("/app", (c) => c.html(dashboardHtml(), 200, { "cache-control": "no-store", "x-frame-options": "DENY" }));

  // --- Admin: tenant yaratish (keyin onboarding UI bilan almashtiriladi) ---
  app.post("/admin/tenants", async (c) => {
    if (!cfg.adminToken || c.req.header("x-admin-token") !== cfg.adminToken) throw new HTTPException(401, { message: "Admin token noto'g'ri" });
    const { name, plan } = await body(c, schemas.tenant);
    return c.json(await svc.createTenant(name, plan), 201);
  });

  app.post("/admin/payouts", async (c) => {
    if (!cfg.adminToken || c.req.header("x-admin-token") !== cfg.adminToken) throw new HTTPException(401, { message: "Admin token noto'g'ri" });
    if (!cfg.monetization) throw new HTTPException(503, { message: "Monetizatsiya yoqilmagan" });
    const p = await body(c, schemas.payout);
    await cfg.monetization.recordPayout(p.tenantId, p.amountUzs, p.reference);
    return c.json({ ok: true }, 201);
  });

  const marketplaceOr503 = () => {
    if (!cfg.marketplace) throw new HTTPException(503, { message: "Katalog yoqilmagan" });
    return cfg.marketplace;
  };
  app.get("/admin/reports", async (c) => {
    if (!cfg.adminToken || c.req.header("x-admin-token") !== cfg.adminToken) throw new HTTPException(401, { message: "Admin token noto'g'ri" });
    return c.json(await marketplaceOr503().openReports());
  });
  app.post("/admin/clones/:id/moderation", async (c) => {
    if (!cfg.adminToken || c.req.header("x-admin-token") !== cfg.adminToken) throw new HTTPException(401, { message: "Admin token noto'g'ri" });
    const m = await body(c, schemas.moderation);
    if (!(await marketplaceOr503().moderate(c.req.param("id"), m.status, m.reason))) throw new HTTPException(404, { message: "Klon topilmadi" });
    return c.json({ ok: true });
  });

  // --- Tenant API (Authorization: Bearer <api key>) ---
  const v1 = new Hono<Env>();
  v1.use("*", async (c, next) => {
    const key = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
    const tenantId = key ? await svc.authenticate(key) : null;
    if (!tenantId) throw new HTTPException(401, { message: "API kalit noto'g'ri yoki yo'q" });
    c.set("tenantId", tenantId);
    await next();
  });

  const t = (c: Context<Env>) => c.get("tenantId");
  const cloneOr404 = async (c: Context<Env>) => {
    const clone = await svc.getClone(t(c), c.req.param("id")!);
    if (!clone) throw new HTTPException(404, { message: "Klon topilmadi" });
    return clone;
  };

  v1.get("/clones", async (c) => c.json(await svc.listClones(t(c))));
  v1.post("/clones", async (c) => c.json(await svc.createClone(t(c), await body(c, schemas.clone)), 201));
  v1.get("/clones/:id", async (c) => c.json(await cloneOr404(c)));
  v1.patch("/clones/:id", async (c) => {
    await cloneOr404(c);
    return c.json(await svc.updateClone(t(c), c.req.param("id"), await body(c, schemas.clonePatch)));
  });
  v1.get("/clones/:id/sources", async (c) => c.json(await svc.listSources(t(c), c.req.param("id"))));
  v1.delete("/sources/:id", async (c) => {
    await svc.deleteSource(t(c), c.req.param("id"));
    return c.json({ ok: true });
  });
  v1.patch("/clones/:id/style", async (c) => {
    await cloneOr404(c);
    return c.json(await svc.updateStyle(t(c), c.req.param("id"), await body(c, style)));
  });

  v1.post("/clones/:id/sources", async (c) => {
    await cloneOr404(c);
    const s = await body(c, schemas.source);
    return c.json(await svc.addSource(t(c), c.req.param("id"), { type: s.type, title: s.title, text: s.text, ...(s.uri ? { uri: s.uri } : {}) }), 201);
  });
  v1.post("/clones/:id/sources/url", async (c) => {
    await cloneOr404(c);
    const { url, title } = await body(c, schemas.urlSource);
    const page = await fetchUrlText(url);
    return c.json(await svc.addSource(t(c), c.req.param("id"), { type: "url", title: title ?? page.title, text: page.text, uri: url }), 201);
  });
  v1.post("/clones/:id/sources/file", async (c) => {
    await cloneOr404(c);
    const len = Number(c.req.header("content-length") ?? 0);
    if (len > MAX_FILE_BYTES + 64 * 1024) throw new HTTPException(413, { message: "Fayl 20 MB dan katta" });
    const form = await c.req.parseBody();
    const file = form.file;
    if (!(file instanceof File)) throw new HTTPException(422, { message: "file maydoni kerak (multipart/form-data)" });
    if (file.size > MAX_FILE_BYTES) throw new HTTPException(413, { message: "Fayl 20 MB dan katta" });
    const data = new Uint8Array(await file.arrayBuffer());
    let doc: ParsedDocument;
    let ocrUsed = false;
    try {
      doc = await parseFile(file.name, file.type, data);
    } catch (err) {
      if (!(err instanceof NeedsOcrError)) throw new HTTPException(err instanceof UnsupportedFileError ? 415 : 422, { message: (err as Error).message });
      if (!cfg.ocr) throw new HTTPException(422, { message: `${err.message}. Serverda OCR sozlanmagan (ANTHROPIC_API_KEY).` });
      if (err.pages > MAX_OCR_PAGES) throw new HTTPException(413, { message: `Skanerlangan hujjat ${err.pages} bet — OCR uchun ${MAX_OCR_PAGES} betgacha bo'lib yuklang` });
      if (cfg.jobs) {
        const title = typeof form.title === "string" && form.title.trim() ? form.title.trim() : err.title;
        const jobId = await cfg.jobs.queue.enqueue(QUEUES.ocr, { cloneId: c.req.param("id"), kind: err.kind, mimeType: err.mimeType, title }, { tenantId: t(c), blob: data, maxAttempts: 3 });
        cfg.jobs.notify?.();
        return c.json({ jobId, status: "queued", ocr: true }, 202);
      }
      try {
        const sections = err.kind === "pdf" ? await cfg.ocr.ocrPdf(data) : await cfg.ocr.ocrImage(data, err.mimeType as "image/png" | "image/jpeg" | "image/webp");
        if (!sections.length) throw new Error("Hujjatda o'qiladigan matn topilmadi");
        doc = { type: "pdf", title: err.title, sections };
        ocrUsed = true;
      } catch (ocrErr) {
        throw new HTTPException(422, { message: `OCR: ${(ocrErr as Error).message}` });
      }
    }
    const title = typeof form.title === "string" && form.title.trim() ? form.title.trim() : doc.title;
    const out = await svc.addSections(t(c), c.req.param("id"), { type: doc.type, title, sections: doc.sections });
    return c.json({ ...out, sections: doc.sections.length, ocr: ocrUsed }, 201);
  });
  v1.post("/clones/:id/sources/youtube", async (c) => {
    await cloneOr404(c);
    const { url, title } = await body(c, schemas.youtube);
    if (cfg.jobs) {
      if (!parseYouTubeId(url)) throw new HTTPException(422, { message: "YouTube havolasi noto'g'ri" });
      const jobId = await cfg.jobs.queue.enqueue(QUEUES.youtube, { cloneId: c.req.param("id"), url, ...(title ? { title } : {}) }, { tenantId: t(c), maxAttempts: 3 });
      cfg.jobs.notify?.();
      return c.json({ jobId, status: "queued" }, 202);
    }
    let tr;
    try {
      tr = await fetchYouTubeTranscript(url, { stt: cfg.stt ?? null });
    } catch (err) {
      throw new HTTPException(422, { message: (err as Error).message });
    }
    const out = await svc.addSections(t(c), c.req.param("id"), { type: "youtube", title: title ?? tr.title, uri: `https://youtu.be/${tr.videoId}`, sections: tr.sections });
    return c.json({ ...out, method: tr.method, language: tr.language ?? null }, 201);
  });
  v1.post("/clones/:id/sources/telegram", async (c) => {
    await cloneOr404(c);
    const s = await body(c, schemas.telegram);
    try {
      return c.json(await svc.importTelegram(t(c), c.req.param("id"), s.export, s.ownerIds), 201);
    } catch (err) {
      throw new HTTPException(422, { message: (err as Error).message });
    }
  });
  v1.post("/clones/:id/exemplars", async (c) => {
    await cloneOr404(c);
    const e = await body(c, schemas.exemplar);
    await svc.addExemplar(t(c), c.req.param("id"), e.question, e.answer, "manual");
    return c.json({ ok: true }, 201);
  });

  v1.post("/clones/:id/chat", async (c) => {
    const s = await body(c, schemas.chat);
    return c.json(await svc.chat(t(c), c.req.param("id"), { channel: "api", externalId: s.externalId, message: s.message, ...(s.name ? { name: s.name } : {}) }));
  });

  v1.get("/clones/:id/conversations", async (c) => c.json(await svc.listConversations(t(c), c.req.param("id"), c.req.query("filter") === "escalated" ? "escalated" : undefined)));
  v1.get("/clones/:id/stats", async (c) => c.json(await svc.stats(t(c), c.req.param("id"))));
  v1.get("/clones/:id/leads", async (c) => {
    const leads = await svc.listLeads(t(c), c.req.param("id"));
    if (c.req.query("format") !== "csv") return c.json(leads);
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = ["name,phone,channel,stage,created_at,note", ...leads.map((l) => [l.name, l.phone, l.channel, l.stage, new Date(l.created_at).toISOString(), l.note].map(esc).join(","))].join("\n");
    return c.body(csv, 200, { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=leads.csv" });
  });

  v1.get("/conversations/:id/messages", async (c) => c.json(await svc.getMessages(t(c), c.req.param("id"))));
  v1.post("/conversations/:id/mode", async (c) => {
    const { mode } = await body(c, schemas.mode);
    await svc.setMode(t(c), c.req.param("id"), mode);
    return c.json({ ok: true, mode });
  });
  v1.post("/conversations/:id/reply", async (c) => {
    const { text } = await body(c, schemas.reply);
    const dest = await svc.ownerReply(t(c), c.req.param("id"), text);
    let delivered = false;
    if (dest.channel === "telegram") {
      // Avval klonning o'z boti (ko'p klonli rejim), bo'lmasa global bot tokeni.
      const own = await cfg.telegram?.resolveByClone(t(c), dest.cloneId);
      const token = own?.token ?? cfg.telegramBotToken;
      if (token) delivered = cfg.telegram ? await cfg.telegram.sendMessage(token, dest.externalId, text) : await sendTelegram(token, dest.externalId, text);
    }
    if ((dest.channel === "instagram" || dest.channel === "whatsapp") && cfg.meta) {
      const ch = await cfg.meta.channels.resolveByClone(t(c), dest.cloneId, dest.channel);
      if (ch) delivered = await cfg.meta.channels.send(ch, dest.externalId, text);
    }
    // Web vidjet egasining javobini /public/:slug/updates orqali oladi.
    return c.json({ ok: true, channel: dest.channel, delivered });
  });
  v1.post("/messages/:id/feedback", async (c) => {
    const f = await body(c, schemas.feedback);
    return c.json(await svc.feedback(t(c), c.req.param("id"), f.rating, f.correction));
  });

  // --- Ko'p klonli Telegram: egasi o'z bot tokenini ulaydi ---
  const telegramOr503 = () => {
    if (!cfg.telegram) throw new HTTPException(503, { message: "Telegram ulash sozlanmagan (CHANNEL_SECRET_KEY va PUBLIC_BASE_URL kerak)" });
    return cfg.telegram;
  };
  v1.get("/clones/:id/telegram", async (c) => {
    await cloneOr404(c);
    const status = cfg.telegram ? await cfg.telegram.status(t(c), c.req.param("id")) : null;
    return c.json({ available: Boolean(cfg.telegram), connected: Boolean(status), ...(status ?? {}) });
  });
  v1.post("/clones/:id/telegram", async (c) => {
    await cloneOr404(c);
    const { token } = await body(c, schemas.telegramToken);
    return c.json(await telegramOr503().connect(t(c), c.req.param("id"), token), 201);
  });
  v1.delete("/clones/:id/telegram", async (c) => {
    await cloneOr404(c);
    return c.json({ ok: await telegramOr503().disconnect(t(c), c.req.param("id")) });
  });

  // --- Instagram DM va WhatsApp ---
  const metaOr503 = () => {
    if (!cfg.meta) throw new HTTPException(503, { message: "Meta kanallari sozlanmagan (CHANNEL_SECRET_KEY va META_APP_SECRET kerak)" });
    return cfg.meta.channels;
  };
  v1.get("/clones/:id/channels", async (c) => {
    await cloneOr404(c);
    return c.json({ available: Boolean(cfg.meta), channels: cfg.meta ? await cfg.meta.channels.list(t(c), c.req.param("id")) : [] });
  });
  v1.post("/clones/:id/channels/instagram", async (c) => {
    await cloneOr404(c);
    const { accessToken } = await body(c, schemas.instagram);
    return c.json(await metaOr503().connectInstagram(t(c), c.req.param("id"), accessToken), 201);
  });
  v1.post("/clones/:id/channels/whatsapp", async (c) => {
    await cloneOr404(c);
    const { phoneNumberId, accessToken } = await body(c, schemas.whatsapp);
    return c.json(await metaOr503().connectWhatsApp(t(c), c.req.param("id"), phoneNumberId, accessToken), 201);
  });
  v1.delete("/clones/:id/channels/:kind{instagram|whatsapp}", async (c) => {
    await cloneOr404(c);
    return c.json({ ok: await metaOr503().disconnect(t(c), c.req.param("id"), c.req.param("kind") as "instagram" | "whatsapp") });
  });

  // --- Ovoz kloni (rozilik → yozuv → rejim → qaytarib olish) ---
  const voiceOr503 = () => {
    if (!cfg.voice) throw new HTTPException(503, { message: "Ovoz kloni yoqilmagan" });
    return cfg.voice;
  };
  const clip = async (f: unknown, fallback: string) => {
    if (!(f instanceof File)) throw new HTTPException(422, { message: `${fallback} fayli kerak` });
    return { data: new Uint8Array(await f.arrayBuffer()), filename: f.name || `${fallback}.webm`, mimeType: f.type || "audio/webm" };
  };
  const avatarOr503 = () => {
    if (!cfg.avatar) throw new HTTPException(503, { message: "Video-avatar yoqilmagan" });
    return cfg.avatar.service;
  };
  v1.get("/clones/:id/avatar", async (c) => c.json(await avatarOr503().status(t(c), c.req.param("id"))));
  v1.post("/clones/:id/avatar", async (c) => {
    await cloneOr404(c);
    const form = await c.req.parseBody();
    if (!(form.photo instanceof File)) throw new HTTPException(422, { message: "photo maydoni kerak (multipart/form-data)" });
    if (typeof form.signature !== "string") throw new HTTPException(422, { message: "Rozilik uchun to'liq ismingizni yozing" });
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    await avatarOr503().enroll(t(c), c.req.param("id"), { photo: new Uint8Array(await form.photo.arrayBuffer()), signature: form.signature, ...(ip ? { ip } : {}) });
    return c.json(await avatarOr503().status(t(c), c.req.param("id")), 201);
  });
  v1.patch("/clones/:id/avatar", async (c) => {
    await avatarOr503().setMode(t(c), c.req.param("id"), (await body(c, schemas.avatarMode)).mode);
    return c.json(await avatarOr503().status(t(c), c.req.param("id")));
  });
  v1.delete("/clones/:id/avatar", async (c) => c.json({ ok: await avatarOr503().revoke(t(c), c.req.param("id")) }));

  v1.get("/clones/:id/voice", async (c) => {
    await cloneOr404(c);
    return c.json(await voiceOr503().status(t(c), c.req.param("id")));
  });
  v1.post("/clones/:id/voice/consent", async (c) => {
    await cloneOr404(c);
    return c.json(await voiceOr503().issueConsent(t(c), c.req.param("id")), 201);
  });
  v1.post("/clones/:id/voice", async (c) => {
    await cloneOr404(c);
    const form = await c.req.parseBody({ all: true });
    const consentId = typeof form.consentId === "string" ? form.consentId : "";
    const sampleFiles = ([] as unknown[]).concat(form.samples ?? form["samples[]"] ?? []);
    const samples = await Promise.all(sampleFiles.map((f, i) => clip(f, `namuna-${i + 1}`)));
    const out = await voiceOr503().enroll(t(c), c.req.param("id"), {
      consentId,
      consent: await clip(form.consent, "rozilik"),
      samples,
      ...(c.req.header("x-forwarded-for") ? { ip: c.req.header("x-forwarded-for")!.split(",")[0]!.trim() } : {}),
    });
    return c.json(out, 201);
  });
  v1.patch("/clones/:id/voice", async (c) => {
    await cloneOr404(c);
    const { mode } = await body(c, schemas.voiceMode);
    await voiceOr503().setMode(t(c), c.req.param("id"), mode);
    return c.json({ ok: true, mode });
  });
  v1.delete("/clones/:id/voice", async (c) => {
    await cloneOr404(c);
    return c.json({ ok: await voiceOr503().revoke(t(c), c.req.param("id")) });
  });
  v1.post("/clones/:id/voice/preview", async (c) => {
    await cloneOr404(c);
    const { text } = await body(c, schemas.voicePreview);
    const out = await voiceOr503().preview(t(c), c.req.param("id"), text);
    return c.body(out.audio as unknown as ArrayBuffer, 200, { "content-type": out.mimeType, "cache-control": "no-store" });
  });

  // --- Klon monetizatsiyasi ---
  const monOr503 = () => {
    if (!cfg.monetization) throw new HTTPException(503, { message: "Monetizatsiya yoqilmagan (PAYMENT_LINK_SECRET va PUBLIC_BASE_URL kerak)" });
    return cfg.monetization;
  };
  v1.get("/clones/:id/monetization", async (c) => {
    await cloneOr404(c);
    if (!cfg.monetization) return c.json({ available: false });
    return c.json({ available: true, ...(await cfg.monetization.settings(t(c), c.req.param("id"))) });
  });
  v1.patch("/clones/:id/monetization", async (c) => {
    await cloneOr404(c);
    await monOr503().updateSettings(t(c), c.req.param("id"), await body(c, schemas.monetization));
    return c.json({ ok: true });
  });
  v1.post("/clones/:id/products", async (c) => {
    await cloneOr404(c);
    const p = await body(c, schemas.product);
    return c.json(await monOr503().createProduct(t(c), c.req.param("id"), p), 201);
  });
  v1.patch("/products/:id", async (c) => {
    const { active } = await body(c, schemas.productPatch);
    await monOr503().setProductActive(t(c), c.req.param("id"), active);
    return c.json({ ok: true });
  });
  v1.get("/earnings", async (c) => c.json(await monOr503().earnings(t(c))));

  const billingOr503 = () => {
    if (!billing) throw new HTTPException(503, { message: "To'lovlar yoqilmagan" });
    return billing;
  };
  v1.get("/billing", async (c) => c.json(await billingOr503().summary(t(c))));
  v1.post("/billing/orders", async (c) => {
    const o = await body(c, schemas.order);
    return c.json(await billingOr503().createOrder(t(c), o.plan, o.months, o.provider), 201);
  });

  v1.get("/clones/:id/marketplace", async (c) => {
    if (!cfg.marketplace) return c.json({ available: false });
    return c.json({ available: true, categories: CATEGORIES, ...(await cfg.marketplace.settings(t(c), c.req.param("id"))) });
  });
  v1.patch("/clones/:id/marketplace", async (c) => {
    const m = await body(c, schemas.marketplace);
    return c.json(await marketplaceOr503().update(t(c), c.req.param("id"), m));
  });

  const whiteLabelOr503 = () => {
    if (!cfg.whiteLabel) throw new HTTPException(503, { message: "White-label yoqilmagan" });
    return cfg.whiteLabel;
  };
  v1.get("/clones/:id/white-label", async (c) => c.json(await whiteLabelOr503().settings(t(c), c.req.param("id"))));
  v1.patch("/clones/:id/white-label/brand", async (c) => c.json(await whiteLabelOr503().updateBrand(t(c), c.req.param("id"), await body(c, schemas.brand))));
  v1.put("/clones/:id/white-label/domain", async (c) => c.json(await whiteLabelOr503().setDomain(t(c), c.req.param("id"), (await body(c, schemas.domain)).domain)));
  v1.post("/clones/:id/white-label/domain/verify", async (c) => {
    const status = await whiteLabelOr503().verifyDomain(t(c), c.req.param("id"));
    hostCache.delete(status.domain);
    return c.json(status);
  });
  v1.delete("/clones/:id/white-label/domain", async (c) => {
    const s = await whiteLabelOr503().settings(t(c), c.req.param("id"));
    if (s.domain) hostCache.delete(s.domain.domain);
    return c.json({ ok: await whiteLabelOr503().removeDomain(t(c), c.req.param("id")) });
  });

  v1.get("/jobs/:jobId", async (c) => {
    const job = cfg.jobs ? await cfg.jobs.queue.get(t(c), c.req.param("jobId")) : null;
    if (!job) throw new HTTPException(404, { message: "Vazifa topilmadi" });
    return c.json(job);
  });

  app.route("/v1", v1);

  // --- Telegram webhook: har bir klonning boti uchun alohida manzil va sir ---
  const dispatch = cfg.telegram
    ? createWebhookDispatcher(svc, cfg.telegram, {
        stt: cfg.stt ?? null,
        voice: cfg.voice ?? null,
        ...(cfg.telegramClient ? { client: cfg.telegramClient } : {}),
        ...(cfg.avatar?.request
          ? {
              avatar: (bot, req) =>
                cfg.avatar!.request!({ tenantId: bot.tenantId, cloneId: bot.cloneId, conversationId: req.conversationId, reply: req.reply, channel: "telegram", recipient: req.chatId, botId: bot.id }),
            }
          : {}),
      })
    : null;
  app.post("/telegram/:id", async (c) => {
    if (!dispatch) return c.json({ error: "Telegram sozlanmagan" }, 404);
    const update = (await c.req.json().catch(() => null)) as Update | null;
    if (!update || typeof update.update_id !== "number") return c.json({ error: "Update noto'g'ri" }, 400);
    const id = c.req.param("id");
    const secret = c.req.header("x-telegram-bot-api-secret-token");
    if (cfg.jobs) {
      // Telegram javobni ~60 soniya kutadi va xato bo'lsa qayta yuboradi: tez tasdiqlab, ishni worker'ga beramiz.
      if (!(await cfg.telegram!.resolveWebhook(id, secret))) return c.json({ error: "Ruxsat yo'q" }, 401);
      await cfg.jobs.queue.enqueue(QUEUES.telegram, { botId: id, update }, { singletonKey: `tg:${id}:${update.update_id}`, groupKey: telegramGroupKey(id, update), maxAttempts: 3 });
      cfg.jobs.notify?.();
      return c.json({ ok: true });
    }
    const ok = await dispatch(id, secret, update);
    return ok ? c.json({ ok: true }) : c.json({ error: "Ruxsat yo'q" }, 401);
  });

  // --- Meta webhook: Instagram va WhatsApp uchun bitta manzil (Meta ilovasi sozlamalarida) ---
  app.get("/meta/webhook", (c) => {
    if (!cfg.meta || !cfg.meta.verifyToken) return c.text("Meta sozlanmagan", 404);
    if (c.req.query("hub.mode") === "subscribe" && c.req.query("hub.verify_token") === cfg.meta.verifyToken) return c.text(c.req.query("hub.challenge") ?? "");
    return c.text("Forbidden", 403);
  });
  app.post("/meta/webhook", async (c) => {
    if (!cfg.meta) return c.text("Meta sozlanmagan", 404);
    const raw = await c.req.text();
    if (!verifyMetaSignature(raw, c.req.header("x-hub-signature-256"), cfg.meta.appSecret)) return c.text("Imzo noto'g'ri", 401);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return c.text("JSON xato", 400);
    }
    const events = parseMetaWebhook(json);
    if (cfg.jobs) {
      let queued = 0;
      let skipped = 0;
      for (const ev of events) {
        const ch = await cfg.meta.channels.resolveByAccount(ev.kind, ev.accountId);
        // Takroriy yetkazish singleton kalit bilan atomar ravishda bitta vazifaga aylanadi.
        const jobId = ch
          ? await cfg.jobs.queue.enqueue(QUEUES.meta, { event: ev }, { tenantId: ch.tenantId, singletonKey: `meta:${ev.messageId}`, groupKey: `meta:${ev.kind}:${ev.accountId}:${ev.senderId}`, maxAttempts: 3 })
          : null;
        if (jobId) queued++;
        else skipped++;
      }
      if (queued) cfg.jobs.notify?.();
      return c.json({ ok: true, queued, skipped });
    }
    const result = await processMetaInbound(svc, cfg.meta.channels, events, cfg.stt ?? null);
    return c.json({ ok: true, ...result });
  });

  // --- To'lov tizimlari webhooklari (har doim HTTP 200 — protokol talabi) ---
  app.post("/payments/payme", async (c) => {
    const json = await c.req.json().catch(() => null);
    if (json === null) return c.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: { uz: "JSON xato", ru: "Ошибка парсинга JSON", en: "Parse error" } } });
    return c.json(await billingOr503().handlePayme(json, c.req.header("authorization")));
  });
  const click = async (c: Context) => {
    const form = await c.req.parseBody();
    const params = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, String(v)]));
    return c.json(await billingOr503().handleClick(params));
  };
  app.post("/payments/click/prepare", click);
  app.post("/payments/click/complete", click);

  // --- Ommaviy kanallar: vidjet va klon sahifasi ---
  app.use("/public/*", cors());
  app.post("/public/:slug/chat", async (c) => {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!publicLimiter.allow(`${ip}:${c.req.param("slug")}`)) throw new HTTPException(429, { message: "Juda ko'p so'rov, birozdan keyin urinib ko'ring" });
    const target = await svc.resolveSlug(c.req.param("slug"));
    if (!target) throw new HTTPException(404, { message: "Klon topilmadi" });
    const { visitorId, message } = await body(c, schemas.publicChat);
    const out = await svc.chat(target.tenantId, target.cloneId, { channel: "web", externalId: visitorId, message });
    // Video qo'shimcha: so'rov yaratilmasa ham matnli javob baribir qaytadi.
    const videoId =
      out.reply && !out.paywall && cfg.avatar?.request
        ? await cfg.avatar.request({ tenantId: target.tenantId, cloneId: target.cloneId, conversationId: out.conversationId, reply: out.reply, channel: "web", recipient: visitorId }).catch((err: Error) => {
            console.error("Video so'rovi yaratilmadi:", err.message);
            return null;
          })
        : null;
    return c.json({
      reply: out.reply,
      citations: out.citations,
      messageId: out.messageId,
      humanMode: out.mode !== "bot",
      ...(out.paywall ? { offers: out.paywall.offers } : {}),
      ...(videoId ? { video: { id: videoId } } : {}),
    });
  });
  app.post("/public/:slug/feedback", async (c) => {
    const target = await svc.resolveSlug(c.req.param("slug"));
    if (!target) throw new HTTPException(404, { message: "Klon topilmadi" });
    const f = await body(c, schemas.visitorFeedback);
    if (!(await svc.visitorFeedback(target.tenantId, target.cloneId, "web", f.visitorId, f.messageId, f.rating))) throw new HTTPException(404, { message: "Xabar topilmadi" });
    return c.json({ ok: true });
  });
  app.post("/public/:slug/report", async (c) => {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!publicLimiter.allow(`report:${ip}`)) throw new HTTPException(429, { message: "Juda ko'p so'rov, birozdan keyin urinib ko'ring" });
    const target = await svc.resolveSlug(c.req.param("slug"));
    if (!target) throw new HTTPException(404, { message: "Klon topilmadi" });
    const r = await body(c, schemas.report);
    return c.json(await marketplaceOr503().report(target.cloneId, r.visitorId, r.reason, r.details), 201);
  });
  app.get("/public/marketplace", async (c) => {
    const category = c.req.query("category");
    const cat = category && category in CATEGORIES ? (category as Category) : undefined;
    const offset = Math.max(0, Number(c.req.query("offset")) || 0);
    const cards = await marketplaceOr503().search({ ...(c.req.query("q") ? { q: c.req.query("q")! } : {}), ...(cat ? { category: cat } : {}), offset, limit: PAGE_SIZE });
    return c.json(cards, 200, { "cache-control": "public, max-age=60" });
  });
  app.get("/explore", async (c) => {
    if (!cfg.marketplace) return c.text("Katalog yoqilmagan", 404);
    const q = (c.req.query("q") ?? "").slice(0, 100);
    const category = c.req.query("category");
    const cat = category && category in CATEGORIES ? (category as Category) : null;
    const page = Math.min(1000, Math.max(1, Number(c.req.query("page")) || 1));
    // Bitta ortiqcha yozuv — "Keyingi" havolasini ko'rsatish kerakligini bilish uchun.
    const cards = await cfg.marketplace.search({ ...(q ? { q } : {}), ...(cat ? { category: cat } : {}), offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE + 1 });
    return c.html(exploreHtml(cards.slice(0, PAGE_SIZE), { q, category: cat, page, hasMore: cards.length > PAGE_SIZE }), 200, { "cache-control": "public, max-age=60" });
  });
  const visitorVideo = async (c: Context) => {
    const target = await svc.resolveSlug(c.req.param("slug")!);
    const visitorId = c.req.query("visitorId") ?? "";
    if (!target || !cfg.avatar || !/^[\w-]{8,64}$/.test(visitorId)) throw new HTTPException(404, { message: "Topilmadi" });
    const v = await cfg.avatar.service.forVisitor(target.cloneId, c.req.param("id")!, visitorId);
    if (!v) throw new HTTPException(404, { message: "Topilmadi" });
    return v;
  };
  app.get("/public/:slug/video/:id", async (c) => c.json({ status: (await visitorVideo(c)).status }));
  app.get("/public/:slug/video/:id/file", async (c) => {
    const v = await visitorVideo(c);
    if (!v.video) throw new HTTPException(404, { message: "Video hali tayyor emas" });
    return c.body(new Uint8Array(v.video), 200, { "content-type": "video/mp4", "cache-control": "private, max-age=86400" });
  });
  app.get("/public/:slug/config", async (c) => {
    const target = await svc.resolveSlug(c.req.param("slug"));
    if (!target) throw new HTTPException(404, { message: "Klon topilmadi" });
    const brand = cfg.whiteLabel ? await cfg.whiteLabel.publicBrand(target.tenantId, target.cloneId) : { accent: null, logoUrl: null, hidePoweredBy: false };
    return c.json({ accent: brand.accent, logoUrl: brand.logoUrl }, 200, { "cache-control": "public, max-age=300" });
  });
  app.get("/public/:slug/updates", async (c) => {
    const target = await svc.resolveSlug(c.req.param("slug"));
    const visitorId = c.req.query("visitorId") ?? "";
    if (!target || !/^[\w-]{8,64}$/.test(visitorId)) throw new HTTPException(404, { message: "Topilmadi" });
    const after = new Date(c.req.query("after") ?? 0);
    const rows = await svc.ownerMessagesSince(target.tenantId, target.cloneId, "web", visitorId, Number.isNaN(after.getTime()) ? new Date(0) : after);
    return c.json(rows.map((r) => ({ id: r.id, text: r.content, at: r.created_at })));
  });
  // --- Obunachi to'lov sahifasi: imzolangan havola → to'lov tizimini tanlash → checkout ---
  app.get("/pay/:token", async (c) => {
    const info = cfg.monetization ? await cfg.monetization.productForLink(c.req.param("token")) : null;
    if (!info) return c.html(payPageHtml(null, c.req.param("token")), 404);
    if (info.providers.length === 1) return c.redirect(`/pay/${c.req.param("token")}/${info.providers[0]}`);
    return c.html(payPageHtml(info, c.req.param("token")));
  });
  app.get("/pay/:token/:provider{payme|click}", async (c) => {
    if (!cfg.monetization) return c.text("Monetizatsiya yoqilmagan", 404);
    const { checkoutUrl } = await cfg.monetization.checkout(c.req.param("token"), c.req.param("provider") as "payme" | "click");
    return c.redirect(checkoutUrl);
  });
  app.get("/widget.js", (c) => c.body(widgetJs(cfg.publicBaseUrl ?? new URL(c.req.url).origin), 200, { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=300" }));
  app.get("/c/:slug", async (c) => {
    const target = await svc.resolveSlug(c.req.param("slug"));
    if (!target) return c.text("Klon topilmadi", 404);
    return renderClonePage(c, target, cfg.publicBaseUrl ?? new URL(c.req.url).origin);
  });

  async function renderClonePage(c: Context, target: { tenantId: string; cloneId: string }, base: string) {
    const clone = await svc.getClone(target.tenantId, target.cloneId);
    if (!clone) return c.text("Klon topilmadi", 404);
    const listed = cfg.marketplace ? await cfg.marketplace.isListed(target.cloneId) : false;
    const brand = cfg.whiteLabel ? await cfg.whiteLabel.publicBrand(target.tenantId, target.cloneId) : null;
    return c.html(clonePageHtml(clone.slug, clone.persona.name, clone.persona.bio, base, { listed, ...(brand ? { brand } : {}) }));
  }

  return app;
}

/** Ko'p klonli rejim o'chiq bo'lganda global bot orqali yuborish; xato — false (xabar saqlangan). */
async function sendTelegram(token: string, chatId: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
