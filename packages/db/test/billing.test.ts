import { createHash } from "node:crypto";
import { HashingEmbedder, LLMRouter, MockProvider, mockPolicy } from "@ai-clone/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BillingService, CloneService, createPool, migrate, orderAmountUzs, paymeCheckoutUrl, type Db } from "../src/index.js";

describe("checkout havolalari", () => {
  it("Payme havolasi base64 parametrlar bilan", () => {
    const url = paymeCheckoutUrl({ merchantId: "m1", key: "k" }, 42, 18_900_000, "https://aiclone.uz/app");
    const decoded = Buffer.from(url.split("/").at(-1)!, "base64").toString();
    expect(url.startsWith("https://checkout.paycom.uz/")).toBe(true);
    expect(decoded).toBe("m=m1;ac.order_id=42;a=18900000;c=https://aiclone.uz/app");
  });

  it("yillik to'lovda 2 oy bepul", () => {
    expect(orderAmountUzs("pro", 1)).toBe(499_000);
    expect(orderAmountUzs("pro", 12)).toBe(4_990_000);
  });
});

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("BillingService (Postgres)", () => {
  let db: Db;
  let svc: CloneService;
  let billing: BillingService;
  let clock = Date.now();
  const tenants: string[] = [];
  const PAYME_KEY = "test-payme-key";
  const CLICK = { serviceId: "777", merchantId: "888", secretKey: "click-secret" };
  const auth = `Basic ${Buffer.from(`Paycom:${PAYME_KEY}`).toString("base64")}`;
  const rpc = (method: string, params: Record<string, unknown>, header = auth) => billing.handlePayme({ jsonrpc: "2.0", id: 1, method, params }, header);

  const newTenant = async () => {
    const { tenantId } = await svc.createTenant(`Billing ${tenants.length}`);
    tenants.push(tenantId);
    return tenantId;
  };
  const tenantRow = async (id: string) => (await db.query("SELECT plan, monthly_message_limit, plan_expires_at FROM tenants WHERE id = $1", [id])).rows[0];

  beforeAll(async () => {
    db = createPool(url);
    await migrate(db);
    svc = new CloneService(db, new HashingEmbedder(), new LLMRouter([new MockProvider()], mockPolicy()));
    billing = new BillingService(db, { payme: { merchantId: "m1", key: PAYME_KEY }, click: CLICK }, () => clock);
  });

  afterAll(async () => {
    await db.query("DELETE FROM tenants WHERE id = ANY($1)", [tenants]);
    await db.end();
  });

  it("Payme: Check → Create → Perform tarifni yoqadi, takroriy chaqiruvlar idempotent", async () => {
    const tenantId = await newTenant();
    const order = await billing.createOrder(tenantId, "pro", 1, "payme");
    const account = { order_id: order.orderId };
    const amount = order.amountUzs * 100;

    expect((await rpc("CheckPerformTransaction", { amount, account })).result).toEqual({ allow: true });
    const created = await rpc("CreateTransaction", { id: "pm-1", time: clock, amount, account });
    expect(created.result).toMatchObject({ transaction: "pm-1", state: 1 });
    expect((await rpc("CreateTransaction", { id: "pm-1", time: clock, amount, account })).result).toEqual(created.result);

    // Boshqa tranzaksiya shu buyurtmani band qila olmaydi
    expect((await rpc("CreateTransaction", { id: "pm-2", time: clock, amount, account })).error?.code).toBe(-31051);

    const performed = await rpc("PerformTransaction", { id: "pm-1" });
    expect(performed.result).toMatchObject({ transaction: "pm-1", state: 2 });
    expect((await rpc("PerformTransaction", { id: "pm-1" })).result).toEqual(performed.result);
    expect((await rpc("CheckTransaction", { id: "pm-1" })).result).toMatchObject({ state: 2, cancel_time: 0, reason: null });

    expect(await tenantRow(tenantId)).toMatchObject({ plan: "pro", monthly_message_limit: 6000 });
    const summary = await billing.summary(tenantId);
    expect(summary.plan).toBe("pro");
    expect(summary.orders[0]).toMatchObject({ status: "paid" });

    // To'langan buyurtmaga qayta to'lov yo'q
    expect((await rpc("CheckPerformTransaction", { amount, account })).error?.code).toBe(-31052);
    const st = (await rpc("GetStatement", { from: clock - 1000, to: clock + 1000 })).result as { transactions: { id: string }[] };
    expect(st.transactions.map((t) => t.id)).toContain("pm-1");
  });

  it("Payme: noto'g'ri kalit, summa, buyurtma va metod", async () => {
    const tenantId = await newTenant();
    const order = await billing.createOrder(tenantId, "creator", 1, "payme");
    const account = { order_id: order.orderId };
    expect((await rpc("CheckPerformTransaction", { amount: 1, account }, "Basic xxx")).error?.code).toBe(-32504);
    expect((await rpc("CheckPerformTransaction", { amount: 1, account })).error?.code).toBe(-31001);
    expect((await rpc("CheckPerformTransaction", { amount: 1, account: { order_id: "999999999" } })).error?.code).toBe(-31050);
    expect((await rpc("PerformTransaction", { id: "yoq" })).error?.code).toBe(-31003);
    expect((await rpc("Nonexistent", {})).error?.code).toBe(-32601);
  });

  it("Payme: 12 soatdan keyin tranzaksiya bekor bo'ladi", async () => {
    const tenantId = await newTenant();
    const order = await billing.createOrder(tenantId, "creator", 1, "payme");
    const params = { amount: order.amountUzs * 100, account: { order_id: order.orderId } };
    await rpc("CreateTransaction", { id: "pm-timeout", time: clock, ...params });
    clock += 43_200_001;
    expect((await rpc("PerformTransaction", { id: "pm-timeout" })).error?.code).toBe(-31008);
    expect((await rpc("CheckTransaction", { id: "pm-timeout" })).result).toMatchObject({ state: -1, reason: 4 });
    expect((await tenantRow(tenantId)).plan).toBe("free");
  });

  it("Payme: o'tkazilgan to'lovni bekor qilish tarifni tugatadi", async () => {
    const tenantId = await newTenant();
    const order = await billing.createOrder(tenantId, "business", 1, "payme");
    const params = { amount: order.amountUzs * 100, account: { order_id: order.orderId } };
    await rpc("CreateTransaction", { id: "pm-refund", time: clock, ...params });
    await rpc("PerformTransaction", { id: "pm-refund" });
    const cancel = await rpc("CancelTransaction", { id: "pm-refund", reason: 5 });
    expect(cancel.result).toMatchObject({ state: -2 });
    expect((await billing.summary(tenantId)).orders[0]).toMatchObject({ status: "refunded" });
    clock += 1000;
    expect((await billing.summary(tenantId)).plan).toBe("free");
  });

  const clickSign = (p: Record<string, string>) =>
    createHash("md5")
      .update(p.click_trans_id! + p.service_id! + CLICK.secretKey + p.merchant_trans_id! + (p.action === "1" ? p.merchant_prepare_id! : "") + p.amount! + p.action! + p.sign_time!)
      .digest("hex");
  const clickReq = (p: Record<string, string>) => billing.handleClick({ ...p, sign_string: clickSign(p) });

  it("Click: Prepare → Complete tarifni yoqadi; qayta to'lov va noto'g'ri imzo rad etiladi", async () => {
    const tenantId = await newTenant();
    const order = await billing.createOrder(tenantId, "creator", 3, "click");
    expect(order.checkoutUrl).toContain("transaction_param=" + order.orderId);
    const base = { click_trans_id: "5001", service_id: CLICK.serviceId, click_paydoc_id: "1", merchant_trans_id: order.orderId, amount: String(order.amountUzs), sign_time: "2026-10-19 20:00:00", error: "0" };

    const bad = await billing.handleClick({ ...base, action: "0", sign_string: "deadbeef" });
    expect(bad.error).toBe(-1);
    expect((await clickReq({ ...base, action: "0", amount: "1" })).error).toBe(-2);

    const prep = await clickReq({ ...base, action: "0" });
    expect(prep).toMatchObject({ error: 0, merchant_trans_id: order.orderId });
    const done = await clickReq({ ...base, action: "1", merchant_prepare_id: String(prep.merchant_prepare_id) });
    expect(done).toMatchObject({ error: 0, merchant_confirm_id: prep.merchant_prepare_id });

    const row = await tenantRow(tenantId);
    expect(row.plan).toBe("creator");
    expect(new Date(row.plan_expires_at).getTime() - Date.now()).toBeGreaterThan(80 * 86_400_000);
    expect((await clickReq({ ...base, action: "1", merchant_prepare_id: String(prep.merchant_prepare_id) })).error).toBe(-4);
  });

  it("Click: Click tomonidagi xato tranzaksiyani bekor qiladi", async () => {
    const tenantId = await newTenant();
    const order = await billing.createOrder(tenantId, "pro", 1, "click");
    const base = { click_trans_id: "5002", service_id: CLICK.serviceId, merchant_trans_id: order.orderId, amount: String(order.amountUzs), sign_time: "2026-10-19 20:00:00" };
    const prep = await clickReq({ ...base, action: "0", error: "0" });
    const res = await clickReq({ ...base, action: "1", error: "-5017", merchant_prepare_id: String(prep.merchant_prepare_id) });
    expect(res.error).toBe(-9);
    expect((await tenantRow(tenantId)).plan).toBe("free");
    expect((await clickReq({ ...base, action: "0", error: "0", merchant_trans_id: "123456789" })).error).toBe(-5);
  });

  it("muddati o'tgan tarif chatda bepul limitga qaytadi", async () => {
    const tenantId = await newTenant();
    await db.query("UPDATE tenants SET plan = 'pro', monthly_message_limit = 6000, plan_expires_at = now() - interval '1 day' WHERE id = $1", [tenantId]);
    await db.query("INSERT INTO usage_ledger (tenant_id, day, messages) VALUES ($1, current_date, 100)", [tenantId]);
    const c = await svc.createClone(tenantId, { slug: `exp-${Date.now().toString(36)}`, name: "E" });
    const out = await svc.chat(tenantId, c.id, { channel: "web", externalId: "v", message: "salom" });
    expect(out.limitReached).toBe(true);
  });
});
