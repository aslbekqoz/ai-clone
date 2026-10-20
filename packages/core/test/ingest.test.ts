import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MockStt, UnsupportedFileError, captionsToSections, citationTitle, extractCaptionTracks, fetchYouTubeTranscript, parseFile, parseYouTubeId, pickTrack, unifyApostrophes } from "../src/index.js";

const fixture = (name: string) => readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", name));

describe("parseFile", () => {
  it("PDF'ni sahifalar bo'yicha ajratadi", async () => {
    const doc = await parseFile("kurs.pdf", "application/pdf", await fixture("kurs.pdf"));
    expect(doc.type).toBe("pdf");
    expect(doc.title).toBe("kurs");
    expect(doc.sections).toHaveLength(2);
    expect(doc.sections[0]).toMatchObject({ locator: { page: 1 } });
    // PDF shriftlari apostrofni ’ bilan beradi — qidiruv normallashtiruvi uni ' ga keltiradi.
    expect(unifyApostrophes(doc.sections[0]!.text)).toContain("1 200 000 so'm");
    expect(doc.sections[1]!.text).toContain("ravonlik");
  });

  it("DOCX'dan matn va kirill yozuvni oladi", async () => {
    const doc = await parseFile("maslahat.docx", "", await fixture("maslahat.docx"));
    expect(doc.type).toBe("doc");
    expect(doc.sections[0]!.text).toContain("Writing Task 2 uchun 40 daqiqa");
    expect(doc.sections[0]!.text).toContain("Курс нархи қанча?");
  });

  it("TXT va qo'llab-quvvatlanmaydigan format", async () => {
    const txt = await parseFile("eslatma.md", "text/markdown", new TextEncoder().encode("# Sarlavha\r\n\r\n\r\n\r\nMatn"));
    expect(txt.sections[0]!.text).toBe("# Sarlavha\n\nMatn");
    await expect(parseFile("arxiv.zip", "application/zip", new Uint8Array([1, 2]))).rejects.toBeInstanceOf(UnsupportedFileError);
    await expect(parseFile("skan.png", "image/png", new Uint8Array([1, 2]))).rejects.toMatchObject({ name: "NeedsOcrError", kind: "image", mimeType: "image/png" });
  });
});

describe("YouTube", () => {
  it.each([
    ["https://youtu.be/dQw4w9WgXcQ?t=10", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=x", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://example.com/watch?v=dQw4w9WgXcQ", null],
    ["salom", null],
  ])("parseYouTubeId(%s) = %s", (url, id) => expect(parseYouTubeId(url)).toBe(id));

  const html = `<html><head><title>IELTS Speaking sirlari - YouTube</title><meta name="title" content="IELTS Speaking sirlari &amp; maslahatlar"></head><body><script>var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ\\u0026lang=en","name":{"runs":[{"text":"English [auto]"}]},"languageCode":"en","kind":"asr"},{"baseUrl":"https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ\\u0026lang=uz","name":{"simpleText":"O'zbek"},"languageCode":"uz"}],"audioTracks":[]}}};</script></body></html>`;

  it("subtitr treklarini ichma-ich JSON'dan ajratadi va o'zbek tilini tanlaydi", () => {
    const { title, tracks } = extractCaptionTracks(html);
    expect(title).toBe("IELTS Speaking sirlari & maslahatlar");
    expect(tracks).toHaveLength(2);
    expect(pickTrack(tracks)?.languageCode).toBe("uz");
    expect(pickTrack(tracks)?.baseUrl).toContain("&lang=uz");
  });

  const json3 = { events: [{ tStartMs: 0, segs: [{ utf8: "Assalomu alaykum." }] }, { tStartMs: 30_000, segs: [{ utf8: "Bugun Speaking haqida." }] }, { tStartMs: 95_000, segs: [{ utf8: "Part 2 da " }, { utf8: "kalit so'zlar yozing." }] }, { tStartMs: 96_000 }] };

  it("subtitrlarni 90 soniyalik oynalarga yig'adi, havola daqiqaga olib boradi", () => {
    const s = captionsToSections(json3, "dQw4w9WgXcQ");
    expect(s).toEqual([
      { text: "Assalomu alaykum. Bugun Speaking haqida.", locator: { ts: 0, url: "https://youtu.be/dQw4w9WgXcQ?t=0" } },
      { text: "Part 2 da kalit so'zlar yozing.", locator: { ts: 95, url: "https://youtu.be/dQw4w9WgXcQ?t=95" } },
    ]);
  });

  it("fetchYouTubeTranscript: subtitr bo'lsa undan, bo'lmasa STT'dan", async () => {
    const urls: string[] = [];
    const withCaptions = (async (url: string) => {
      urls.push(url);
      return url.includes("timedtext") ? new Response(JSON.stringify(json3)) : new Response(html);
    }) as unknown as typeof fetch;
    const a = await fetchYouTubeTranscript("https://youtu.be/dQw4w9WgXcQ", { fetchFn: withCaptions });
    expect(a).toMatchObject({ method: "captions", language: "uz", videoId: "dQw4w9WgXcQ" });
    expect(urls[1]).toContain("lang=uz&fmt=json3");

    const blocked = (async () => new Response("", { status: 429 })) as unknown as typeof fetch;
    const stt = new MockStt("Videodagi nutq matni");
    const b = await fetchYouTubeTranscript("https://youtu.be/dQw4w9WgXcQ", { fetchFn: blocked, stt });
    expect(b).toMatchObject({ method: "stt", sections: [{ text: "Videodagi nutq matni" }] });
    expect(stt.calls[0]?.url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    await expect(fetchYouTubeTranscript("https://youtu.be/dQw4w9WgXcQ", { fetchFn: blocked })).rejects.toThrow(/STT/);
  });

  it("iqtibos sarlavhasida sahifa va vaqt", () => {
    expect(citationTitle({ title: "Kitob", locator: { page: 12 } })).toBe("Kitob, 12-bet");
    expect(citationTitle({ title: "Video", locator: { ts: 205 } })).toBe("Video, 03:25");
    expect(citationTitle({ title: "Video", locator: { ts: 3725 } })).toBe("Video, 1:02:05");
  });
});
