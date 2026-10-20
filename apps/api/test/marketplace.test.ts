import { HashingEmbedder, LLMRouter, MockProvider, mockPolicy } from "@ai-clone/core";
import { CloneService, MarketplaceService, createPool, migrate, type Db } from "@ai-clone/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Katalog API (Postgres)", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let apiKey: string;
  let tenantId: string;
  let cloneId: string;
  const suffix = Date.now().toString(36);
  const slug = `kat-${suffix}`;
  const json = (path: string, init: RequestInit & { key?: string; admin?: boolean } = {}) =>
    app.request(path, {
      ...init,
      headers: { "content-type": "application/json", ...(init.key ? { authorization: `Bearer ${init.key}` } : {}), ...(init.admin ? { "x-admin-token": "adm" } : {}) },
    });

  beforeAll(async () => {
    db = createPool(url);
    await migrate(db);
    const svc = new CloneService(db, new HashingEmbedder(), new LLMRouter([new MockProvider()], mockPolicy()));
    app = createApp(svc, { adminToken: "adm", marketplace: new MarketplaceService(db) });
    ({ tenantId, apiKey } = await svc.createTenant("Katalog", "pro"));
    cloneId = (await svc.createClone(tenantId, { slug, name: `Kamola ${suffix}`, bio: "Marketing bo'yicha mutaxassis" })).id;
    await svc.addSource(tenantId, cloneId, { type: "text", title: "SMM", text: "Instagram'da reels haftasiga kamida uch marta joylanishi kerak." });
  });

  afterAll(async () => {
    await db.query("DELETE FROM tenants WHERE id = $1", [tenantId]);
    await db.end();
  });

  it("egasi katalogga qo'yadi → /explore va /public/marketplace'da ko'rinadi", async () => {
    expect(await (await json(`/v1/clones/${cloneId}/marketplace`, { key: apiKey })).json()).toMatchObject({ available: true, listed: false, categories: { business: "Biznes" } });
    expect((await json(`/v1/clones/${cloneId}/marketplace`, { method: "PATCH", key: apiKey, body: JSON.stringify({ listed: true }) })).status).toBe(422);
    expect((await json(`/v1/clones/${cloneId}/marketplace`, { method: "PATCH", key: apiKey, body: JSON.stringify({ category: "kosmos" }) })).status).toBe(422);
    const ok = await json(`/v1/clones/${cloneId}/marketplace`, { method: "PATCH", key: apiKey, body: JSON.stringify({ listed: true, category: "business", tagline: "Instagram marketing va SMM bo'yicha maslahat" }) });
    expect(await ok.json()).toMatchObject({ listed: true, category: "business" });

    const page = await (await app.request(`/explore?q=${suffix}&category=business`)).text();
    expect(page).toContain(`href="/c/${slug}"`);
    expect(page).toContain("Instagram marketing va SMM");
    expect(await (await app.request(`/explore?q=${suffix}&category=sport`)).text()).toContain("Hech narsa topilmadi");
    const cards = (await (await app.request(`/public/marketplace?q=${suffix}`)).json()) as { slug: string; rating: unknown }[];
    expect(cards).toEqual([expect.objectContaining({ slug, rating: null, priceFromUzs: null })]);
    expect(await (await app.request(`/c/${slug}`)).text()).toContain("← Katalog");
  });

  it("vidjetdan baho va shikoyat; admin bloklaydi", async () => {
    const visitorId = `visitor-${suffix}`;
    const chat = (await (await json(`/public/${slug}/chat`, { method: "POST", body: JSON.stringify({ visitorId, message: "Reels qancha joylash kerak?" }) })).json()) as { messageId: string };
    expect((await json(`/public/${slug}/feedback`, { method: "POST", body: JSON.stringify({ visitorId: "boshqa-tashrifchi", messageId: chat.messageId, rating: 1 }) })).status).toBe(404);
    expect((await json(`/public/${slug}/feedback`, { method: "POST", body: JSON.stringify({ visitorId, messageId: chat.messageId, rating: 1 }) })).status).toBe(200);

    expect((await json(`/public/${slug}/report`, { method: "POST", body: JSON.stringify({ visitorId, reason: "impersonation", details: "Bu Kamola emas" }) })).status).toBe(201);
    expect((await json("/admin/reports")).status).toBe(401);
    const reports = (await (await json("/admin/reports", { admin: true })).json()) as { slug: string; reason: string }[];
    expect(reports.find((r) => r.slug === slug)).toMatchObject({ reason: "impersonation" });

    expect((await json(`/admin/clones/${cloneId}/moderation`, { method: "POST", admin: true, body: JSON.stringify({ status: "blocked", reason: "Soxta shaxs" }) })).status).toBe(200);
    expect(await (await app.request(`/explore?q=${suffix}`)).text()).not.toContain(`/c/${slug}`);
    expect(await (await json(`/v1/clones/${cloneId}/marketplace`, { key: apiKey })).json()).toMatchObject({ blocked: { reason: "Soxta shaxs" } });
    // Klonning o'zi ishlashda davom etadi
    expect((await app.request(`/c/${slug}`)).status).toBe(200);
  });
});
