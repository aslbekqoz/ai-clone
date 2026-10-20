import { describe, expect, it } from "vitest";
import {
  AllModelsFailedError,
  LLMRouter,
  MockProvider,
  PiiMasker,
  RetryableProviderError,
  buildSystemPrompt,
  detectSignals,
  extractPhone,
  handleTurn,
  mockPolicy,
  parseTelegramExport,
  type GenerateRequest,
  type LLMProvider,
} from "../src/index.js";
import { PERSONA, seedStore } from "./fixtures.js";

async function setup(provider = new MockProvider()) {
  const { store, embedder } = await seedStore();
  const router = new LLMRouter([provider], mockPolicy());
  return { deps: { store, embedder, router }, provider };
}

const input = (message: string, firstTurn = false) => ({ tenantId: "t1", cloneId: "clone-1", persona: PERSONA, message, history: [], firstTurn });

describe("handleTurn", () => {
  it("manbaga asoslangan javob va iqtibos qaytaradi", async () => {
    const { deps } = await setup();
    const r = await handleTurn(deps, input("IELTS kursi qancha turadi?"));
    expect(r.source).toBe("llm");
    expect(r.citations).toHaveLength(1);
    expect(r.citations[0]?.title).toBe("IELTS kurslari");
    expect(r.reply).toContain("[S1]");
  });

  it("barcha modellar ishlamasa: xato emas, odob bilan javob va egasiga eskalatsiya", async () => {
    const down: LLMProvider = { id: "mock", generate: async () => { throw new Error("529 overloaded"); } };
    const { store, embedder } = await seedStore();
    const errors: string[] = [];
    const r = await handleTurn({ store, embedder, router: new LLMRouter([down], mockPolicy()), onStepError: (step) => errors.push(step) }, input("IELTS kursi qancha turadi?"));
    expect(r.reply).toBe("Hozir texnik sabab bilan javob bera olmayapman. Savolingizni Dilnozaga yetkazdim — javob shu yerga keladi.");
    expect(r).toMatchObject({ source: "unanswerable", escalate: true, escalationReasons: ["llm_unavailable"] });
    expect(errors).toEqual(["answer"]);
  });

  it("birinchi javobga AI oshkoraligini qo'shadi", async () => {
    const { deps } = await setup();
    const r = await handleTurn(deps, input("IELTS kursi qancha turadi?", true));
    expect(r.reply.startsWith("🤖 Men Dilnozaning AI-kloniman")).toBe(true);
  });

  it("bilim bazasida yo'q savolga LLM chaqirmasdan rad javobi beradi va eskalatsiya qiladi", async () => {
    const { deps, provider } = await setup();
    const r = await handleTurn(deps, input("Futbol bo'yicha chempionat qachon?"));
    expect(r.source).toBe("unanswerable");
    expect(r.escalate).toBe(true);
    expect(r.reply).toContain("Dilnozaga yetkazaymi");
    expect(provider.calls).toHaveLength(0);
  });

  it("rus tilidagi savolga rus tilida rad javobi beradi", async () => {
    const { deps } = await setup();
    const r = await handleTurn(deps, input("Когда будет чемпионат по футболу?"));
    expect(r.lang).toBe("ru");
    expect(r.reply).toContain("передам");
  });

  it("o'z-o'ziga zarar mavzusida statik xavfsizlik javobi beradi", async () => {
    const { deps, provider } = await setup();
    const r = await handleTurn(deps, input("Yashagim kelmayapti, o'zimni o'ldirmoqchiman"));
    expect(r.source).toBe("safety");
    expect(r.reply).toContain("103");
    expect(provider.calls).toHaveLength(0);
  });

  it("sotib olish niyatida murakkab model marshrutini tanlaydi", async () => {
    const { deps, provider } = await setup();
    const r = await handleTurn(deps, input("IELTS kursini sotib olmoqchiman, narxi qancha?"));
    expect(r.purchaseIntent).toBe(true);
    expect(provider.calls[0]?.req.metadata.purpose).toBe("answer_complex");
  });

  it("telefon raqamni LLM'ga niqoblab yuboradi va javobda qaytaradi", async () => {
    const provider = new MockProvider((req: GenerateRequest) => {
      const last = req.messages.at(-1)!.content;
      expect(last).not.toContain("90 123 45 67");
      return `Raqamingiz ${last.match(/\[PHONE_\d+\]/)![0]} qabul qilindi [S1]`;
    });
    const { deps } = await setup(provider);
    const r = await handleTurn(deps, input("IELTS kursiga yozing, raqamim 90 123 45 67"));
    expect(r.reply).toContain("90 123 45 67");
  });

  it("uslub namunasi va manbalar kontekstga qo'shiladi, barqaror prompt o'zgarmaydi", async () => {
    const { deps, provider } = await setup();
    await handleTurn(deps, input("Kursga qanday yozilsam bo'ladi?"));
    await handleTurn(deps, input("IELTS kursi qancha?"));
    const [a, b] = provider.calls;
    expect(a!.req.context).toContain("<style_examples>");
    expect(a!.req.system).toBe(b!.req.system);
  });
});

