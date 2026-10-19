import { HashingEmbedder, LLMRouter, MockProvider, mockPolicy } from "@ai-clone/core";
import { CloneService, createPool, migrate, type Db } from "@ai-clone/db";
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
    app = createApp(new CloneService(db, new HashingEmbedder(), new LLMRouter([new MockProvider()], mockPolicy())), { adminToken: "admin-secret" });
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
