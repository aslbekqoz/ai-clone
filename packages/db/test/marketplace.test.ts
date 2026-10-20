import { HashingEmbedder, LLMRouter, MockProvider, mockPolicy } from "@ai-clone/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CloneService, MarketplaceService, createPool, migrate, rankScore, wilsonLowerBound, type Db } from "../src/index.js";

describe("reyting", () => {
  it("Wilson: kam ovozli 100% ko'p ovozli 90% dan pastda", () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
    expect(wilsonLowerBound(3, 3)).toBeLessThan(wilsonLowerBound(90, 100));
    expect(rankScore(90, 100, 50)).toBeGreaterThan(rankScore(90, 100, 0));
  });
});

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("MarketplaceService (Postgres)", () => {
  let db: Db;
  let svc: CloneService;
  let mp: MarketplaceService;
  let tenantId: string;
  let otherTenant: string;
  const suffix = Date.now().toString(36);
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    db = createPool(url);
    await migrate(db);
    svc = new CloneService(db, new HashingEmbedder(), new LLMRouter([new MockProvider()], mockPolicy()));
    mp = new MarketplaceService(db);
    ({ tenantId } = await svc.createTenant("MP A", "pro"));
    ({ tenantId: otherTenant } = await svc.createTenant("MP B"));
    for (const [key, name] of [["ielts", `Dilnoza ${suffix}`], ["fit", `Sardor ${suffix}`], ["empty", `Bo'sh ${suffix}`]] as const) {
      ids[key] = (await svc.createClone(tenantId, { slug: `mp-${key}-${suffix}`, name })).id;
    }
    await svc.addSource(tenantId, ids.ielts!, { type: "text", title: "IELTS", text: "IELTS Speaking bo'limida ravonlik eng muhim mezon hisoblanadi." });
    await svc.addSource(tenantId, ids.fit!, { type: "text", title: "Fitnes", text: "Haftasiga uch marta kuch mashqlari va kuniga 8 ming qadam yetarli." });
  });

  afterAll(async () => {
    await db.query("DELETE FROM tenants WHERE id = ANY($1)", [[tenantId, otherTenant]]);
    await db.end();
  });

  it("katalogga qo'yish talablari: kategoriya, tavsif, bilim", async () => {
    await expect(mp.update(tenantId, ids.empty!, { listed: true, category: "other", tagline: "Hali bilimsiz klon" })).rejects.toThrow("bilim manbaini");
    await expect(mp.update(tenantId, ids.ielts!, { listed: true })).rejects.toThrow("kategoriyani");
    await expect(mp.update(tenantId, ids.ielts!, { listed: true, category: "education", tagline: "qisqa" })).rejects.toThrow("10 belgi");
    expect(await mp.update(tenantId, ids.ielts!, { listed: true, category: "education", tagline: "IELTS Speaking va Writing bo'yicha javoblar" })).toMatchObject({ listed: true, category: "education", blocked: null });
    await mp.update(tenantId, ids.fit!, { listed: true, category: "sport", tagline: "Uyda fitnes va to'g'ri ovqatlanish" });
    // Boshqa tenant birovning klonini katalogga qo'ya olmaydi (RLS)
    await expect(mp.update(otherTenant, ids.fit!, { listed: false })).rejects.toThrow("topilmadi");
  });

  it("qidiruv: kategoriya, matn (kirill ham), faqat ro'yxatdagilar", async () => {
    const all = (await mp.search({ q: suffix })).map((c) => c.slug);
    expect(all.sort()).toEqual([`mp-fit-${suffix}`, `mp-ielts-${suffix}`]);
    expect((await mp.search({ q: `${suffix} speaking` })).length).toBe(0);
    expect((await mp.search({ q: "Speaking va Writing" })).map((c) => c.slug)).toContain(`mp-ielts-${suffix}`);
    expect((await mp.search({ q: "фитнес" })).map((c) => c.slug)).toContain(`mp-fit-${suffix}`);
    expect((await mp.search({ q: suffix, category: "sport" })).map((c) => c.slug)).toEqual([`mp-fit-${suffix}`]);
    expect((await mp.search({ q: "100%_" })).length).toBe(0);
  });

  it("obunachi bahosi: faqat o'z suhbatiga, bir xabarga bitta ovoz; 5 tadan keyin reyting", async () => {
    const own = await svc.chat(tenantId, ids.ielts!, { channel: "web", externalId: `visitor-0-${suffix}`, message: "Speaking'da eng muhimi nima?" });
    expect(await svc.visitorFeedback(tenantId, ids.ielts!, "web", `begona-${suffix}`, own.messageId!, 1)).toBe(false);
    expect(await svc.visitorFeedback(tenantId, ids.ielts!, "web", `visitor-0-${suffix}`, own.messageId!, -1)).toBe(true);
    expect(await svc.visitorFeedback(tenantId, ids.ielts!, "web", `visitor-0-${suffix}`, own.messageId!, 1)).toBe(true);
    expect((await mp.search({ q: `Dilnoza ${suffix}` }))[0]!.rating).toBeNull();
    for (let i = 1; i <= 4; i++) {
      const r = await svc.chat(tenantId, ids.ielts!, { channel: "web", externalId: `visitor-${i}-${suffix}`, message: "Speaking'da eng muhimi nima?" });
      await svc.visitorFeedback(tenantId, ids.ielts!, "web", `visitor-${i}-${suffix}`, r.messageId!, i === 4 ? -1 : 1);
    }
    const card = (await mp.search({ q: `Dilnoza ${suffix}` }))[0]!;
    expect(card.rating).toEqual({ positive: 0.8, votes: 5 });
    expect(card.conversations30d).toBe(5);
    // Ko'proq suhbat va baho — saralashda yuqorida
    expect((await mp.search({ q: suffix }))[0]!.slug).toBe(`mp-ielts-${suffix}`);
  });

  it("shikoyat va moderatsiya", async () => {
    expect(await mp.report(ids.fit!, `r1-${suffix}`, "impersonation", "Bu haqiqiy Sardor emas")).toEqual({ created: true });
    expect(await mp.report(ids.fit!, `r1-${suffix}`, "spam")).toEqual({ created: false });
    await mp.report(ids.fit!, `r2-${suffix}`, "harmful");
    const open = (await mp.openReports()).filter((r) => r.cloneId === ids.fit);
    expect(open).toHaveLength(2);
    expect(open[0]!.reportsForClone).toBe(2);

    expect(await mp.moderate(ids.fit!, "blocked", "Soxta shaxs")).toBe(true);
    expect((await mp.search({ q: suffix })).map((c) => c.slug)).toEqual([`mp-ielts-${suffix}`]);
    expect(await mp.isListed(ids.fit!)).toBe(false);
    expect((await mp.settings(tenantId, ids.fit!)).blocked).toEqual({ reason: "Soxta shaxs" });
    expect((await mp.openReports()).filter((r) => r.cloneId === ids.fit)).toHaveLength(0);
    await mp.moderate(ids.fit!, "ok");
    expect(await mp.isListed(ids.fit!)).toBe(true);
  });
});
