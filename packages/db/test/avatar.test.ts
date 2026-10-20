import { HashingEmbedder, LLMRouter, MockProvider, MockVoice, mockPolicy, type TalkingAvatar } from "@ai-clone/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AvatarService, CloneService, VoiceService, createPool, migrate, sniffImage, speakableText, type Db } from "../src/index.js";

const url = process.env.TEST_DATABASE_URL;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const audio = () => ({ data: new Uint8Array(3).fill(1), filename: "a.webm", mimeType: "audio/webm" });

describe("avatar yordamchilari", () => {
  it("fayl turini baytlardan aniqlaydi", () => {
    expect(sniffImage(JPEG)).toBe("image/jpeg");
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("image/png");
    expect(sniffImage(new TextEncoder().encode("<svg>"))).toBeNull();
  });
  it("videoda o'qiladigan matn: iqtibos, havola va manbalarsiz", () => {
    expect(speakableText("Kurs 3 oy davom etadi [S1]. Batafsil: https://x.uz/k\n\n📚 Manba:\n• Kurs")).toBe("Kurs 3 oy davom etadi. Batafsil:");
  });
});

class FakeAvatar implements TalkingAvatar {
  readonly id = "fake";
  readonly dataResidency: "uz" | "foreign";
  talks: { image: number; audio: number }[] = [];
  deleted: string[] = [];
  polls = 0;
  constructor(residency: "uz" | "foreign" = "uz", private readonly outcome: "done" | "rejected" = "done") {
    this.dataResidency = residency;
  }
  async createTalk(image: { data: Uint8Array }, a: { data: Uint8Array }) {
    this.talks.push({ image: image.data.length, audio: a.data.length });
    return { talkId: `tlk_${this.talks.length}` };
  }
  async getTalk() {
    return ++this.polls < 2 ? { status: "started" as const } : this.outcome === "done" ? { status: "done" as const, resultUrl: "https://r/v.mp4", durationSec: 6 } : { status: "rejected" as const, error: "moderation" };
  }
  async deleteTalk(id: string) {
    this.deleted.push(id);
  }
  async download() {
    return new Uint8Array([0, 0, 0, 24, 102, 116]);
  }
}

