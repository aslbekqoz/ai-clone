// Ishga tushirishdan oldingi tekshiruv: konfiguratsiya (oflayn) va haqiqiy kalitlar bilan integratsiyalar (onlayn).
// Onlayn tekshiruvlar faqat o'qiydi yoki tekin: model ma'lumoti, akkaunt, kreditlar, bitta embedding.
import { parseSecretKey } from "@ai-clone/db";

export type CheckStatus = "ok" | "warn" | "fail" | "skip";
export interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
}

type Env = Record<string, string | undefined>;
type FetchFn = typeof fetch;

const ok = (name: string, detail: string): CheckResult => ({ name, status: "ok", detail });
const warn = (name: string, detail: string): CheckResult => ({ name, status: "warn", detail });
const fail = (name: string, detail: string): CheckResult => ({ name, status: "fail", detail });
const skip = (name: string, detail: string): CheckResult => ({ name, status: "skip", detail });

/** Prod uchun konfiguratsiya: sirlar, URL'lar va bog'liq sozlamalar. Tarmoqqa chiqmaydi. */
export function configChecks(env: Env): CheckResult[] {
  const out: CheckResult[] = [];
  const prod = env.NODE_ENV === "production";

  const admin = env.ADMIN_TOKEN ?? "";
  if (!admin) out.push(warn("ADMIN_TOKEN", "o'rnatilmagan — admin endpointlari yopiq"));
  else if (admin === "change-me" || admin.length < 24) out.push(fail("ADMIN_TOKEN", "sukut qiymati yoki 24 belgidan qisqa: openssl rand -hex 24"));
  else out.push(ok("ADMIN_TOKEN", "kuchli"));

  const base = env.PUBLIC_BASE_URL;
  if (!base) out.push(prod ? fail("PUBLIC_BASE_URL", "kerak (webhooklar, vidjet, to'lov havolalari)") : warn("PUBLIC_BASE_URL", "o'rnatilmagan"));
  else if (prod && !base.startsWith("https://")) out.push(fail("PUBLIC_BASE_URL", "prod'da https:// bo'lishi shart (Telegram, Meta, Payme talabi)"));
  else out.push(ok("PUBLIC_BASE_URL", base));

  if (env.CHANNEL_SECRET_KEY) {
    try {
      parseSecretKey(env.CHANNEL_SECRET_KEY);
      out.push(ok("CHANNEL_SECRET_KEY", "32 bayt"));
    } catch (err) {
      out.push(fail("CHANNEL_SECRET_KEY", (err as Error).message));
    }
  } else out.push(warn("CHANNEL_SECRET_KEY", "yo'q — ko'p klonli Telegram, Instagram va WhatsApp o'chiq"));

  const link = env.PAYMENT_LINK_SECRET;
  if (link && link.length < 32) out.push(fail("PAYMENT_LINK_SECRET", "32 belgidan qisqa — to'lov havolalarini soxtalashtirish oson"));
  else if (link) out.push(ok("PAYMENT_LINK_SECRET", "o'rnatilgan"));

  if (env.META_APP_SECRET && !env.META_VERIFY_TOKEN) out.push(fail("META_VERIFY_TOKEN", "META_APP_SECRET bor, lekin webhook tasdiqlash tokeni yo'q"));
  if (env.PAYME_MERCHANT_ID) {
    if (!env.PAYME_KEY) out.push(fail("PAYME_KEY", "kassa kaliti yo'q"));
    else if (prod && env.PAYME_TEST === "1") out.push(warn("PAYME_TEST", "prod'da test rejimi yoqilgan"));
    if (!env.PAYME_IKPU_CODE) out.push(warn("PAYME_IKPU_CODE", "fiskal chek uchun IKPU kodi yo'q"));
  }
  if (env.CLICK_SERVICE_ID && (!env.CLICK_SECRET_KEY || !env.CLICK_MERCHANT_ID)) out.push(fail("CLICK_*", "service ID bor, lekin kalit yoki merchant ID yo'q"));
  if (env.VOICE_ALLOW_CROSS_BORDER === "1" || env.AVATAR_ALLOW_CROSS_BORDER === "1")
    out.push(warn("*_ALLOW_CROSS_BORDER", "biometrik ma'lumot chet elga yuboriladi — yurist xulosasi borligiga ishonch hosil qiling"));
  if (prod && !env.METRICS_TOKEN) out.push(warn("METRICS_TOKEN", "yo'q — /metrics yopiq, monitoring ishlamaydi"));
  if (!env.ANTHROPIC_API_KEY) out.push(prod ? fail("ANTHROPIC_API_KEY", "yo'q — klon MockProvider bilan javob beradi") : warn("ANTHROPIC_API_KEY", "yo'q — MockProvider"));
  if (!env.TEI_URL) out.push(prod ? warn("TEI_URL", "yo'q — oflayn HashingEmbedder (qidiruv sifati past)") : skip("TEI_URL", "oflayn embedder"));
  return out;
}

