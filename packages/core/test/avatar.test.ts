import { describe, expect, it } from "vitest";
import { AvatarProviderError, DIdAvatar } from "../src/index.js";

describe("DIdAvatar", () => {
  const calls: { url: string; method: string; auth: string; body: unknown }[] = [];
  const fake = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const body = init?.body instanceof FormData ? Object.fromEntries([...init.body.keys()].map((k) => [k, (init.body as FormData).get(k) instanceof Blob ? "blob" : (init.body as FormData).get(k)])) : init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url: u, method: init?.method ?? "GET", auth: String((init?.headers as Record<string, string> | undefined)?.authorization ?? ""), body });
    if (u.endsWith("/images")) return Response.json({ id: "img_1", url: "s3://d-id-images/img_1.jpg" });
    if (u.endsWith("/audios")) return Response.json({ url: "s3://d-id-audios/a_1.mp3" });
    if (u.endsWith("/talks") && init?.method === "POST") {
      const b = JSON.parse(String(init.body)) as { script: { audio_url: string } };
      if (b.script.audio_url.includes("celeb")) return Response.json({ kind: "CelebrityRecognizedError", description: "celebrity" }, { status: 451 });
      return Response.json({ id: "tlk_1", status: "created" }, { status: 201 });
    }
    if (u.endsWith("/talks/tlk_1") && init?.method === "DELETE") return new Response(null, { status: 204 });
    if (u.endsWith("/talks/tlk_1")) return Response.json({ id: "tlk_1", status: "done", result_url: "https://result.d-id.com/v.mp4", duration: 4.2 });
    if (u === "https://result.d-id.com/v.mp4") return new Response(new Uint8Array([0, 0, 0, 24]));
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;

  it("rasm va audio yuklanadi, talk audio skript bilan yaratiladi, natija yuklab olinadi va o'chiriladi", async () => {
    const did = new DIdAvatar("KEY", { fetchFn: fake });
    const { talkId } = await did.createTalk({ data: new Uint8Array([0xff, 0xd8, 0xff]), mimeType: "image/jpeg" }, { data: new Uint8Array([1, 2]), mimeType: "audio/mpeg" });
    expect(talkId).toBe("tlk_1");
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(["POST https://api.d-id.com/images", "POST https://api.d-id.com/audios", "POST https://api.d-id.com/talks"]);
    expect(calls[0]).toMatchObject({ auth: "Basic KEY", body: { image: "blob" } });
    expect(calls[1]!.body).toEqual({ audio: "blob" });
    expect(calls[2]!.body).toEqual({ source_url: "s3://d-id-images/img_1.jpg", script: { type: "audio", audio_url: "s3://d-id-audios/a_1.mp3" }, config: { stitch: true } });

    expect(await did.getTalk("tlk_1")).toEqual({ status: "done", resultUrl: "https://result.d-id.com/v.mp4", durationSec: 4.2 });
    expect([...(await did.download("https://result.d-id.com/v.mp4"))]).toEqual([0, 0, 0, 24]);
    await did.deleteTalk("tlk_1");
    expect(calls.at(-1)).toMatchObject({ method: "DELETE", url: "https://api.d-id.com/talks/tlk_1" });
  });

  it("mashhur shaxs (451) — tushunarli doimiy xato; katta audio rad etiladi", async () => {
    const celeb = (async (url: string | URL, init?: RequestInit) =>
      String(url).endsWith("/audios") ? Response.json({ url: "s3://celeb.mp3" }) : fake(url, init)) as unknown as typeof fetch;
    const did = new DIdAvatar("KEY", { fetchFn: celeb });
    const err = await did.createTalk({ data: new Uint8Array(3), mimeType: "image/png" }, { data: new Uint8Array(3), mimeType: "audio/mpeg" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AvatarProviderError);
    expect(err).toMatchObject({ status: 451, permanent: true, message: expect.stringContaining("mashhur shaxs") });
    await expect(did.createTalk({ data: new Uint8Array(3), mimeType: "image/png" }, { data: new Uint8Array(6 * 1024 * 1024 + 1), mimeType: "audio/mpeg" })).rejects.toMatchObject({ permanent: true });
  });
});
