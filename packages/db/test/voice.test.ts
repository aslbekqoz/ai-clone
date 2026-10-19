import { HashingEmbedder, LLMRouter, MockProvider, MockStt, MockVoice, mockPolicy } from "@ai-clone/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CloneService, VoiceService, createPool, migrate, withTenant, type Db } from "../src/index.js";

const url = process.env.TEST_DATABASE_URL;
const audio = (n = 3) => ({ data: new Uint8Array(n).fill(1), filename: "a.webm", mimeType: "audio/webm" });

describe.skipIf(!url)("VoiceService (Postgres)", () => {
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

  async function setup(plan: "pro" | "creator" = "pro", region: "uz" | "global" = "uz") {
    const { tenantId } = await svc.createTenant(`Voice ${tenants.length}`, plan);
    tenants.push(tenantId);
    await db.query("UPDATE tenants SET region = $2 WHERE id = $1", [tenantId, region]);
    const clone = await svc.createClone(tenantId, { slug: `voice-${suffix}-${tenants.length}`, name: "Dilnoza" });
    return { tenantId, cloneId: clone.id };
  }

  /** Rozilik matnini "o'qigan" STT: berilgan kodni aytadi. */
  const sttSaying = (codeFrom: () => string) => ({ id: "mock", transcribe: async () => ({ text: `Men Dilnoza roziman. Tasdiqlash kodi ${codeFrom()}` }) });

  it("UZ tenanti uchun xorijiy provayder ruxsatsiz bloklanadi, global tenant uchun ochiq", async () => {
    const uz = await setup();
    const foreign = new VoiceService(db, new MockVoice("foreign"), new MockStt());
    await expect(foreign.issueConsent(uz.tenantId, uz.cloneId)).rejects.toMatchObject({ status: 403 });
    const allowed = new VoiceService(db, new MockVoice("foreign"), new MockStt(), { allowCrossBorder: true });
    await expect(allowed.issueConsent(uz.tenantId, uz.cloneId)).resolves.toMatchObject({ script: expect.stringContaining("Dilnoza") });
    const global = await setup("pro", "global");
    await expect(foreign.issueConsent(global.tenantId, global.cloneId)).resolves.toBeTruthy();
  });

  it("to'g'ri kod bilan ovoz yaratiladi; noto'g'ri kod va muddati o'tgan rozilik rad etiladi", async () => {
    const { tenantId, cloneId } = await setup();
    let code = "";
    const cloner = new MockVoice("uz");
    const voice = new VoiceService(db, cloner, sttSaying(() => code));
    const c1 = await voice.issueConsent(tenantId, cloneId);
    code = "0000";
    await expect(voice.enroll(tenantId, cloneId, { consentId: c1.consentId, consent: audio(), samples: [audio()] })).rejects.toMatchObject({ status: 422 });
    code = c1.script.match(/kodi: ([\d ]+)\./)![1]!.replace(/ /g, "");
    await expect(voice.enroll(tenantId, cloneId, { consentId: c1.consentId, consent: audio(), samples: [] })).rejects.toMatchObject({ status: 422 });
    expect(await voice.enroll(tenantId, cloneId, { consentId: c1.consentId, consent: audio(5), samples: [audio(), audio()] })).toEqual({ provider: "mock" });
    expect(cloner.created).toEqual([{ name: expect.stringContaining("Dilnoza"), samples: 2 }]);
    await expect(voice.enroll(tenantId, cloneId, { consentId: c1.consentId, consent: audio(), samples: [audio()] })).rejects.toMatchObject({ status: 404 });

    const later = new VoiceService(db, cloner, sttSaying(() => code), { now: () => new Date(Date.now() + 31 * 60_000) });
    const c2 = await voice.issueConsent(tenantId, cloneId);
    await expect(later.enroll(tenantId, cloneId, { consentId: c2.consentId, consent: audio(), samples: [audio()] })).rejects.toMatchObject({ status: 409 });
  });

  it("rejim, oshkoralik, kvota va qaytarib olish", async () => {
    const { tenantId, cloneId } = await setup();
    let code = "";
    const cloner = new MockVoice("uz");
    const voice = new VoiceService(db, cloner, sttSaying(() => code));
    await expect(voice.setMode(tenantId, cloneId, "always")).rejects.toMatchObject({ status: 409 });
    const c = await voice.issueConsent(tenantId, cloneId);
    code = c.script.match(/kodi: ([\d ]+)\./)![1]!.replace(/ /g, "");
    await voice.enroll(tenantId, cloneId, { consentId: c.consentId, consent: audio(), samples: [audio()] });

    const chat = await svc.chat(tenantId, cloneId, { channel: "telegram", externalId: "u", message: "salom" });
    const reply = { conversationId: chat.conversationId, text: "Kurs narxi 1 200 000 so'm." };
    expect(await voice.synthesizeReply(tenantId, cloneId, { ...reply, userSentVoice: true })).toBeNull(); // rejim off

    await voice.setMode(tenantId, cloneId, "voice_in");
    expect(await voice.synthesizeReply(tenantId, cloneId, { ...reply, userSentVoice: false })).toBeNull();
    expect(await voice.synthesizeReply(tenantId, cloneId, { ...reply, userSentVoice: true })).toMatchObject({ mimeType: "audio/mpeg" });
    await svc.chat(tenantId, cloneId, { channel: "telegram", externalId: "u", message: "yana" });
    await voice.synthesizeReply(tenantId, cloneId, { ...reply, userSentVoice: true });
    expect(cloner.spoken[0]).toBe("Men Dilnozaning AI-kloniman. Kurs narxi 1 200 000 so'm.");
    expect(cloner.spoken[1]).toBe("Kurs narxi 1 200 000 so'm.");
    const st = await voice.status(tenantId, cloneId);
    expect(st).toMatchObject({ enrolled: true, mode: "voice_in", minutesIncluded: 30 });
    expect(st.minutesUsed).toBeGreaterThan(0);

    // Ilova roli biometrik yozuvni o'qiy olmaydi (ustun huquqi berilmagan)
    await expect(withTenant(db, tenantId, (tx) => tx.query("SELECT recording FROM voice_consents"))).rejects.toThrow(/permission denied/);

    expect(await voice.revoke(tenantId, cloneId)).toBe(true);
    expect(cloner.deleted).toEqual(["voice-1"]);
    const row = (await db.query("SELECT status, recording FROM voice_consents WHERE clone_id = $1 AND status <> 'pending'", [cloneId])).rows[0];
    expect(row).toEqual({ status: "revoked", recording: null });
    expect(await voice.status(tenantId, cloneId)).toMatchObject({ enrolled: false, mode: "off" });
  });

  it("Creator tarifida ovoz daqiqasi yo'q — javob faqat matnda", async () => {
    const { tenantId, cloneId } = await setup("creator");
    let code = "";
    const voice = new VoiceService(db, new MockVoice("uz"), sttSaying(() => code));
    const c = await voice.issueConsent(tenantId, cloneId);
    code = c.script.match(/kodi: ([\d ]+)\./)![1]!.replace(/ /g, "");
    await voice.enroll(tenantId, cloneId, { consentId: c.consentId, consent: audio(), samples: [audio()] });
    await voice.setMode(tenantId, cloneId, "always");
    const chat = await svc.chat(tenantId, cloneId, { channel: "telegram", externalId: "u", message: "salom" });
    expect(await voice.synthesizeReply(tenantId, cloneId, { conversationId: chat.conversationId, text: "Salom", userSentVoice: false })).toBeNull();
    await expect(voice.preview(tenantId, cloneId, "Salom")).rejects.toMatchObject({ status: 403 });
  });
});
