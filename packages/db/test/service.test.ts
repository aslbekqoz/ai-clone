import { HashingEmbedder, LLMRouter, MockProvider, mockPolicy } from "@ai-clone/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CloneService, createPool, migrate, withTenant, type Db } from "../src/index.js";

// Integratsion testlar haqiqiy Postgres + pgvector talab qiladi: TEST_DATABASE_URL o'rnatilmasa o'tkazib yuboriladi.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("CloneService (Postgres)", () => {
  let db: Db;
  let svc: CloneService;
  let tenantA: string;
  let tenantB: string;
  let cloneId: string;
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    db = createPool(url);
    await migrate(db);
    svc = new CloneService(db, new HashingEmbedder(), new LLMRouter([new MockProvider()], mockPolicy()));
    ({ tenantId: tenantA } = await svc.createTenant("A", "pro"));
    ({ tenantId: tenantB } = await svc.createTenant("B"));
    const clone = await svc.createClone(tenantA, { slug: `dilnoza-${suffix}`, name: "Dilnoza", bio: "IELTS ustoz" });
    cloneId = clone.id;
    await svc.addSource(tenantA, cloneId, { type: "text", title: "IELTS kurslari", text: "IELTS intensiv kursi 3 oy davom etadi. Kurs narxi oyiga 1 200 000 so'm." });
  });

  afterAll(async () => {
    await db.query("DELETE FROM tenants WHERE id = ANY($1)", [[tenantA, tenantB]]);
    await db.end();
  });

  it("API kalit bilan autentifikatsiya", async () => {
    const { tenantId, apiKey } = await svc.createTenant("C");
    expect(await svc.authenticate(apiKey)).toBe(tenantId);
    expect(await svc.authenticate("ac_wrong")).toBeNull();
    await db.query("DELETE FROM tenants WHERE id = $1", [tenantId]);
  });

  it("bir xil manba ikki marta yuklanmaydi", async () => {
    const r = await svc.addSource(tenantA, cloneId, { type: "text", title: "IELTS kurslari", text: "IELTS intensiv kursi 3 oy davom etadi. Kurs narxi oyiga 1 200 000 so'm." });
    expect(r.duplicate).toBe(true);
  });

  it("kirillcha savolga lotincha bilimdan javob topadi", async () => {
    const out = await svc.chat(tenantA, cloneId, { channel: "telegram", externalId: "u-cyr", message: "IELTS курси нархи қанча?" });
    expect(out.citations[0]?.title).toBe("IELTS kurslari");
  });

  it("suhbat, iqtibos, oshkoralik va lidni saqlaydi", async () => {
    const out = await svc.chat(tenantA, cloneId, { channel: "telegram", externalId: "u1", name: "Ali", message: "IELTS kursi narxi qancha?" });
    expect(out.reply).toContain("AI-kloniman");
    expect(out.citations[0]?.title).toBe("IELTS kurslari");

    const second = await svc.chat(tenantA, cloneId, { channel: "telegram", externalId: "u1", message: "Kursga yozilmoqchiman, raqamim 90 123 45 67" });
    expect(second.conversationId).toBe(out.conversationId);
    expect(second.reply).not.toContain("AI-kloniman");
    expect(second.leadCaptured).toBe(true);
    const leads = await svc.listLeads(tenantA, cloneId);
    expect(leads[0]).toMatchObject({ phone: "+998901234567", name: "Ali" });
  });

  it("javobsiz savolda handoff yaratadi", async () => {
    const out = await svc.chat(tenantA, cloneId, { channel: "web", externalId: "u2", message: "Futbol chempionati qachon boshlanadi?" });
    expect(out.escalated).toBe(true);
    const list = await svc.listConversations(tenantA, cloneId, "escalated");
    expect(list.map((c) => c.id)).toContain(out.conversationId);
  });

  it("human takeover: inson rejimida bot javob bermaydi, egasining javobi saqlanadi", async () => {
    const first = await svc.chat(tenantA, cloneId, { channel: "telegram", externalId: "u3", message: "IELTS kursi qancha?" });
    await svc.setMode(tenantA, first.conversationId, "human");
    const during = await svc.chat(tenantA, cloneId, { channel: "telegram", externalId: "u3", message: "Chegirma bormi?" });
    expect(during.reply).toBeNull();
    expect(during.mode).toBe("human");
    const dest = await svc.ownerReply(tenantA, first.conversationId, "Ha, 10% chegirma bor!");
    expect(dest).toMatchObject({ channel: "telegram", externalId: "u3" });
    await svc.setMode(tenantA, first.conversationId, "bot");
    const msgs = await svc.getMessages(tenantA, first.conversationId);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "user", "owner"]);
  });

  it("egasining tuzatishi tasdiqlangan javobga aylanadi va keyingi safar ishlatiladi", async () => {
    const out = await svc.chat(tenantA, cloneId, { channel: "web", externalId: "u4", message: "Darslar onlayn bo'ladimi?" });
    const fb = await svc.feedback(tenantA, out.messageId ?? (await lastAssistant(out.conversationId)), -1, "Ha, barcha darslar Zoom orqali onlayn o'tadi.");
    expect(fb.verifiedAnswerCreated).toBe(true);
    const again = await svc.chat(tenantA, cloneId, { channel: "web", externalId: "u5", message: "Darslar onlayn bo'ladimi?" });
    expect(again.escalated).toBe(false);
  });

  it("RLS: boshqa tenant klon va ma'lumotlarni ko'rmaydi", async () => {
    expect(await svc.getClone(tenantB, cloneId)).toBeNull();
    const rows = await withTenant(db, tenantB, async (tx) => (await tx.query("SELECT count(*)::int AS n FROM chunks")).rows[0]);
    expect(rows.n).toBe(0);
    await expect(svc.chat(tenantB, cloneId, { channel: "web", externalId: "x", message: "salom" })).rejects.toThrow(/topilmadi/);
  });

  it("RLS: boshqa tenant nomidan yozib bo'lmaydi", async () => {
    await expect(
      withTenant(db, tenantB, (tx) =>
        tx.query("INSERT INTO leads (tenant_id, clone_id, end_user_id) SELECT $1, clone_id, id FROM end_users LIMIT 1", [tenantA]),
      ),
    ).resolves.toMatchObject({ rowCount: 0 });
    await expect(withTenant(db, tenantB, (tx) => tx.query("INSERT INTO audit_log (tenant_id, actor, action) VALUES ($1, 'x', 'y')", [tenantA]))).rejects.toThrow(/row-level security/);
  });

  it("/forget foydalanuvchi ma'lumotlarini o'chiradi", async () => {
    await svc.chat(tenantA, cloneId, { channel: "telegram", externalId: "u6", message: "IELTS kursi qancha?" });
    expect(await svc.forgetEndUser(tenantA, cloneId, "telegram", "u6")).toBe(true);
    expect(await svc.forgetEndUser(tenantA, cloneId, "telegram", "u6")).toBe(false);
  });

  it("limit tugaganda LLM chaqirilmaydi", async () => {
    const { tenantId } = await svc.createTenant("Limited");
    const c = await svc.createClone(tenantId, { slug: `limited-${suffix}`, name: "L" });
    await db.query("UPDATE tenants SET monthly_message_limit = 0 WHERE id = $1", [tenantId]);
    const out = await svc.chat(tenantId, c.id, { channel: "web", externalId: "z", message: "salom" });
    expect(out.limitReached).toBe(true);
    await db.query("DELETE FROM tenants WHERE id = $1", [tenantId]);
  });

  async function lastAssistant(conversationId: string): Promise<string> {
    const msgs = await svc.getMessages(tenantA, conversationId);
    return msgs.filter((m) => m.role === "assistant").at(-1)!.id;
  }
});
