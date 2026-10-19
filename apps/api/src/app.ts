import { PaymentNotConfiguredError, type BillingService, type CloneService } from "@ai-clone/db";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { fetchUrlText } from "./fetch-url.js";
import { RateLimiter } from "./rate-limit.js";
import { dashboardHtml } from "./dashboard.js";
import { clonePageHtml, widgetJs } from "./widget.js";

export interface AppConfig {
  adminToken?: string;
  telegramBotToken?: string;
  publicBaseUrl?: string;
}

type Env = { Variables: { tenantId: string } };

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
  telegram: z.object({ export: z.unknown(), ownerIds: z.array(z.string()).default([]) }),
  exemplar: z.object({ question: z.string().min(1).max(2000), answer: z.string().min(1).max(4000) }),
  chat: z.object({ externalId: z.string().min(1).max(200), message: z.string().min(1).max(4000), name: z.string().max(200).optional() }),
  publicChat: z.object({ visitorId: z.string().regex(/^[\w-]{8,64}$/), message: z.string().min(1).max(2000) }),
  mode: z.object({ mode: z.enum(["bot", "human", "paused"]) }),
  reply: z.object({ text: z.string().min(1).max(4000) }),
  order: z.object({ plan: z.enum(["creator", "pro", "business"]), months: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]).default(1), provider: z.enum(["payme", "click"]) }),
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
  const publicLimiter = new RateLimiter(20, 60_000);

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    if (err instanceof PaymentNotConfiguredError) return c.json({ error: err.message }, 503);
    if (err.message.includes("topilmadi")) return c.json({ error: err.message }, 404);
    if ((err as { code?: string }).code === "23505") return c.json({ error: "Bunday yozuv allaqachon mavjud" }, 409);
    console.error(err);
    return c.json({ error: "Ichki xato" }, 500);
  });

  app.get("/health", (c) => c.json({ ok: true }));
  app.get("/app", (c) => c.html(dashboardHtml(), 200, { "cache-control": "no-store", "x-frame-options": "DENY" }));

  // --- Admin: tenant yaratish (keyin onboarding UI bilan almashtiriladi) ---
  app.post("/admin/tenants", async (c) => {
    if (!cfg.adminToken || c.req.header("x-admin-token") !== cfg.adminToken) throw new HTTPException(401, { message: "Admin token noto'g'ri" });
    const { name, plan } = await body(c, schemas.tenant);
    return c.json(await svc.createTenant(name, plan), 201);
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
    if (dest.channel === "telegram" && cfg.telegramBotToken) {
      const res = await fetch(`https://api.telegram.org/bot${cfg.telegramBotToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: dest.externalId, text }),
      });
      delivered = res.ok;
    }
    // Web vidjet egasining javobini /public/:slug/updates orqali oladi.
    return c.json({ ok: true, channel: dest.channel, delivered });
  });
  v1.post("/messages/:id/feedback", async (c) => {
    const f = await body(c, schemas.feedback);
    return c.json(await svc.feedback(t(c), c.req.param("id"), f.rating, f.correction));
  });

  const billingOr503 = () => {
    if (!billing) throw new HTTPException(503, { message: "To'lovlar yoqilmagan" });
    return billing;
  };
  v1.get("/billing", async (c) => c.json(await billingOr503().summary(t(c))));
  v1.post("/billing/orders", async (c) => {
    const o = await body(c, schemas.order);
    return c.json(await billingOr503().createOrder(t(c), o.plan, o.months, o.provider), 201);
  });

  app.route("/v1", v1);

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
    return c.json({ reply: out.reply, citations: out.citations, messageId: out.messageId, humanMode: out.mode !== "bot" });
  });
  app.get("/public/:slug/updates", async (c) => {
    const target = await svc.resolveSlug(c.req.param("slug"));
    const visitorId = c.req.query("visitorId") ?? "";
    if (!target || !/^[\w-]{8,64}$/.test(visitorId)) throw new HTTPException(404, { message: "Topilmadi" });
    const after = new Date(c.req.query("after") ?? 0);
    const rows = await svc.ownerMessagesSince(target.tenantId, target.cloneId, "web", visitorId, Number.isNaN(after.getTime()) ? new Date(0) : after);
    return c.json(rows.map((r) => ({ id: r.id, text: r.content, at: r.created_at })));
  });
  app.get("/widget.js", (c) => c.body(widgetJs(cfg.publicBaseUrl ?? new URL(c.req.url).origin), 200, { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=300" }));
  app.get("/c/:slug", async (c) => {
    const target = await svc.resolveSlug(c.req.param("slug"));
    if (!target) return c.text("Klon topilmadi", 404);
    const clone = await svc.getClone(target.tenantId, target.cloneId);
    return c.html(clonePageHtml(clone!.slug, clone!.persona.name, clone!.persona.bio, cfg.publicBaseUrl ?? new URL(c.req.url).origin));
  });

  return app;
}
