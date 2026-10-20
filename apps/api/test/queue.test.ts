import { HashingEmbedder, LLMRouter, MockProvider, mockPolicy } from "@ai-clone/core";
import { createWebhookDispatcher } from "@ai-clone/bot";
import { CloneService, JobQueue, JobWorker, MetaChannels, TelegramChannels, createPool, migrate, type Db } from "@ai-clone/db";
import { createHmac, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { QUEUES, createJobHandlers } from "../src/jobs.js";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Fon navbati bilan API (Postgres)", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let worker: JobWorker;
  let svc: CloneService;
  let tenantId: string;
  let apiKey: string;
  let cloneId: string;
  const suffix = Date.now().toString(36);
  const BOT_ID = 777000000 + Math.floor(Math.random() * 100000);
  const TOKEN = `${BOT_ID}:AAEqueuequeuequeuequeuequeueXYZ`;

  const tgCalls: { method: string; body: Record<string, unknown> }[] = [];
  const tgFetch = (async (u: string | URL, init?: RequestInit) => {
    const m = String(u).match(/\/bot([^/]+)\/(\w+)$/)!;
    const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : {};
    tgCalls.push({ method: m[2]!, body });
    const result =
      m[2] === "getMe"
        ? { id: BOT_ID, is_bot: true, first_name: "Navbat bot", username: `bot_${BOT_ID}`, can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false }
        : m[2] === "sendMessage"
          ? { message_id: 1, date: 0, chat: { id: body.chat_id, type: "private" }, text: body.text }
          : true;
    return new Response(JSON.stringify({ ok: true, result }));
  }) as unknown as typeof fetch;
  const graphCalls: { url: string; body: Record<string, unknown> | null }[] = [];
  const graphFetch = (async (u: string | URL, init?: RequestInit) => {
    graphCalls.push({ url: String(u), body: init?.body ? JSON.parse(String(init.body)) : null });
    if (String(u).includes("?fields=display_phone_number")) return new Response(JSON.stringify({ display_phone_number: "+998 90 000 00 01", verified_name: "Navbat" }));
    return new Response(JSON.stringify({ success: true, messages: [{ id: "wamid.out" }] }));
  }) as unknown as typeof fetch;

  beforeAll(async () => {
    db = createPool(url);
    await migrate(db);
    svc = new CloneService(db, new HashingEmbedder(), new LLMRouter([new MockProvider()], mockPolicy()));
    ({ tenantId, apiKey } = await svc.createTenant("Navbat", "pro"));
    cloneId = (await svc.createClone(tenantId, { slug: `queue-${suffix}`, name: "Navbat" })).id;
    await svc.addSource(tenantId, cloneId, { type: "text", title: "Kurs", text: "Speaking bo'limida eng muhimi ravonlik va tabiiy talaffuz." });

    const telegram = new TelegramChannels(db, randomBytes(32), "https://api.aiclone.uz", tgFetch);
    const meta = new MetaChannels(db, randomBytes(32), graphFetch);
    const queue = new JobQueue(db);
    const dispatch = createWebhookDispatcher(svc, telegram, { client: { fetch: tgFetch as never } });
    worker = new JobWorker(queue, createJobHandlers({ svc, telegram: dispatch.handle, meta }), { cleanupEveryMs: 0 });
    app = createApp(svc, { telegram, telegramClient: { fetch: tgFetch as never }, meta: { channels: meta, appSecret: "q-secret", verifyToken: "v" }, jobs: { queue } });
  });

  afterAll(async () => {
    await db.query("DELETE FROM jobs WHERE tenant_id = $1 OR payload->>'botId' IN (SELECT id::text FROM telegram_bots WHERE tenant_id = $1)", [tenantId]);
    await db.query("DELETE FROM tenants WHERE id = $1", [tenantId]);
    await db.end();
  });

  const call = (path: string, init: RequestInit = {}) =>
    app.request(path, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}`, ...(init.headers as Record<string, string>) } });

  it("Telegram: webhook darhol 200, takror yetkazish bitta vazifa, javobni worker yuboradi", async () => {
    expect((await call(`/v1/clones/${cloneId}/telegram`, { method: "POST", body: JSON.stringify({ token: TOKEN }) })).status).toBe(201);
    const hook = tgCalls.find((c) => c.method === "setWebhook")!;
    const path = new URL(String(hook.body.url)).pathname;
    const send = (update: unknown, secret = String(hook.body.secret_token)) =>
      app.request(path, { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify(update) });
    const update = { update_id: 9001, message: { message_id: 5, date: 0, chat: { id: 5151, type: "private", first_name: "Vali" }, from: { id: 5151, is_bot: false, first_name: "Vali" }, text: "Speaking bo'limida eng muhimi nima?" } };

    expect((await send(update, "xato")).status).toBe(401);
    expect((await send(update)).status).toBe(200);
    expect((await send(update)).status).toBe(200);
    // Webhook so'rovida javob yuborilmaydi — faqat navbatga qo'yiladi
    expect(tgCalls.some((c) => c.method === "sendMessage")).toBe(false);
    const botRow = (await db.query<{ id: string }>("SELECT id FROM telegram_bots WHERE bot_id = $1", [BOT_ID])).rows[0]!;
    const jobs = (await db.query("SELECT group_key FROM jobs WHERE queue = $1 AND payload->>'botId' = $2", [QUEUES.telegram, botRow.id])).rows;
    expect(jobs).toEqual([{ group_key: `tg:${botRow.id}:5151` }]);

    await worker.drain();
    const answers = tgCalls.filter((c) => c.method === "sendMessage" && c.body.chat_id === 5151);
    expect(answers).toHaveLength(1);
    expect(String(answers[0]!.body.text)).toContain("ravonlik");
  });

  it("WhatsApp: imzolangan webhook navbatga, takror o'tkazib yuboriladi, worker javob beradi", async () => {
    expect((await call(`/v1/clones/${cloneId}/channels/whatsapp`, { method: "POST", body: JSON.stringify({ phoneNumberId: `2${String(BOT_ID).slice(-9)}`, accessToken: "EAAJ-queue-token-1234567890" }) })).status).toBe(201);
    const phone = `2${String(BOT_ID).slice(-9)}`;
    const payload = {
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: phone }, contacts: [{ wa_id: "998935550000", profile: { name: "Aziz" } }], messages: [{ from: "998935550000", id: `wamid.q-${suffix}`, type: "text", text: { body: "Speaking uchun maslahat bering" } }] } }] }],
    };
    const post = () => {
      const raw = JSON.stringify(payload);
      return app.request("/meta/webhook", { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + createHmac("sha256", "q-secret").update(raw).digest("hex") }, body: raw });
    };
    expect(await (await post()).json()).toEqual({ ok: true, queued: 1, skipped: 0 });
    expect(await (await post()).json()).toEqual({ ok: true, queued: 0, skipped: 1 });
    expect(graphCalls.some((c) => c.url.endsWith(`/${phone}/messages`))).toBe(false);

    await worker.drain();
    const reply = graphCalls.filter((c) => c.url.endsWith(`/${phone}/messages`));
    expect(reply).toHaveLength(1);
    expect(reply[0]!.body).toMatchObject({ to: "+998935550000", type: "text" });
  });

  it("YouTube: 202 va vazifa holati faqat o'z tenantiga ko'rinadi", async () => {
    expect((await call(`/v1/clones/${cloneId}/sources/youtube`, { method: "POST", body: JSON.stringify({ url: "https://example.com/video" }) })).status).toBe(422);
    const r = await call(`/v1/clones/${cloneId}/sources/youtube`, { method: "POST", body: JSON.stringify({ url: "https://youtu.be/dQw4w9WgXcQ" }) });
    expect(r.status).toBe(202);
    const { jobId } = (await r.json()) as { jobId: string };
    expect(await (await call(`/v1/jobs/${jobId}`)).json()).toMatchObject({ id: jobId, queue: QUEUES.youtube, status: "queued" });

    const other = await svc.createTenant("Begona");
    expect((await call(`/v1/jobs/${jobId}`, { headers: { authorization: `Bearer ${other.apiKey}` } })).status).toBe(404);
    await db.query("DELETE FROM tenants WHERE id = $1", [other.tenantId]);
  });
});