async function getJson(fetchFn: FetchFn, url: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
  const res = await fetchFn(url, { ...init, signal: AbortSignal.timeout(15_000) });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** Haqiqiy servislar bilan: kalit ishlaydi, model va hisob mavjud. */
export async function liveChecks(env: Env, models: string[], fetchFn: FetchFn = fetch): Promise<CheckResult[]> {
  const tasks: Promise<CheckResult>[] = [];
  const run = (name: string, fn: () => Promise<CheckResult>) =>
    tasks.push(fn().catch((err: Error) => fail(name, `ulanib bo'lmadi: ${err.message}`)));

  if (env.ANTHROPIC_API_KEY) {
    for (const model of [...new Set(models)])
      run(`Claude: ${model}`, async () => {
        const r = await getJson(fetchFn, `https://api.anthropic.com/v1/models/${encodeURIComponent(model)}`, {
          headers: { "x-api-key": env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
        });
        if (r.status === 200) return ok(`Claude: ${model}`, "model mavjud");
        if (r.status === 401) return fail(`Claude: ${model}`, "API kalit noto'g'ri");
        return fail(`Claude: ${model}`, r.status === 404 ? "model topilmadi — DEFAULT_POLICY yoki OCR_MODEL'ni yangilang" : `HTTP ${r.status}`);
      });
  } else tasks.push(Promise.resolve(skip("Claude", "ANTHROPIC_API_KEY yo'q")));

  if (env.ELEVENLABS_API_KEY) {
    const h = { headers: { "xi-api-key": env.ELEVENLABS_API_KEY } };
    run("ElevenLabs", async () => {
      const [user, modelsRes] = await Promise.all([getJson(fetchFn, "https://api.elevenlabs.io/v1/user", h), getJson(fetchFn, "https://api.elevenlabs.io/v1/models", h)]);
      if (user.status === 401) return fail("ElevenLabs", "API kalit noto'g'ri");
      if (user.status !== 200) return fail("ElevenLabs", `HTTP ${user.status}`);
      const tts = env.ELEVENLABS_TTS_MODEL ?? "eleven_v3";
      const list = Array.isArray(modelsRes.body) ? (modelsRes.body as { model_id: string }[]).map((m) => m.model_id) : [];
      const sub = (user.body as { subscription?: { tier?: string; character_count?: number; character_limit?: number } }).subscription;
      const quota = sub ? `${sub.tier ?? "?"} tarifi, ${sub.character_count ?? 0}/${sub.character_limit ?? "?"} belgi` : "akkaunt ishlaydi";
      return list.length && !list.includes(tts) ? warn("ElevenLabs", `${quota}; TTS modeli ${tts} ro'yxatda yo'q`) : ok("ElevenLabs", quota);
    });
  } else tasks.push(Promise.resolve(skip("ElevenLabs", "ELEVENLABS_API_KEY yo'q — STT va ovoz kloni o'chiq")));

  if (env.DID_API_KEY) {
    run("D-ID", async () => {
      const r = await getJson(fetchFn, "https://api.d-id.com/credits", { headers: { authorization: `Basic ${env.DID_API_KEY}` } });
      if (r.status === 401) return fail("D-ID", "API kalit noto'g'ri");
      if (r.status !== 200) return fail("D-ID", `HTTP ${r.status}`);
      const remaining = (r.body as { remaining?: number }).remaining;
      return remaining === 0 ? warn("D-ID", "kreditlar tugagan") : ok("D-ID", remaining === undefined ? "akkaunt ishlaydi" : `${remaining} kredit qoldi`);
    });
  } else tasks.push(Promise.resolve(skip("D-ID", "DID_API_KEY yo'q — video-avatar o'chiq")));

  if (env.TEI_URL) {
    run("Embedding (TEI)", async () => {
      const r = await getJson(fetchFn, `${env.TEI_URL!.replace(/\/$/, "")}/embed`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ inputs: ["salom"] }) });
      const dim = Array.isArray(r.body) && Array.isArray((r.body as unknown[])[0]) ? ((r.body as number[][])[0]!.length) : 0;
      if (r.status !== 200) return fail("Embedding (TEI)", `HTTP ${r.status}`);
      return dim === 1024 ? ok("Embedding (TEI)", "1024 o'lcham (BGE-M3)") : fail("Embedding (TEI)", `o'lcham ${dim}, sxema vector(1024) kutadi`);
    });
  }
  if (env.TEI_RERANK_URL) {
    run("Reranker (TEI)", async () => {
      const r = await getJson(fetchFn, `${env.TEI_RERANK_URL!.replace(/\/$/, "")}/rerank`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "narx", texts: ["kurs narxi", "ob-havo"] }) });
      return r.status === 200 && Array.isArray(r.body) ? ok("Reranker (TEI)", "ishlaydi") : fail("Reranker (TEI)", `HTTP ${r.status}`);
    });
  }
  if (env.TELEGRAM_BOT_TOKEN) {
    run("Telegram bot", async () => {
      const r = await getJson(fetchFn, `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`);
      const b = r.body as { ok?: boolean; result?: { username?: string } } | null;
      return b?.ok ? ok("Telegram bot", `@${b.result?.username}`) : fail("Telegram bot", "token noto'g'ri");
    });
  }
  if (env.PUBLIC_BASE_URL) {
    run("Tashqi manzil", async () => {
      const r = await getJson(fetchFn, `${env.PUBLIC_BASE_URL!.replace(/\/$/, "")}/health/ready`);
      return r.status === 200 ? ok("Tashqi manzil", "internetdan /health/ready ochiladi") : fail("Tashqi manzil", `HTTP ${r.status} — webhooklar yetib kelmaydi`);
    });
  }
  return Promise.all(tasks);
}

export function formatChecks(results: CheckResult[]): string {
  const icon: Record<CheckStatus, string> = { ok: "✅", warn: "⚠️ ", fail: "❌", skip: "➖" };
  const width = Math.max(...results.map((r) => r.name.length));
  return results.map((r) => `${icon[r.status]} ${r.name.padEnd(width)}  ${r.detail}`).join("\n");
}
