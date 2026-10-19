import { HashingEmbedder, LLMRouter, MockProvider, mockPolicy } from "@ai-clone/core";
import { BillingService, CloneService, TelegramChannels, createPool, migrate, type Db } from "@ai-clone/db";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { htmlToText } from "../src/fetch-url.js";
import { RateLimiter } from "../src/rate-limit.js";

describe("htmlToText", () => {
  it("sarlavha va matnni ajratadi, skriptlarni olib tashlaydi", () => {
    const out = htmlToText("<html><head><title>Kurs &amp; narx</title><script>evil()</script></head><body><nav>menu</nav><p>Narxi 1&nbsp;200 000</p><p>Zoom</p></body></html>");
    expect(out.title).toBe("Kurs & narx");
    expect(out.text).toContain("Narxi 1 200 000");
    expect(out.text).not.toContain("evil");
    expect(out.text).not.toContain("menu");
  });
});

describe("RateLimiter", () => {
  it("oynadagi limitdan oshganda rad etadi", () => {
    const rl = new RateLimiter(2, 1000);
    expect([rl.allow("a", 0), rl.allow("a", 1), rl.allow("a", 2), rl.allow("a", 1500)]).toEqual([true, true, false, true]);
  });
});

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("HTTP API (Postgres)", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  // Soxta Telegram Bot API: barcha chaqiruvlar shu yerda yoziladi.
  const tgCalls: { method: string; token: string; body: Record<string, unknown> }[] = [];
  const tgFetch = (async (url: string | URL, init?: RequestInit) => {
    const m = String(url).match(/\/bot([^/]+)\/(\w+)$/)!;
    const body = init?.body ? (typeof init.body === "string" ? JSON.parse(init.body) : {}) : {};
    tgCalls.push({ token: m[1]!, method: m[2]!, body });
    if (m[1]!.startsWith("000000")) return new Response(JSON.stringify({ ok: false, error_code: 401, description: "Unauthorized" }), { status: 401 });
    const result =
      m[2] === "getMe"
        ? { id: Number(m[1]!.split(":")[0]), is_bot: true, first_name: "Klon bot", username: `bot_${m[1]!.split(":")[0]}`, can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false }
        : m[2] === "sendMessage"
          ? { message_id: 1, date: 0, chat: { id: body.chat_id, type: "private" }, text: body.text }
          : true;
    return new Response(JSON.stringify({ ok: true, result }));
  }) as unknown as typeof fetch;
  let apiKey: string;
  let otherKey: string;
  let cloneId: string;
  const slug = `api-${Date.now().toString(36)}`;
  const tenants: string[] = [];

  const call = (path: string, init: RequestInit & { key?: string } = {}) =>
    app.request(path, {
      ...init,
      headers: { "content-type": "application/json", ...(init.key ? { authorization: `Bearer ${init.key}` } : {}), ...(init.headers as Record<string, string>) },
    });

  beforeAll(async () => {
    db = createPool(url);
    await migrate(db);
    const telegram = new TelegramChannels(db, randomBytes(32), "https://api.aiclone.uz", tgFetch);
    app = createApp(
      new CloneService(db, new HashingEmbedder(), new LLMRouter([new MockProvider()], mockPolicy())),
      { adminToken: "admin-secret", telegram, telegramClient: { fetch: tgFetch as never } },
      new BillingService(db, { payme: { merchantId: "m1", key: "pk" } }),
    );
    for (const name of ["API A", "API B"]) {
      const r = await call("/admin/tenants", { method: "POST", headers: { "x-admin-token": "admin-secret" }, body: JSON.stringify({ name, plan: "pro" }) });
      expect(r.status).toBe(201);
      const j = (await r.json()) as { tenantId: string; apiKey: string };
      tenants.push(j.tenantId);
      if (!apiKey) apiKey = j.apiKey;
      else otherKey = j.apiKey;
    }
  });

  afterAll(async () => {
    await db.query("DELETE FROM tenants WHERE id = ANY($1)", [tenants]);
    await db.end();
  });

  it("admin tokensiz tenant yaratib bo'lmaydi", async () => {
    expect((await call("/admin/tenants", { method: "POST", body: JSON.stringify({ name: "x" }) })).status).toBe(401);
  });

  it("API kalitsiz /v1 yopiq", async () => {
    expect((await call("/v1/clones", { method: "POST", body: "{}" })).status).toBe(401);
  });

  it("noto'g'ri slug 422 qaytaradi", async () => {
    const r = await call("/v1/clones", { method: "POST", key: apiKey, body: JSON.stringify({ slug: "A B", name: "X" }) });
    expect(r.status).toBe(422);
  });

  it("klon yaratish, bilim yuklash, chat va lid eksporti", async () => {
    const r = await call("/v1/clones", { method: "POST", key: apiKey, body: JSON.stringify({ slug, name: "Dilnoza", bio: "IELTS ustoz" }) });
    expect(r.status).toBe(201);
    cloneId = ((await r.json()) as { id: string }).id;

    const dup = await call("/v1/clones", { method: "POST", key: apiKey, body: JSON.stringify({ slug, name: "Dilnoza" }) });
    expect(dup.status).toBe(409);

    const s = await call(`/v1/clones/${cloneId}/sources`, { method: "POST", key: apiKey, body: JSON.stringify({ title: "Kurs", text: "IELTS kursi narxi oyiga 1 200 000 so'm. Darslar Zoom orqali." }) });
    expect(((await s.json()) as { chunks: number }).chunks).toBe(1);

    const chat = await call(`/v1/clones/${cloneId}/chat`, { method: "POST", key: apiKey, body: JSON.stringify({ externalId: "u1", message: "Kurs narxi qancha? Raqamim 90 111 22 33" }) });
    const body = (await chat.json()) as { reply: string; leadCaptured: boolean };
    expect(body.reply).toContain("1 200 000");
    expect(body.leadCaptured).toBe(true);

    const csv = await call(`/v1/clones/${cloneId}/leads?format=csv`, { key: apiKey });
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(await csv.text()).toContain("+998901112233");
  });

  it("boshqa tenant klonga kira olmaydi", async () => {
    expect((await call(`/v1/clones/${cloneId}`, { key: otherKey })).status).toBe(404);
    expect((await call(`/v1/clones/${cloneId}/chat`, { method: "POST", key: otherKey, body: JSON.stringify({ externalId: "x", message: "salom" }) })).status).toBe(404);
    expect(await (await call(`/v1/clones/${cloneId}/leads`, { key: otherKey })).json()).toEqual([]);
  });

  it("ommaviy chat, inson rejimi va vidjet yangilanishlari", async () => {
    const visitorId = "visitor-1234";
    const first = await call(`/public/${slug}/chat`, { method: "POST", body: JSON.stringify({ visitorId, message: "Darslar qayerda bo'ladi?" }) });
    expect(first.status).toBe(200);
    expect(((await first.json()) as { reply: string }).reply).toContain("AI-kloniman");

    const convs = (await (await call(`/v1/clones/${cloneId}/conversations`, { key: apiKey })).json()) as { id: string; channel: string }[];
    const conv = convs.find((c) => c.channel === "web")!;
    await call(`/v1/conversations/${conv.id}/mode`, { method: "POST", key: apiKey, body: JSON.stringify({ mode: "human" }) });

    const during = (await (await call(`/public/${slug}/chat`, { method: "POST", body: JSON.stringify({ visitorId, message: "Chegirma bormi?" }) })).json()) as { reply: string | null; humanMode: boolean };
    expect(during).toMatchObject({ reply: null, humanMode: true });

    await call(`/v1/conversations/${conv.id}/reply`, { method: "POST", key: apiKey, body: JSON.stringify({ text: "Ha, 10% bor!" }) });
    const updates = (await (await call(`/public/${slug}/updates?visitorId=${visitorId}&after=1970-01-01T00:00:00Z`)).json()) as { text: string }[];
    expect(updates.map((u) => u.text)).toEqual(["Ha, 10% bor!"]);
  });

  it("dashboard endpointlari: klonlar ro'yxati, tahrirlash, manbalar", async () => {
    const list = (await (await call("/v1/clones", { key: apiKey })).json()) as { id: string }[];
    expect(list.map((c) => c.id)).toContain(cloneId);
    expect(await (await call("/v1/clones", { key: otherKey })).json()).toEqual([]);

    const patched = (await (await call(`/v1/clones/${cloneId}`, { method: "PATCH", key: apiKey, body: JSON.stringify({ bio: "Yangi bio", ownerTelegramChatId: "777" }) })).json()) as {
      persona: { bio: string; name: string };
      ownerTelegramChatId: string;
    };
    expect(patched.persona).toMatchObject({ bio: "Yangi bio", name: "Dilnoza" });
    expect(patched.ownerTelegramChatId).toBe("777");

    const sources = (await (await call(`/v1/clones/${cloneId}/sources`, { key: apiKey })).json()) as { id: string; chunks: number }[];
    expect(sources[0]?.chunks).toBe(1);
    expect((await call(`/v1/sources/${sources[0]!.id}`, { method: "DELETE", key: otherKey })).status).toBe(404);
    expect((await call(`/v1/sources/${sources[0]!.id}`, { method: "DELETE", key: apiKey })).status).toBe(200);
    expect(await (await call(`/v1/clones/${cloneId}/sources`, { key: apiKey })).json()).toEqual([]);

    const app = await call("/app");
    expect(app.headers.get("x-frame-options")).toBe("DENY");
    expect(await app.text()).toContain("AI Clone");
  });

  it("billing: buyurtma, sozlanmagan provayder, Payme webhook har doim 200", async () => {
    const order = await call("/v1/billing/orders", { method: "POST", key: apiKey, body: JSON.stringify({ plan: "pro", months: 1, provider: "payme" }) });
    expect(order.status).toBe(201);
    expect(((await order.json()) as { checkoutUrl: string }).checkoutUrl).toMatch(/^https:\/\/checkout\.paycom\.uz\//);
    expect((await call("/v1/billing/orders", { method: "POST", key: apiKey, body: JSON.stringify({ plan: "pro", provider: "click" }) })).status).toBe(503);
    const summary = (await (await call("/v1/billing", { key: apiKey })).json()) as { plan: string; providers: string[] };
    expect(summary).toMatchObject({ plan: "pro", providers: ["payme"] });

    const unauth = await call("/payments/payme", { method: "POST", body: JSON.stringify({ id: 5, method: "CheckTransaction", params: { id: "x" } }) });
    expect(unauth.status).toBe(200);
    expect(await unauth.json()).toMatchObject({ id: 5, error: { code: -32504 } });
    const parse = await call("/payments/payme", { method: "POST", body: "{bad" });
    expect(await parse.json()).toMatchObject({ error: { code: -32700 } });

    const click = await app.request("/payments/click/prepare", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "click_trans_id=1&merchant_trans_id=2" });
    expect(await click.json()).toMatchObject({ error: -8 });
  });

  it("fayl yuklash: PDF sahifa iqtibosi bilan, noto'g'ri format 415", async () => {
    const pdf = await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../packages/core/test/fixtures/kurs.pdf"));
    const fd = new FormData();
    fd.append("file", new File([pdf], "IELTS qo'llanma.pdf", { type: "application/pdf" }));
    const r = await app.request(`/v1/clones/${cloneId}/sources/file`, { method: "POST", headers: { authorization: `Bearer ${apiKey}` }, body: fd });
    expect(r.status).toBe(201);
    expect(await r.json()).toMatchObject({ chunks: 2, sections: 2, duplicate: false });

    const chat = (await (await call(`/v1/clones/${cloneId}/chat`, { method: "POST", key: apiKey, body: JSON.stringify({ externalId: "pdf-user", message: "Speaking bo'limida eng muhimi nima?" }) })).json()) as { citations: { title: string }[] };
    expect(chat.citations[0]?.title).toBe("IELTS qo'llanma, 2-bet");

    const bad = new FormData();
    bad.append("file", new File([new Uint8Array([1])], "rasm.png", { type: "image/png" }));
    expect((await app.request(`/v1/clones/${cloneId}/sources/file`, { method: "POST", headers: { authorization: `Bearer ${apiKey}` }, body: bad })).status).toBe(415);
    expect((await call(`/v1/clones/${cloneId}/sources/youtube`, { method: "POST", key: apiKey, body: JSON.stringify({ url: "https://example.com/x" }) })).status).toBe(422);
  });

  it("Telegram: bot ulash → webhook orqali suhbat → egasining javobi klon boti orqali", async () => {
    const TOKEN = "777000111:AAEexampleexampleexampleexampleXYZ";
    expect(await (await call(`/v1/clones/${cloneId}/telegram`, { key: apiKey })).json()).toMatchObject({ available: true, connected: false });
    expect((await call(`/v1/clones/${cloneId}/telegram`, { method: "POST", key: apiKey, body: JSON.stringify({ token: "noto'g'ri" }) })).status).toBe(422);
    expect((await call(`/v1/clones/${cloneId}/telegram`, { method: "POST", key: apiKey, body: JSON.stringify({ token: "bu-token-emas-umuman" }) })).status).toBe(400);
    expect((await call(`/v1/clones/${cloneId}/telegram`, { method: "POST", key: apiKey, body: JSON.stringify({ token: "000000111:AAEexampleexampleexampleexampleXYZ" }) })).status).toBe(400);

    const r = await call(`/v1/clones/${cloneId}/telegram`, { method: "POST", key: apiKey, body: JSON.stringify({ token: TOKEN }) });
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ botUsername: "bot_777000111" });
    const hook = tgCalls.find((c) => c.method === "setWebhook")!;
    expect(hook.body.url).toMatch(/^https:\/\/api\.aiclone\.uz\/telegram\/[0-9a-f-]{36}$/);
    const status = (await (await call(`/v1/clones/${cloneId}/telegram`, { key: apiKey })).json()) as Record<string, unknown>;
    expect(status).toMatchObject({ connected: true, botUsername: "bot_777000111" });
    expect(JSON.stringify(status)).not.toContain("AAEexample");
    const stored = (await db.query("SELECT token_enc FROM telegram_bots WHERE bot_id = 777000111")).rows[0].token_enc as string;
    expect(stored).not.toContain("AAEexample");

    // Boshqa tenant xuddi shu botni ulay olmaydi
    const otherClone = (await (await call("/v1/clones", { method: "POST", key: otherKey, body: JSON.stringify({ slug: `${slug}-b`, name: "B" }) })).json()) as { id: string };
    expect((await call(`/v1/clones/${otherClone.id}/telegram`, { method: "POST", key: otherKey, body: JSON.stringify({ token: TOKEN }) })).status).toBe(409);

    const path = new URL(String(hook.body.url)).pathname;
    const update = { update_id: 1, message: { message_id: 5, date: 0, chat: { id: 4242, type: "private", first_name: "Vali" }, from: { id: 4242, is_bot: false, first_name: "Vali" }, text: "Speaking bo'limida eng muhimi nima?" } };
    expect((await app.request(path, { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "xato" }, body: JSON.stringify(update) })).status).toBe(401);

    const ok = await app.request(path, { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": String(hook.body.secret_token) }, body: JSON.stringify(update) });
    expect(ok.status).toBe(200);
    const answer = tgCalls.filter((c) => c.method === "sendMessage" && c.body.chat_id === 4242).at(-1)!;
    expect(answer.token).toBe(TOKEN);
    expect(String(answer.body.text)).toContain("ravonlik");
    expect(String(answer.body.text)).toContain("IELTS qo'llanma, 2-bet");

    const convs = (await (await call(`/v1/clones/${cloneId}/conversations`, { key: apiKey })).json()) as { id: string; channel: string }[];
    const conv = convs.find((c) => c.channel === "telegram")!;
    const reply = (await (await call(`/v1/conversations/${conv.id}/reply`, { method: "POST", key: apiKey, body: JSON.stringify({ text: "Salom, Vali!" }) })).json()) as { delivered: boolean };
    expect(reply.delivered).toBe(true);

    expect(await (await call(`/v1/clones/${cloneId}/telegram`, { method: "DELETE", key: apiKey })).json()).toEqual({ ok: true });
    expect(tgCalls.at(-1)?.method).toBe("deleteWebhook");
    expect((await app.request(path, { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": String(hook.body.secret_token) }, body: JSON.stringify(update) })).status).toBe(401);
  });

  it("vidjet skripti va klon sahifasi", async () => {
    const js = await call("/widget.js");
    expect(js.headers.get("content-type")).toContain("javascript");
    const page = await call(`/c/${slug}`);
    const html = await page.text();
    expect(html).toContain("Dilnoza");
    expect(html).toContain(`data-clone="${slug}"`);
    expect((await call("/c/yoq-bunday-klon")).status).toBe(404);
  });
});
