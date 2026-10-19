import { MockStt } from "@ai-clone/core";
import type { CloneRecord, CloneService } from "@ai-clone/db";
import { describe, expect, it } from "vitest";
import { createBot } from "../src/bot.js";
import { MAX_VOICE_SECONDS, transcribeTelegramFile } from "../src/voice.js";

const okFetch = (async () => new Response(new Uint8Array([7, 7, 7]))) as unknown as typeof fetch;

describe("transcribeTelegramFile", () => {
  it("faylni yuklab matnga aylantiradi", async () => {
    const stt = new MockStt("Darslar qachon?");
    const out = await transcribeTelegramFile(stt, "TOKEN", { filePath: "voice/file_1.oga", durationSec: 5 }, okFetch);
    expect(out).toEqual({ ok: true, text: "Darslar qachon?" });
    expect(stt.calls[0]).toMatchObject({ bytes: 3, filename: "file_1.oga" });
  });

  it("juda uzun audio STT'ga yuborilmaydi", async () => {
    const stt = new MockStt();
    expect(await transcribeTelegramFile(stt, "T", { filePath: "x", durationSec: MAX_VOICE_SECONDS + 1 }, okFetch)).toEqual({ ok: false, reason: "too_long" });
    expect(stt.calls).toHaveLength(0);
  });

  it("yuklash xatosi va bo'sh nutq", async () => {
    const failFetch = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    expect(await transcribeTelegramFile(new MockStt(), "T", { filePath: "x", durationSec: 1 }, failFetch)).toEqual({ ok: false, reason: "download_failed" });
    expect(await transcribeTelegramFile(new MockStt(""), "T", { filePath: "x", durationSec: 1 }, okFetch)).toEqual({ ok: false, reason: "empty" });
  });
});

describe("bot: ovozli xabar oqimi", () => {
  const clone: CloneRecord = {
    id: "clone-1",
    tenantId: "t1",
    slug: "dilnoza",
    ownerTelegramChatId: "999",
    persona: { name: "Dilnoza", bio: "", languages: ["uz"], grounded: true, disclosure: "🤖 AI-klon", style: { tone: "", address: "siz", emoji: "rare", length: "short", signaturePhrases: [], avoidTopics: [] } },
  };

  function setup(stt?: MockStt, voiceReply?: Uint8Array) {
    const chats: { message: string; meta?: unknown }[] = [];
    const svc = {
      chat: async (_t: string, _c: string, input: { message: string; meta?: unknown }) => {
        chats.push({ message: input.message, meta: input.meta });
        return { conversationId: "conv-1", reply: "Narxi 1 200 000 so'm [S1]", messageId: "m1", mode: "bot", citations: [{ id: "S1", chunkId: "c", title: "Kurslar" }], escalated: false, escalationReasons: [], leadCaptured: false, limitReached: false };
      },
    } as unknown as CloneService;
    const voice = voiceReply ? ({ synthesizeReply: async () => ({ audio: voiceReply, mimeType: "audio/mpeg" }) } as never) : undefined;
    const bot = createBot(svc, {
      token: "TOKEN",
      tenantId: "t1",
      clone,
      ...(stt ? { stt } : {}),
      ...(voice ? { voice } : {}),
      fetchFn: okFetch,
      botInfo: { id: 1, is_bot: true, first_name: "Dilnoza AI", username: "dilnoza_ai_bot", can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false },
    });
    const sent: { method: string; payload: Record<string, unknown> }[] = [];
    bot.api.config.use(async (_prev, method, payload) => {
      sent.push({ method, payload: payload as Record<string, unknown> });
      const result = method === "getFile" ? { file_id: "f1", file_unique_id: "u1", file_path: "voice/file_1.oga" } : true;
      return { ok: true, result } as never;
    });
    return { bot, sent, chats };
  }

  const voiceUpdate = (duration = 4) => ({
    update_id: 1,
    message: { message_id: 10, date: 0, chat: { id: 42, type: "private" as const, first_name: "Ali" }, from: { id: 42, is_bot: false, first_name: "Ali" }, voice: { file_id: "f1", file_unique_id: "u1", duration, mime_type: "audio/ogg" } },
  });

  it("ovozni matnga aylantirib klonga beradi va javobni manba bilan yuboradi", async () => {
    const { bot, sent, chats } = setup(new MockStt("Kurs narxi qancha?"));
    await bot.handleUpdate(voiceUpdate());
    expect(chats).toEqual([{ message: "Kurs narxi qancha?", meta: { voiceSeconds: 4 } }]);
    const texts = sent.filter((s) => s.method === "sendMessage").map((s) => s.payload.text);
    expect(texts[0]).toBe("🎙 «Kurs narxi qancha?»");
    expect(texts[1]).toBe("Narxi 1 200 000 so'm\n\n📚 Manba:\n• Kurslar");
  });

  it("ovoz kloni yoqilgan bo'lsa, matndan keyin ovozli javob yuboriladi", async () => {
    const { bot, sent } = setup(new MockStt("Kurs narxi qancha?"), new Uint8Array([1, 2, 3]));
    await bot.handleUpdate(voiceUpdate());
    const methods = sent.map((s) => s.method).filter((m) => m !== "sendChatAction");
    expect(methods).toEqual(["getFile", "sendMessage", "sendMessage", "sendVoice"]);
  });

  it("STT sozlanmagan bo'lsa, yozib yuborishni so'raydi", async () => {
    const { bot, sent, chats } = setup();
    await bot.handleUpdate(voiceUpdate());
    expect(chats).toHaveLength(0);
    expect(String(sent.find((s) => s.method === "sendMessage")?.payload.text)).toContain("yozib yuboring");
  });
});