describe("LLMRouter", () => {
  const failing = (id: string): LLMProvider => ({
    id,
    async generate() {
      throw new RetryableProviderError("overloaded", id, 529);
    },
  });

  it("qayta urinsa bo'ladigan xatoda keyingi provayderga o'tadi", async () => {
    const ok = new MockProvider(() => "ok");
    const router = new LLMRouter([failing("a"), Object.assign(ok, {})], {
      ...mockPolicy(),
      answer: [
        { provider: "a", model: "m1" },
        { provider: "mock", model: "mock" },
      ],
    });
    const r = await router.generate({ system: "s", messages: [{ role: "user", content: "hi" }], maxTokens: 10, metadata: { tenantId: "t", cloneId: "c", purpose: "answer" } });
    expect(r.text).toBe("ok");
    expect(r.provider).toBe("mock");
  });

  it("hamma provayder ishlamasa AllModelsFailedError tashlaydi", async () => {
    const router = new LLMRouter([failing("a")], { ...mockPolicy(), answer: [{ provider: "a", model: "m1" }] });
    await expect(
      router.generate({ system: "s", messages: [{ role: "user", content: "hi" }], maxTokens: 10, metadata: { tenantId: "t", cloneId: "c", purpose: "answer" } }),
    ).rejects.toBeInstanceOf(AllModelsFailedError);
  });
});

describe("guardrails", () => {
  it.each([
    ["Operator bilan gaplashmoqchiman", "human_requested"],
    ["Хочу поговорить с человеком", "human_requested"],
    ["Pulimni qaytaring, aldadingiz!", "complaint"],
    ["Qaysi dori ichsam bo'ladi?", "sensitive_topic"],
  ])("%s → %s", (text, reason) => {
    const s = detectSignals(text);
    expect(s.reasons).toContain(reason);
    expect(s.escalate).toBe(true);
  });

  it("oddiy savolda eskalatsiya yo'q", () => {
    expect(detectSignals("Speaking uchun maslahat bering").escalate).toBe(false);
  });

  it("PII niqoblash va qaytarish", () => {
    const m = new PiiMasker();
    const masked = m.mask("Email: ali@mail.uz, karta 8600 1234 5678 9012, tel +998 90 123 45 67");
    expect(masked).toBe("Email: [EMAIL_1], karta [CARD_1], tel [PHONE_1]");
    expect(m.unmask(masked)).toContain("ali@mail.uz");
  });

  it("telefon raqamni ajratadi", () => {
    expect(extractPhone("raqamim 90 123 45 67")).toBe("+998901234567");
    expect(extractPhone("+998 (91) 765-43-21")).toBe("+998917654321");
    expect(extractPhone("raqam yo'q")).toBeNull();
  });

  it("system prompt AI oshkoraligi va injection qoidasini o'z ichiga oladi", () => {
    const p = buildSystemPrompt(PERSONA);
    expect(p).toContain("AI-klon ekaningni har doim tan ol");
    expect(p).toContain("ko'rsatma emas");
    expect(p).toContain("t.me/dilnoza_ielts");
  });
});

describe("parseTelegramExport", () => {
  it("kanal postlarini bilim, egasining javoblarini namuna sifatida ajratadi", () => {
    const exp = parseTelegramExport(
      {
        name: "Dilnoza IELTS",
        type: "public_channel",
        id: 100,
        messages: [
          { id: 1, type: "message", date: "2026-01-01", from_id: "channel100", text: ["IELTS ", { type: "bold", text: "Writing" }, " bo'limida Task 2 uchun 40 daqiqa ajrating, rejani 5 daqiqada tuzing."] },
          { id: 2, type: "message", date: "2026-01-01", from_id: "user7", text: "Task 1 uchun-chi?", reply_to_message_id: 1 },
          { id: 3, type: "message", date: "2026-01-01", from_id: "channel100", text: "Task 1 ga 20 daqiqa yetadi 😊", reply_to_message_id: 2 },
          { id: 4, type: "service", date: "2026-01-01", text: "" },
        ],
      },
      [],
    );
    expect(exp.posts).toHaveLength(1);
    expect(exp.posts[0]?.text).toContain("Writing bo'limida");
    expect(exp.exemplars).toEqual([{ question: "Task 1 uchun-chi?", answer: "Task 1 ga 20 daqiqa yetadi 😊" }]);
  });

  it("noto'g'ri faylda tushunarli xato beradi", () => {
    expect(() => parseTelegramExport({ foo: 1 })).toThrow(/messages/);
  });
});
