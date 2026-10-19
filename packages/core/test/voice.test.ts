import { describe, expect, it } from "vitest";
import { ElevenLabsVoice, VoiceProviderError, consentScript, randomConsentCode, verifyConsentTranscript } from "../src/index.js";

describe("rozilik matni", () => {
  const date = new Date("2026-10-19T10:00:00Z");

  it("ism, sana va kodni o'z ichiga oladi", () => {
    const s = consentScript("Dilnoza", date, "4821");
    expect(s).toContain("Men, Dilnoza, 2026-10-19 kuni");
    expect(s).toContain("roziman");
    expect(s).toContain("4 8 2 1");
  });

  it("kod sana raqamlari ichida uchramaydi", () => {
    const seq = [0.1131, 0.5]; // 1 + 0.1131*9000 → 2017 ("20261019" ichida yo'q) — birinchi urinish o'tadi
    const code = randomConsentCode(date, () => seq.shift() ?? 0.5);
    expect("20261019".includes(code)).toBe(false);
    for (let i = 0; i < 200; i++) expect("20261019".includes(randomConsentCode(date))).toBe(false);
  });

  it.each([
    ["Men Dilnoza 2026-10-19 kuni ... roziman. Tasdiqlash kodi: 4 8 2 1.", true],
    ["Men Dilnoza ... roziman. Tasdiqlash kodi to'rt sakkiz ikki bir", true],
    ["Я Дильноза, согласна. Код 4821", true],
    ["Men Dilnoza ... roziman. Tasdiqlash kodi: 1 2 3 4", false],
    ["Tasdiqlash kodi 4821", false],
  ])("%s → %s", (transcript, ok) => {
    expect(verifyConsentTranscript(transcript, "4821").ok).toBe(ok);
  });
});

describe("ElevenLabsVoice", () => {
  it("ovoz yaratadi, eleven_v3 bilan o'qiydi va o'chiradi", async () => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body });
      if (url.endsWith("/v1/voices/add")) return new Response(JSON.stringify({ voice_id: "v-1", requires_verification: false }));
      if (url.includes("/v1/text-to-speech/")) return new Response(new Uint8Array([9, 9]));
      return new Response("{}");
    }) as unknown as typeof fetch;
    const v = new ElevenLabsVoice("key", "eleven_v3", fakeFetch);
    expect(await v.createVoice("Dilnoza", [{ data: new Uint8Array([1]), filename: "a.webm", mimeType: "audio/webm" }])).toEqual({ voiceId: "v-1" });
    expect((calls[0]!.body as FormData).getAll("files")).toHaveLength(1);
    const out = await v.synthesize("v-1", "Salom", { languageHint: "uz" });
    expect(out).toEqual({ audio: new Uint8Array([9, 9]), mimeType: "audio/mpeg" });
    expect(calls[1]!.url).toContain("/v1/text-to-speech/v-1?output_format=mp3_44100_128");
    expect(JSON.parse(String(calls[1]!.body))).toEqual({ text: "Salom", model_id: "eleven_v3", language_code: "uz" });
    await v.deleteVoice("v-1");
    expect(calls[2]).toMatchObject({ method: "DELETE" });
    expect(v.dataResidency).toBe("foreign");
  });

  it("xato javobda VoiceProviderError", async () => {
    const fakeFetch = (async () => new Response("bad", { status: 422 })) as unknown as typeof fetch;
    await expect(new ElevenLabsVoice("k", "eleven_v3", fakeFetch).deleteVoice("x")).rejects.toBeInstanceOf(VoiceProviderError);
  });
});
