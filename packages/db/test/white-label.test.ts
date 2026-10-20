import { HashingEmbedder, LLMRouter, MockProvider, mockPolicy } from "@ai-clone/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CloneService, WhiteLabelService, contrastRatio, createPool, migrate, normalizeDomain, type Db } from "../src/index.js";

describe("white-label yordamchilari", () => {
  it("domenni normallashtiradi va noto'g'risini rad etadi", () => {
    expect(normalizeDomain(" https://AI.Dilnoza.uz/chat ")).toBe("ai.dilnoza.uz");
    expect(normalizeDomain("dilnoza.uz.")).toBe("dilnoza.uz");
    for (const bad of ["localhost", "1.2.3.4", "-a.uz", "a..uz", "ai dilnoza.uz", "ai_x.uz"]) expect(normalizeDomain(bad)).toBeNull();
  });

  it("kontrast: to'q rang o'tadi, och rang o'tmaydi", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#b4441c", "#f6f1e7")).toBeGreaterThan(4.5);
    expect(contrastRatio("#ffe600", "#f6f1e7")).toBeLessThan(4.5);
  });
});

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("WhiteLabelService (Postgres)", () => {
  let db: Db;
  let wl: WhiteLabelService;
  let biz: string;
  let pro: string;
  let cloneId: string;
  let otherClone: string;
  let proClone: string;
  const suffix = Date.now().toString(36);
  const domain = `ai-${suffix}.example.uz`;
  const dns = new Map<string, string[][]>();

  beforeAll(async () => {
    db = createPool(url);
    await migrate(db);
    const svc = new CloneService(db, new HashingEmbedder(), new LLMRouter([new MockProvider()], mockPolicy()));
    wl = new WhiteLabelService(db, {
      platformHosts: ["aiclone.uz", "api.aiclone.uz"],
      cnameTarget: "clones.aiclone.uz",
      resolveTxt: async (name) => {
        const r = dns.get(name);
        if (!r) throw Object.assign(new Error("queryTxt ENOTFOUND"), { code: "ENOTFOUND" });
        return r;
      },
    });
    ({ tenantId: biz } = await svc.createTenant("WL Biz", "business"));
    ({ tenantId: pro } = await svc.createTenant("WL Pro", "pro"));
    cloneId = (await svc.createClone(biz, { slug: `wl-${suffix}`, name: "Kamola" })).id;
    otherClone = (await svc.createClone(biz, { slug: `wl2-${suffix}`, name: "Ikkinchi" })).id;
    proClone = (await svc.createClone(pro, { slug: `wlp-${suffix}`, name: "Pro" })).id;
  });

  afterAll(async () => {
    await db.query("DELETE FROM tenants WHERE id = ANY($1)", [[biz, pro]]);
    await db.end();
  });

  it("Pro tarifida mavjud emas", async () => {
    expect((await wl.settings(pro, proClone)).available).toBe(false);
    await expect(wl.updateBrand(pro, proClone, { accent: "#b4441c" })).rejects.toMatchObject({ status: 402 });
    await expect(wl.setDomain(pro, proClone, "ai.pro.uz")).rejects.toMatchObject({ status: 402 });
  });

  it("brend: rang, logo, havolani yashirish; tekshiruvlar", async () => {
    await expect(wl.updateBrand(biz, cloneId, { accent: "#ffe600" })).rejects.toThrow("juda och");
    await expect(wl.updateBrand(biz, cloneId, { logoUrl: "http://x.uz/l.png" })).rejects.toThrow("https");
    expect(await wl.updateBrand(biz, cloneId, { accent: "#b4441c", logoUrl: "https://cdn.x.uz/l.png" })).toEqual({ accent: "#b4441c", logoUrl: "https://cdn.x.uz/l.png", hidePoweredBy: false });
    expect(await wl.updateBrand(biz, cloneId, { hidePoweredBy: true, logoUrl: null })).toEqual({ accent: "#b4441c", logoUrl: null, hidePoweredBy: true });
    expect(await wl.publicBrand(biz, cloneId)).toMatchObject({ accent: "#b4441c", hidePoweredBy: true });
    // Boshqa tenant o'zgartira olmaydi
    await expect(wl.updateBrand(pro, cloneId, {})).rejects.toMatchObject({ status: 402 });
  });

  it("domen: TXT bilan tasdiqlash, host bo'yicha topish, takror va platforma domeni", async () => {
    await expect(wl.setDomain(biz, cloneId, "chat.aiclone.uz")).rejects.toThrow("Platforma");
    await expect(wl.setDomain(biz, cloneId, "localhost")).rejects.toThrow("noto'g'ri");
    const st = await wl.setDomain(biz, cloneId, `https://${domain.toUpperCase()}/`);
    expect(st).toMatchObject({ domain, verified: false, txt: { name: `_aiclone-challenge.${domain}` }, cname: { name: domain, value: "clones.aiclone.uz" } });
    await expect(wl.setDomain(biz, otherClone, domain)).rejects.toMatchObject({ status: 409 });

    expect((await wl.verifyDomain(biz, cloneId)).verified).toBe(false);
    expect(await wl.resolveHost(domain)).toBeNull();
    dns.set(st.txt.name, [["boshqa"], [st.txt.value.slice(0, 10), st.txt.value.slice(10)]]);
    expect((await wl.verifyDomain(biz, cloneId)).verified).toBe(true);
    expect(await wl.resolveHost(`${domain}:443`)).toEqual({ tenantId: biz, cloneId, slug: `wl-${suffix}` });

    // Xuddi shu domen qayta kiritilsa tasdiq saqlanadi, boshqa domen — yangi token va tasdiq kerak
    expect((await wl.setDomain(biz, cloneId, domain)).verified).toBe(true);
    const other = await wl.setDomain(biz, cloneId, `x-${domain}`);
    expect(other.verified).toBe(false);
    expect(other.txt.value).not.toBe(st.txt.value);
    expect(await wl.resolveHost(domain)).toBeNull();
    expect(await wl.removeDomain(biz, cloneId)).toBe(true);
  });

  it("tarif tugasa domen va brend o'chadi", async () => {
    const st = await wl.setDomain(biz, cloneId, domain);
    dns.set(st.txt.name, [[st.txt.value]]);
    await wl.verifyDomain(biz, cloneId);
    expect(await wl.resolveHost(domain)).not.toBeNull();
    await db.query("UPDATE tenants SET plan_expires_at = now() - interval '1 day' WHERE id = $1", [biz]);
    expect(await wl.resolveHost(domain)).toBeNull();
    expect(await wl.publicBrand(biz, cloneId)).toEqual({ accent: null, logoUrl: null, hidePoweredBy: false });
    await db.query("UPDATE tenants SET plan_expires_at = NULL WHERE id = $1", [biz]);
  });
});
