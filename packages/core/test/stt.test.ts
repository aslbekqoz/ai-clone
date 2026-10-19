import { describe, expect, it } from "vitest";
import { ElevenLabsStt, SttError } from "../src/index.js";

describe("ElevenLabsStt", () => {
  it("multipart so'rov yuboradi va matnni qaytaradi", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      captured = { url, init };
      return new Response(JSON.stringify({ text: " Kurs narxi qancha? ", language_code: "uzb" }), { status: 200 });
    }) as unknown as typeof fetch;
    const stt = new ElevenLabsStt("key-123", "scribe_v2", fakeFetch);
    const out = await stt.transcribe(new Uint8Array([1, 2, 3]), { filename: "voice.ogg", mimeType: "audio/ogg", languageHint: "uz" });

    expect(out).toEqual({ text: "Kurs narxi qancha?", language: "uzb" });
    expect(captured!.url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    expect((captured!.init.headers as Record<string, string>)["xi-api-key"]).toBe("key-123");
    const form = captured!.init.body as FormData;
    expect(form.get("model_id")).toBe("scribe_v2");
    expect(form.get("language_code")).toBe("uz");
    expect((form.get("file") as File).name).toBe("voice.ogg");
    expect((form.get("file") as File).size).toBe(3);
  });

  it("havola bo'yicha transkripsiya source_url bilan", async () => {
    let form: FormData | undefined;
    const fakeFetch = (async (_: string, init: RequestInit) => {
      form = init.body as FormData;
      return new Response(JSON.stringify({ text: "salom" }));
    }) as unknown as typeof fetch;
    await new ElevenLabsStt("k", "scribe_v2", fakeFetch).transcribeUrl("https://youtu.be/abc");
    expect(form!.get("source_url")).toBe("https://youtu.be/abc");
    expect(form!.get("file")).toBeNull();
  });

  it("xato javobda SttError tashlaydi", async () => {
    const fakeFetch = (async () => new Response("quota exceeded", { status: 429 })) as unknown as typeof fetch;
    await expect(new ElevenLabsStt("k", "scribe_v2", fakeFetch).transcribe(new Uint8Array(1), { filename: "a", mimeType: "audio/ogg" })).rejects.toBeInstanceOf(SttError);
  });
});