describe.skipIf(!url)("AvatarService (Postgres)", () => {
  let db: Db;
  let svc: CloneService;
  const tenants: string[] = [];
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    db = createPool(url);
    await migrate(db);
    svc = new CloneService(db, new HashingEmbedder(), new LLMRouter([new MockProvider()], mockPolicy()));
  });
  afterAll(async () => {
    await db.query("DELETE FROM tenants WHERE id = ANY($1)", [tenants]);
    await db.end();
  });

  /** Ovozi tasdiqlangan klon (STT rozilik kodini "eshitadi"). */
  async function setup(plan: "business" | "pro" = "business", region: "uz" | "global" = "global") {
    const { tenantId } = await svc.createTenant(`Avatar ${tenants.length}`, plan);
    tenants.push(tenantId);
    await db.query("UPDATE tenants SET region = $2 WHERE id = $1", [tenantId, region]);
    const cloneId = (await svc.createClone(tenantId, { slug: `av-${suffix}-${tenants.length}`, name: "Dilnoza Karimova" })).id;
    let code = "";
    const voice = new VoiceService(db, new MockVoice("uz"), { id: "mock", transcribe: async () => ({ text: `roziman kodi ${code}` }) });
    return { tenantId, cloneId, voice, enrollVoice: async () => {
      const c = await voice.issueConsent(tenantId, cloneId);
      code = c.script.match(/kodi: ([\d ]+)\./)![1]!.replace(/ /g, "");
      await voice.enroll(tenantId, cloneId, { consentId: c.consentId, consent: audio(), samples: [audio()] });
    } };
  }

  it("rozilik shartlari: tarif, ovoz kloni, surat turi, imzo; UZ uchun xorijiy provayder bloklanadi", async () => {
    const pro = await setup("pro");
    await expect(new AvatarService(db, new FakeAvatar(), pro.voice).enroll(pro.tenantId, pro.cloneId, { photo: JPEG, signature: "Dilnoza Karimova" })).rejects.toMatchObject({ status: 402 });

    const uz = await setup("business", "uz");
    await expect(new AvatarService(db, new FakeAvatar("foreign"), uz.voice).enroll(uz.tenantId, uz.cloneId, { photo: JPEG, signature: "x" })).rejects.toMatchObject({ status: 403 });

    const b = await setup();
    const av = new AvatarService(db, new FakeAvatar(), b.voice);
    await expect(av.enroll(b.tenantId, b.cloneId, { photo: JPEG, signature: "Dilnoza Karimova" })).rejects.toMatchObject({ status: 409 });
    await b.enrollVoice();
    await expect(av.enroll(b.tenantId, b.cloneId, { photo: new TextEncoder().encode("<svg/>"), signature: "Dilnoza Karimova" })).rejects.toMatchObject({ status: 415 });
    await expect(av.enroll(b.tenantId, b.cloneId, { photo: JPEG, signature: "Boshqa Odam" })).rejects.toThrow('"Dilnoza Karimova"');
    await av.enroll(b.tenantId, b.cloneId, { photo: JPEG, signature: " dilnoza karimova ", ip: "1.2.3.4" });
    expect(await av.status(b.tenantId, b.cloneId)).toMatchObject({ enrolled: true, mode: "off", secondsIncluded: 1200, secondsUsed: 0 });
    // Surat ilova roliga ko'rinmaydi
    const client = await db.connect();
    try {
      await client.query("SET ROLE aiclone_app");
      await expect(client.query("SELECT photo FROM avatar_profiles")).rejects.toThrow(/permission denied/);
    } finally {
      await client.query("RESET ROLE");
      client.release();
    }
  });

  it("javob → navbat yozuvi → video; oshkoralik, uzunlik chegarasi, kvota va qaytarib olish", async () => {
    const b = await setup();
    await b.enrollVoice();
    const provider = new FakeAvatar();
    const av = new AvatarService(db, provider, b.voice);
    await av.enroll(b.tenantId, b.cloneId, { photo: JPEG, signature: "Dilnoza Karimova" });
    const chat = await svc.chat(b.tenantId, b.cloneId, { channel: "web", externalId: `visitor-${suffix}`, message: "salom" });
    const req = (reply: string) => av.request(b.tenantId, b.cloneId, { conversationId: chat.conversationId, reply, channel: "web", recipient: `visitor-${suffix}` });

    expect(await req("Rejim o'chiq")).toBeNull();
    await av.setMode(b.tenantId, b.cloneId, "always");
    expect(await req("x".repeat(290))).toBeNull(); // oshkoralik bilan 300 dan oshadi
    const id = (await req("Kurs 3 oy davom etadi [S1]."))!;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const text = (await db.query("SELECT text FROM avatar_renders WHERE id = $1", [id])).rows[0].text as string;
    expect(text).toBe("Men Dilnoza Karimovaning AI-kloniman. Kurs 3 oy davom etadi.");

    expect(await av.forVisitor(b.cloneId, id, `visitor-${suffix}`)).toEqual({ status: "queued", video: null });
    const out = await av.render(id, { pollMs: 1 });
    expect(out).toMatchObject({ channel: "web", recipient: `visitor-${suffix}` });
    expect(provider.talks).toEqual([{ image: JPEG.length, audio: expect.any(Number) }]);
    expect(provider.deleted).toEqual(["tlk_1"]);
    expect((await av.forVisitor(b.cloneId, id, `visitor-${suffix}`))!.status).toBe("done");
    expect(await av.forVisitor(b.cloneId, id, "boshqa-tashrifchi")).toBeNull();
    expect((await av.status(b.tenantId, b.cloneId)).secondsUsed).toBe(6);

    // Ikkinchi video oshkoraliksiz
    const id2 = (await req("Darslar Zoom orqali."))!;
    expect((await db.query("SELECT text FROM avatar_renders WHERE id = $1", [id2])).rows[0].text).toBe("Darslar Zoom orqali.");
    // Kvota tugasa — video so'ralmaydi
    await db.query("UPDATE avatar_renders SET status = 'done', seconds = 1200 WHERE id = $1", [id2]);
    expect(await req("Yana savol")).toBeNull();

    expect(await av.revoke(b.tenantId, b.cloneId)).toBe(true);
    expect((await av.forVisitor(b.cloneId, id, `visitor-${suffix}`))!.video).toBeNull();
    expect(await av.status(b.tenantId, b.cloneId)).toMatchObject({ enrolled: false, mode: "off" });
    await expect(av.render(id, { pollMs: 1 })).rejects.toMatchObject({ permanent: true });
  });

  it("provayder rad etsa — doimiy xato", async () => {
    const b = await setup();
    await b.enrollVoice();
    const av = new AvatarService(db, new FakeAvatar("uz", "rejected"), b.voice);
    await av.enroll(b.tenantId, b.cloneId, { photo: JPEG, signature: "Dilnoza Karimova" });
    await av.setMode(b.tenantId, b.cloneId, "always");
    const chat = await svc.chat(b.tenantId, b.cloneId, { channel: "telegram", externalId: "42", message: "salom" });
    const id = (await av.request(b.tenantId, b.cloneId, { conversationId: chat.conversationId, reply: "Qisqa javob", channel: "telegram", recipient: "42" }))!;
    await expect(av.render(id, { pollMs: 1 })).rejects.toMatchObject({ permanent: true, message: expect.stringContaining("moderation") });
  });
});
