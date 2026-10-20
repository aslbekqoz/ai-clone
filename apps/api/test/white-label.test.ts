import { HashingEmbedder, LLMRouter, MockProvider, mockPolicy } from "@ai-clone/core";
import { CloneService, WhiteLabelService, createPool, migrate, type Db } from "@ai-clone/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("White-label API (Postgres)", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let apiKey: string;
  let tenantId: string;
  let cloneId: string;
  const suffix = Date.now().toString(36);
  const slug = `wla-${suffix}`;
  const domain = `chat-${suffix}.kamola.uz`;
  const dns = new Map<string, string[][]>();
  const call = (path: string, init: RequestInit & { host?: string } = {}) =>
    app.request(`http://${init.host ?? "api.aiclone.uz"}${path}`, {
      ...init,
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}`, ...(init.host ? { host: init.host } : { host: "api.aiclone.uz" }) },
    });

  beforeAll(async () => {
    db = createPool(url);
    await migrate(db);
    const svc = new CloneService(db, new HashingEmbedder(), new LLMRouter([new MockProvider()], mockPolicy()));
    const whiteLabel = new WhiteLabelService(db, { platformHosts: ["aiclone.uz"], resolveTxt: async (n) => dns.get(n) ?? [] });
    app = createApp(svc, { publicBaseUrl: "https://api.aiclone.uz", whiteLabel });
    ({ tenantId, apiKey } = await svc.createTenant("WL", "business"));
    cloneId = (await svc.createClone(tenantId, { slug, name: "Kamola", bio: "SMM ustoz" })).id;
  });

  afterAll(async () => {
    await db.query("DELETE FROM tenants WHERE id = $1", [tenantId]);
    await db.end();
  });

  it("brend va domen ulash → mijoz domenida klon sahifasi, boshqaruv yo'llari yopiq", async () => {
    expect((await call(`/v1/clones/${cloneId}/white-label/brand`, { method: "PATCH", body: JSON.stringify({ accent: "red" }) })).status).toBe(422);
    expect((await call(`/v1/clones/${cloneId}/white-label/brand`, { method: "PATCH", body: JSON.stringify({ accent: "#1d4ed8", hidePoweredBy: true }) })).status).toBe(200);
    expect(await (await call(`/public/${slug}/config`)).json()).toEqual({ accent: "#1d4ed8", logoUrl: null });
    const page = await (await call(`/c/${slug}`)).text();
    expect(page).toContain("--brand:#1d4ed8");
    expect(page).not.toContain("O'z kloningizni yarating");
    expect(page).toContain("AI tomonidan yaratiladi");

    const st = (await (await call(`/v1/clones/${cloneId}/white-label/domain`, { method: "PUT", body: JSON.stringify({ domain }) })).json()) as { txt: { name: string; value: string } };
    // Tasdiqlanmagan domen: na sahifa, na TLS sertifikati
    expect((await call("/", { host: domain })).status).toBe(404);
    expect((await call(`/internal/tls-ask?domain=${domain}`)).status).toBe(404);

    dns.set(st.txt.name, [[st.txt.value]]);
    expect(await (await call(`/v1/clones/${cloneId}/white-label/domain/verify`, { method: "POST" })).json()).toMatchObject({ verified: true });
    expect((await call(`/internal/tls-ask?domain=${domain}`)).status).toBe(200);

    const home = await call("/", { host: domain });
    expect(home.status).toBe(200);
    const html = await home.text();
    expect(html).toContain("<h1>Kamola</h1>");
    expect(html).toContain(`src="https://${domain}/widget.js"`);
    expect((await call(`/c/${slug}`, { host: domain })).status).toBe(302);
    expect((await call(`/public/${slug}/config`, { host: domain })).status).toBe(200);
    for (const path of ["/app", "/v1/clones", "/admin/reports", "/explore"]) expect((await call(path, { host: domain })).status).toBe(404);

    expect(await (await call(`/v1/clones/${cloneId}/white-label/domain`, { method: "DELETE" })).json()).toEqual({ ok: true });
    expect((await call("/", { host: domain })).status).toBe(404);
  });
});
