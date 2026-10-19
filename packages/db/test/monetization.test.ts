import { HashingEmbedder, LLMRouter, MockProvider, mockPolicy } from "@ai-clone/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BillingService, CloneService, MonetizationService, createPool, migrate, type Db } from "../src/index.js";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("MonetizationService (Postgres)", () => {
  let db: Db;
  let provider: MockProvider;
  let svc: CloneService;
  let billing: BillingService;
  let mon: MonetizationService;
  let tenantId: string;
  let cloneId: string;
  const PAYME_KEY = "fan-key";
  const auth = `Basic ${Buffer.from(`Paycom:${PAYME_KEY}`).toString("base64")}`;
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    db = createPool(url);
    await migrate(db);
    billing = new BillingService(db, { payme: { merchantId: "m", key: PAYME_KEY } });
    mon = new MonetizationService(db, billing, "link-secret", "https://api.aiclone.uz");
    provider = new MockProvider();
    svc = new CloneService(db, new HashingEmbedder(), new LLMRouter([provider], mockPolicy()), { paywall: mon });
    ({ tenantId } = await svc.createTenant("Fan tenant", "pro"));
    cloneId = (await svc.createClone(tenantId, { slug: `fan-${suffix}`, name: "Dilnoza" })).id;
    await svc.addSource(tenantId, cloneId, { type: "text", title: "Kurs", text: "IELTS kursi narxi oyiga 1 200 000 so'm. Darslar Zoom orqali." });
  });
  afterAll(async () => {
    await db.query("DELETE FROM tenants WHERE id = $1", [tenantId]);
    await db.end();
  });

  const pay = async (offerUrl: string, txId: string) => {
    const token = offerUrl.split("/pay/")[1]!;
    const { checkoutUrl } = await mon.checkout(token, "payme");
    const params = Buffer.from(checkoutUrl.split("/").at(-1)!, "base64").toString();
    const orderId = params.match(/ac\.order_id=(\d+)/)![1]!;
    const amount = Number(params.match(/a=(\d+)/)![1]);
    await billing.handlePayme({ id: 1, method: "CreateTransaction", params: { id: txId, time: Date.now(), amount, account: { order_id: orderId } } }, auth);
    const r = await billing.handlePayme({ id: 2, method: "PerformTransaction", params: { id: txId } }, auth);
    expect(r.result).toMatchObject({ state: 2 });
    return { orderId, txId };
  };

  it("mahsulotsiz yoqib bo'lmaydi; bepul savollardan keyin to'lov taklifi, LLM chaqirilmaydi", async () => {
    await expect(mon.updateSettings(tenantId, cloneId, { enabled: true })).rejects.toMatchObject({ status: 422 });
    await mon.createProduct(tenantId, cloneId, { title: "2 ta savol", kind: "pack", messages: 2, priceUzs: 10_000 });
    await mon.updateSettings(tenantId, cloneId, { enabled: true, freeMessages: 2 });

    const a = await svc.chat(tenantId, cloneId, { channel: "telegram", externalId: "fan1", message: "IELTS kursi narxi qancha?" });
    const b = await svc.chat(tenantId, cloneId, { channel: "telegram", externalId: "fan1", message: "Darslar qayerda?" });
    expect(a.paywall ?? b.paywall).toBeUndefined();
    const before = provider.calls.length;
    const c = await svc.chat(tenantId, cloneId, { channel: "telegram", externalId: "fan1", message: "Yana bir savol" });
    expect(provider.calls.length).toBe(before);
    expect(c.reply).toContain("bepul savollar tugadi (2 ta)");
    expect(c.paywall?.offers).toHaveLength(1);
    expect(c.paywall!.offers[0]!.url).toMatch(/^https:\/\/api\.aiclone\.uz\/pay\/[\w-]+\.[\w-]+$/);
  });

  it("to'lov havolasini soxtalashtirib bo'lmaydi", async () => {
    const c = await svc.chat(tenantId, cloneId, { channel: "telegram", externalId: "fan1", message: "savol" });
    const token = c.paywall!.offers[0]!.url.split("/pay/")[1]!;
    expect(mon.resolveLink(token)).toMatchObject({ tenantId, cloneId });
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body!, "base64url").toString()), p: "00000000-0000-0000-0000-000000000000" })).toString("base64url");
    expect(mon.resolveLink(`${forged}.${sig}`)).toBeNull();
    expect(mon.resolveLink("yaroqsiz")).toBeNull();
  });

  it("Payme orqali to'lovdan keyin paket ishlaydi va tugaydi; 12% komissiya hisoblanadi", async () => {
    const c = await svc.chat(tenantId, cloneId, { channel: "telegram", externalId: "fan1", message: "savol" });
    await pay(c.paywall!.offers[0]!.url, `fan-tx-1-${suffix}`);

    const r1 = await svc.chat(tenantId, cloneId, { channel: "telegram", externalId: "fan1", message: "IELTS kursi narxi qancha?" });
    const r2 = await svc.chat(tenantId, cloneId, { channel: "telegram", externalId: "fan1", message: "Darslar qayerda?" });
    expect(r1.paywall ?? r2.paywall).toBeUndefined();
    const r3 = await svc.chat(tenantId, cloneId, { channel: "telegram", externalId: "fan1", message: "Uchinchi" });
    expect(r3.paywall).toBeDefined();

    const e = await mon.earnings(tenantId);
    expect(e).toMatchObject({ grossUzs: 10_000, commissionUzs: 1_200, netUzs: 8_800, balanceUzs: 8_800 });
    expect(e.recent[0]).toMatchObject({ status: "paid", product: "2 ta savol" });
  });

  it("obuna paketdan ustun; pul qaytarilsa huquq bekor bo'ladi va daromad teskari yoziladi", async () => {
    const sub = await mon.createProduct(tenantId, cloneId, { title: "30 kun cheksiz", kind: "subscription", days: 30, priceUzs: 49_000 });
    const c = await svc.chat(tenantId, cloneId, { channel: "web", externalId: "fan2-visitor", message: "salom" });
    const c2 = c.paywall ? c : await svc.chat(tenantId, cloneId, { channel: "web", externalId: "fan2-visitor", message: "salom" });
    const c3 = c2.paywall ? c2 : await svc.chat(tenantId, cloneId, { channel: "web", externalId: "fan2-visitor", message: "salom" });
    const offer = c3.paywall!.offers.find((o) => o.productId === sub.id)!;
    const { txId } = await pay(offer.url, `fan-tx-2-${suffix}`);
    for (let i = 0; i < 4; i++) expect((await svc.chat(tenantId, cloneId, { channel: "web", externalId: "fan2-visitor", message: `savol ${i}` })).paywall).toBeUndefined();

    await billing.handlePayme({ id: 3, method: "CancelTransaction", params: { id: txId, reason: 5 } }, auth);
    expect((await svc.chat(tenantId, cloneId, { channel: "web", externalId: "fan2-visitor", message: "yana" })).paywall).toBeDefined();
    const e = await mon.earnings(tenantId);
    expect(e.netUzs).toBe(8_800);

    await expect(mon.recordPayout(tenantId, 9_000, "bank")).rejects.toMatchObject({ status: 422 });
    await mon.recordPayout(tenantId, 8_000, "Bank o'tkazmasi #1");
    expect((await mon.earnings(tenantId)).balanceUzs).toBe(800);
  });
});
