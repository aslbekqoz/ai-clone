import { describe, expect, it } from "vitest";
import { configChecks, formatChecks, liveChecks } from "../src/preflight.js";

const byName = (rs: { name: string; status: string }[]) => Object.fromEntries(rs.map((r) => [r.name, r.status]));

describe("configChecks", () => {
  it("prod'da xavfli sozlamalarni rad etadi", () => {
    const r = byName(configChecks({ NODE_ENV: "production", ADMIN_TOKEN: "change-me", PUBLIC_BASE_URL: "http://x.uz", CHANNEL_SECRET_KEY: "qisqa", PAYMENT_LINK_SECRET: "abc", META_APP_SECRET: "s", PAYME_MERCHANT_ID: "m", PAYME_TEST: "1", PAYME_KEY: "k" }));
    expect(r).toMatchObject({ ADMIN_TOKEN: "fail", PUBLIC_BASE_URL: "fail", CHANNEL_SECRET_KEY: "fail", PAYMENT_LINK_SECRET: "fail", META_VERIFY_TOKEN: "fail", PAYME_TEST: "warn", PAYME_IKPU_CODE: "warn", ANTHROPIC_API_KEY: "fail", METRICS_TOKEN: "warn" });
  });

  it("to'g'ri prod sozlamasida xato yo'q", () => {
    const r = configChecks({
      NODE_ENV: "production",
      ADMIN_TOKEN: "a".repeat(48),
      PUBLIC_BASE_URL: "https://api.aiclone.uz",
      CHANNEL_SECRET_KEY: Buffer.alloc(32, 7).toString("base64"),
      PAYMENT_LINK_SECRET: "s".repeat(44),
      ANTHROPIC_API_KEY: "sk-ant-x",
      TEI_URL: "http://tei",
      METRICS_TOKEN: "m",
    });
    expect(r.filter((x) => x.status === "fail" || x.status === "warn")).toEqual([]);
  });
});

describe("liveChecks", () => {
  it("har bir xizmat javobini tushunarli natijaga aylantiradi", async () => {
    const fake = (async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/v1/models/claude-haiku-5-5")) return Response.json({ id: "claude-haiku-5-5" });
      if (u.includes("/v1/models/claude-eski")) return Response.json({ error: {} }, { status: 404 });
      if (u.endsWith("/v1/user")) return Response.json({ subscription: { tier: "creator", character_count: 10, character_limit: 100 } });
      if (u.endsWith("/v1/models")) return Response.json([{ model_id: "eleven_v3" }]);
      if (u.endsWith("/credits")) return Response.json({}, { status: 401 });
      if (u.endsWith("/embed")) return Response.json([[0.1, 0.2]]);
      if (u.includes("/getMe")) return Response.json({ ok: true, result: { username: "dilnoza_bot" } });
      if (u.endsWith("/health/ready")) throw new TypeError("fetch failed");
      return Response.json({}, { status: 500 });
    }) as unknown as typeof fetch;
    const r = await liveChecks(
      { ANTHROPIC_API_KEY: "k", ELEVENLABS_API_KEY: "e", DID_API_KEY: "d", TEI_URL: "http://tei/", TELEGRAM_BOT_TOKEN: "1:x", PUBLIC_BASE_URL: "https://api.aiclone.uz" },
      ["claude-haiku-5-5", "claude-haiku-5-5", "claude-eski"],
      fake,
    );
    expect(byName(r)).toEqual({
      "Claude: claude-haiku-5-5": "ok",
      "Claude: claude-eski": "fail",
      ElevenLabs: "ok",
      "D-ID": "fail",
      "Embedding (TEI)": "fail",
      "Telegram bot": "ok",
      "Tashqi manzil": "fail",
    });
    const text = formatChecks(r);
    expect(text).toContain("model topilmadi");
    expect(text).toContain("o'lcham 2, sxema vector(1024) kutadi");
    expect(text).toContain("@dilnoza_bot");
  });
});
