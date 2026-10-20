import { HashingEmbedder, LLMRouter, MockProvider, MockVoice, mockPolicy, type TalkingAvatar } from "@ai-clone/core";
import { createWebhookDispatcher } from "@ai-clone/bot";
import { AvatarService, CloneService, JobQueue, JobWorker, TelegramChannels, VoiceService, createPool, migrate, type Db } from "@ai-clone/db";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createAvatarRequester, createJobHandlers } from "../src/jobs.js";

const url = process.env.TEST_DATABASE_URL;

const provider: TalkingAvatar = {
  id: "fake",
  dataResidency: "uz",
  createTalk: async () => ({ talkId: "tlk_api" }),
  getTalk: async () => ({ status: "done", resultUrl: "https://r/v.mp4", durationSec: 5 }),
  deleteTalk: async () => {},
  download: async () => new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]),
};

describe.skipIf(!url)("Video-avatar API (Postgres)", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let worker: JobWorker;
  let tenantId: string;
  let apiKey: string;
  let cloneId: string;
  const suffix = Date.now().toString(36);
  const slug = `ava-${suffix}`;
  let code = "";
  let svc: CloneService;
  let avatar: AvatarService;
  let queue: JobQueue;

  beforeAll(async () => {
    db = createPool(url);
    await migrate(db);
    svc = new CloneService(db, new HashingEmbedder(), new LLMRouter([new MockProvider()], mockPolicy()));
    const voice = new VoiceService(db, new MockVoice("uz"), { id: "mock", transcribe: async () => ({ text: `roziman ${code}` }) });
    avatar = new AvatarService(db, provider, voice);
    queue = new JobQueue(db);
    worker = new JobWorker(queue, createJobHandlers({ svc, avatar: { service: avatar, telegram: null } }), { cleanupEveryMs: 0 });
    app = createApp(svc, { voice, avatar: { service: avatar, request: createAvatarRequester(avatar, queue) }, jobs: { queue } });
    ({ tenantId, apiKey } = await svc.createTenant("Avatar API", "business"));
    await db.query("UPDATE tenants SET region = 'global' WHERE id = $1", [tenantId]);
    cloneId = (await svc.createClone(tenantId, { slug, name: "Kamola" })).id;
    await svc.addSource(tenantId, cloneId, { type: "text", title: "Kurs", text: "SMM kursi 2 oy davom etadi va darslar Zoom orqali o'tadi." });
    const c = await voice.issueConsent(tenantId, cloneId);
    code = c.script.match(/kodi: ([\d ]+)\./)![1]!.replace(/ /g, "");
    await voice.enroll(tenantId, cloneId, { consentId: c.consentId, consent: { data: new Uint8Array(3), filename: "c.webm", mimeType: "audio/webm" }, samples: [{ data: new Uint8Array(3), filename: "s.webm", mimeType: "audio/webm" }] });
  });

  afterAll(async () => {
    await db.query("DELETE FROM tenants WHERE id = $1", [tenantId]);
    await db.end();
  });


  it("surat + imzo → rejim → vidjet javobiga video → tashrifchi videoni oladi", async () => {
    const h = { authorization: `Bearer ${apiKey}` };
    const form = new FormData();
    form.append("photo", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "men.jpg", { type: "image/jpeg" }));
    form.append("signature", "Kamola");
    const enrolled = await app.request(`/v1/clones/${cloneId}/avatar`, { method: "POST", headers: h, body: form });
    expect(enrolled.status).toBe(201);
    expect(await enrolled.json()).toMatchObject({ enrolled: true, consentText: expect.stringContaining("Men, Kamola,") });
    expect((await app.request(`/v1/clones/${cloneId}/avatar`, { method: "PATCH", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ mode: "always" }) })).status).toBe(200);

    const visitorId = `visitor-${suffix}`;
    const chat = (await (await app.request(`/public/${slug}/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ visitorId, message: "Kurs qancha davom etadi?" }) })).json()) as { reply: string; video?: { id: string } };
    expect(chat.reply).toBeTruthy();
    const id = chat.video!.id;
    expect(await (await app.request(`/public/${slug}/video/${id}?visitorId=${visitorId}`)).json()).toEqual({ status: "queued" });
    expect((await app.request(`/public/${slug}/video/${id}?visitorId=begona-tashrifchi`)).status).toBe(404);

    expect(await worker.drain()).toBe(1);
    expect(await (await app.request(`/public/${slug}/video/${id}?visitorId=${visitorId}`)).json()).toEqual({ status: "done" });
    const file = await app.request(`/public/${slug}/video/${id}/file?visitorId=${visitorId}`);
    expect(file.headers.get("content-type")).toBe("video/mp4");
    expect([...new Uint8Array(await file.arrayBuffer())].slice(4)).toEqual([102, 116, 121, 112]);

    expect(await (await app.request(`/v1/clones/${cloneId}/avatar`, { method: "DELETE", headers: h })).json()).toEqual({ ok: true });
    expect((await app.request(`/public/${slug}/video/${id}/file?visitorId=${visitorId}`)).status).toBe(404);
  });

  it("Telegram: matnli javobdan keyin video shu chatga sendVideo bilan boradi", async () => {
    const BOT = 778000000 + Math.floor(Math.random() * 100000);
    const calls: { method: string; form: boolean; chatId: unknown }[] = [];
    const tgFetch = (async (u: string | URL, init?: RequestInit) => {
      const method = String(u).split("/").at(-1)!;
      const form = init?.body instanceof FormData;
      const body = form ? Object.fromEntries((init!.body as FormData).entries()) : init?.body ? JSON.parse(String(init.body)) : {};
      calls.push({ method, form, chatId: body.chat_id });
      const result =
        method === "getMe"
          ? { id: BOT, is_bot: true, first_name: "Kamola", username: `kamola_${BOT}`, can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false }
          : method === "sendMessage" || method === "sendVideo"
            ? { message_id: 1, date: 0, chat: { id: Number(body.chat_id), type: "private" } }
            : true;
      return new Response(JSON.stringify({ ok: true, result }));
    }) as unknown as typeof fetch;
    const telegram = new TelegramChannels(db, randomBytes(32), "https://api.aiclone.uz", tgFetch);
    await telegram.connect(tenantId, cloneId, `${BOT}:AAEavataravataravataravataravataXYZ`);
    const botId = (await db.query<{ id: string }>("SELECT id FROM telegram_bots WHERE bot_id = $1", [BOT])).rows[0]!.id;

    const form = new FormData();
    form.append("photo", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "men.jpg", { type: "image/jpeg" }));
    form.append("signature", "Kamola");
    expect((await app.request(`/v1/clones/${cloneId}/avatar`, { method: "POST", headers: { authorization: `Bearer ${apiKey}` }, body: form })).status).toBe(201);
    await avatar.setMode(tenantId, cloneId, "always");

    const request = createAvatarRequester(avatar, queue);
    const dispatch = createWebhookDispatcher(svc, telegram, {
      client: { fetch: tgFetch as never },
      avatar: (bot, req) => request({ tenantId: bot.tenantId, cloneId: bot.cloneId, conversationId: req.conversationId, reply: req.reply, channel: "telegram", recipient: req.chatId, botId: bot.id }),
    });
    const tgWorker = new JobWorker(queue, createJobHandlers({ svc, avatar: { service: avatar, telegram } }), { cleanupEveryMs: 0 });
    const update = { update_id: 1, message: { message_id: 3, date: 0, chat: { id: 6161, type: "private", first_name: "Ali" }, from: { id: 6161, is_bot: false, first_name: "Ali" }, text: "Kurs qancha davom etadi?" } };
    expect(await dispatch.handle(botId, update as never)).toBe(true);
    expect(calls.filter((c) => c.method === "sendMessage" && c.chatId === 6161)).toHaveLength(1);
    expect(calls.some((c) => c.method === "sendVideo")).toBe(false);

    expect(await tgWorker.drain()).toBe(1);
    expect(calls.filter((c) => c.method === "sendVideo")).toEqual([{ method: "sendVideo", form: true, chatId: "6161" }]);
  });
});
