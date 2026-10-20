import { HashingEmbedder, LLMRouter, MockProvider, mockPolicy } from "@ai-clone/core";
import { CloneService, createPool, migrate, readiness, systemStats, type Db } from "@ai-clone/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Monitoring (Postgres)", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let apiKey: string;
  let tenantId: string;

  beforeAll(async () => {
    db = createPool(url);
    await migrate(db);
    const svc = new CloneService(db, new HashingEmbedder(), new LLMRouter([new MockProvider()], mockPolicy()));
    app = createApp(svc, { ops: { readiness: () => readiness(db), stats: () => systemStats(db), metricsToken: "m-secret" } });
    ({ tenantId, apiKey } = await svc.createTenant("Ops"));
  });
  afterAll(async () => {
    await db.query("DELETE FROM tenants WHERE id = $1", [tenantId]);
    await db.end();
  });

  it("readiness: baza va barcha migratsiyalar", async () => {
    const r = await app.request("/health/ready");
    expect(r.status).toBe(200);
    const body = (await r.json()) as { migrations: number; expected: number };
    expect(body.migrations).toBeGreaterThanOrEqual(body.expected);
    const down = createApp(new CloneService(db, new HashingEmbedder(), new LLMRouter([new MockProvider()], mockPolicy())), { ops: { readiness: async () => ({ ok: false, db: false }) } });
    expect((await down.request("/health/ready")).status).toBe(503);
  });

  it("request ID, marshrut shabloni bo'yicha metrikalar va tizim o'lchovlari; token shart", async () => {
    const r = await app.request("/v1/clones/00000000-0000-0000-0000-000000000000", { headers: { authorization: `Bearer ${apiKey}`, "x-request-id": "req-12345678" } });
    expect(r.status).toBe(404);
    expect(r.headers.get("x-request-id")).toBe("req-12345678");
    expect((await app.request("/health")).headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);

    expect((await app.request("/metrics")).status).toBe(401);
    expect((await app.request("/metrics", { headers: { authorization: "Bearer xato" } })).status).toBe(401);
    const text = await (await app.request("/metrics", { headers: { authorization: "Bearer m-secret" } })).text();
    // ID emas, shablon: belgilar soni cheklangan qoladi
    expect(text).toContain('aiclone_http_requests_total{method="GET",route="/v1/clones/:id",status="404"} 1');
    expect(text).not.toContain("00000000-0000");
    expect(text).toContain('aiclone_http_request_duration_seconds_bucket{route="/health",le="+Inf"} 1');
    expect(text).toContain("# TYPE aiclone_llm_cost_usd_today gauge");
    expect(text).toContain("aiclone_messages_today ");
  });

  it("ichki xato requestId bilan qaytadi va JSON log yoziladi", async () => {
    const broken = createApp(new CloneService(db, new HashingEmbedder(), new LLMRouter([new MockProvider()], mockPolicy())), {
      ops: { readiness: async () => { throw new Error("kutilmagan"); } },
    });
    const r = await broken.request("/health/ready", { headers: { "x-request-id": "req-err-0001" } });
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: "Ichki xato", requestId: "req-err-0001" });
  });

  it("xavfsizlik: xato kalitlar cheklanadi, sarlavhalar, so'rov hajmi", async () => {
    const fresh = createApp(new CloneService(db, new HashingEmbedder(), new LLMRouter([new MockProvider()], mockPolicy())), { adminToken: "a".repeat(32), publicBaseUrl: "https://api.aiclone.uz" });
    const ip = { "x-forwarded-for": "203.0.113.7" };
    for (let i = 0; i < 20; i++) expect((await fresh.request("/v1/clones", { headers: { ...ip, authorization: `Bearer ac_xato${i}` } })).status).toBe(401);
    // 21-urinish — to'g'ri kalit bo'lsa ham bir daqiqa kutadi; boshqa IP ta'sirlanmaydi
    expect((await fresh.request("/v1/clones", { headers: { ...ip, authorization: `Bearer ${apiKey}` } })).status).toBe(429);
    expect((await fresh.request("/v1/clones", { headers: { "x-forwarded-for": "203.0.113.8", authorization: `Bearer ${apiKey}` } })).status).toBe(200);
    expect((await fresh.request("/admin/reports", { headers: { ...ip, "x-admin-token": "a".repeat(32) } })).status).toBe(429);
    expect((await fresh.request("/admin/reports", { headers: { "x-forwarded-for": "203.0.113.9", "x-admin-token": "qisqa" } })).status).toBe(401);

    const w = await fresh.request("/widget.js");
    expect(w.headers.get("x-content-type-options")).toBe("nosniff");
    expect(w.headers.get("strict-transport-security")).toContain("max-age=31536000");
    expect(w.headers.get("cross-origin-resource-policy")).toBeNull();
    expect(w.headers.get("x-frame-options")).toBe("DENY");

    const big = await fresh.request("/public/x/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "x".repeat(70 * 1024) }) });
    expect(big.status).toBe(413);
  });

  it("API kalitni almashtirish: eskisi darhol ishlamaydi", async () => {
    const { tenantId: t2, apiKey: old } = await new CloneService(db, new HashingEmbedder(), new LLMRouter([new MockProvider()], mockPolicy())).createTenant("Rotate");
    const r = await app.request("/v1/api-key/rotate", { method: "POST", headers: { authorization: `Bearer ${old}` } });
    const { apiKey } = (await r.json()) as { apiKey: string };
    expect(apiKey).toMatch(/^ac_/);
    expect((await app.request("/v1/clones", { headers: { authorization: `Bearer ${old}` } })).status).toBe(401);
    expect((await app.request("/v1/clones", { headers: { authorization: `Bearer ${apiKey}` } })).status).toBe(200);
    await db.query("DELETE FROM tenants WHERE id = $1", [t2]);
  });
});
