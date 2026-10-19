import { describe, expect, it } from "vitest";
import { LLMRouter, MockProvider, TeiReranker, detectSignals, handleTurn, mockPolicy, needsRewrite, type GenerateRequest, type Reranker } from "../src/index.js";
import { PERSONA, seedStore } from "./fixtures.js";

/** Maqsad (purpose) bo'yicha javob beradigan soxta model. */
function scripted(replies: Partial<Record<string, (req: GenerateRequest) => string>>) {
  return new MockProvider((req) => {
    const fn = replies[req.metadata.purpose];
    if (fn) return fn(req);
    const src = req.context?.match(/<source id="(S\d+)"[^>]*>\n([^\n.]+)/);
    return src ? `${src[2]}. [${src[1]}]` : "Ma'lumot yo'q.";
  });
}

async function setup(provider: MockProvider, smart = { classifier: true, rewrite: true }, reranker?: Reranker) {
  const { store, embedder } = await seedStore();
  const errors: string[] = [];
  const deps = { store, embedder, router: new LLMRouter([provider], mockPolicy()), smart, onStepError: (step: string) => errors.push(step), ...(reranker ? { reranker } : {}) };
  return { deps, errors };
}

const input = (message: string, history: { role: "user" | "assistant"; content: string }[] = []) => ({ tenantId: "t", cloneId: "clone-1", persona: PERSONA, message, history, firstTurn: false });
const cls = (intent: string, extra: Record<string, unknown> = {}) => () => JSON.stringify({ intent, escalate: false, reasons: [], memory_fact: "", ...extra });

describe("LLM klassifikator", () => {
  it("qoidalar o'tkazib yuborgan bilvosita inson so'rovini ushlaydi", async () => {
    const msg = "Bot emas, o'zingiz javob bering, IELTS kursi haqida";
    expect(detectSignals(msg).escalate).toBe(false);
    const { deps } = await setup(scripted({ classify: cls("human_request", { escalate: true, reasons: ["human_requested"] }) }));
    const r = await handleTurn(deps, input(msg));
    expect(r.escalate).toBe(true);
    expect(r.escalationReasons).toContain("human_requested");
    expect(r.classification?.intent).toBe("human_request");
  });

  it("xarid niyatida o'rta modelga yo'naltiradi va xotira faktini qaytaradi", async () => {
    const provider = scripted({ classify: cls("purchase", { memory_fact: "Ismi Ali, IELTS 7 maqsadi" }) });
    const { deps } = await setup(provider);
    const r = await handleTurn(deps, input("Men Aliman, 7 olmoqchiman, IELTS kursiga qanday to'layman?"));
    expect(r.purchaseIntent).toBe(true);
    expect(r.classification?.memoryFact).toBe("Ismi Ali, IELTS 7 maqsadi");
    expect(provider.calls.find((c) => c.req.metadata.purpose.startsWith("answer"))?.req.metadata.purpose).toBe("answer_complex");
  });

  it("klassifikator noto'g'ri javob bersa, qoidalarga qaytadi va suhbat davom etadi", async () => {
    const { deps, errors } = await setup(scripted({ classify: () => "bu JSON emas" }));
    const r = await handleTurn(deps, input("IELTS kursi qancha turadi?"));
    expect(r.source).toBe("llm");
    expect(r.classification).toBeUndefined();
    expect(errors).toEqual(["classify"]);
  });

  it("o'z-o'ziga zarar holatida hech qanday LLM chaqirilmaydi", async () => {
    const provider = scripted({});
    const { deps } = await setup(provider);
    const r = await handleTurn(deps, input("Yashagim kelmayapti"));
    expect(r.source).toBe("safety");
    expect(provider.calls).toHaveLength(0);
  });
});

describe("so'rovni qayta yozish", () => {
  it.each([
    ["uning narxi qancha?", true],
    ["Сколько это стоит?", true],
    ["IELTS Writing Task 2 uchun eng yaxshi tuzilma va misollar bilan batafsil reja kerak", false],
  ])("needsRewrite(%s) = %s", (msg, expected) => {
    expect(needsRewrite(msg, [{ role: "user", content: "IELTS kursi bormi?" }])).toBe(expected);
  });

  it("tarixsiz qayta yozilmaydi", () => expect(needsRewrite("uning narxi?", [])).toBe(false));

  it("olmoshli savolni tarix bo'yicha mustaqil so'rovga aylantirib qidiradi", async () => {
    const provider = scripted({ classify: cls("question"), rewrite: () => JSON.stringify({ query: "Darslar jadvali qaysi kunlari" }) });
    const { deps } = await setup(provider);
    const history = [
      { role: "user" as const, content: "Darslar haqida aytib bering" },
      { role: "assistant" as const, content: "Darslar onlayn, kichik guruhlarda." },
    ];
    const r = await handleTurn(deps, input("ular qachon?", history));
    expect(r.searchQuery).toBe("Darslar jadvali qaysi kunlari");
    expect(r.citations[0]?.title).toBe("Dars jadvali");
    // Javob modeli asl xabarni ko'radi, qidiruv esa qayta yozilgan so'rovni
    const answer = provider.calls.find((c) => c.req.metadata.purpose === "answer")!;
    expect(answer.req.messages.at(-1)?.content).toBe("ular qachon?");
  });
});

describe("reranker", () => {
  it("reranker tartibini qo'llaydi", async () => {
    const reranker: Reranker = { rerank: async (_q, docs) => docs.map((_, index) => ({ index, score: index === docs.length - 1 ? 0.9 : 0.2 })).sort((a, b) => b.score - a.score) };
    const { deps } = await setup(scripted({}), {}, reranker);
    const r = await handleTurn(deps, input("IELTS kursi narxi va speaking maslahat"));
    expect(r.source).toBe("llm");
    expect(r.confidence).toBeGreaterThan(0);
  });

  it("reranker hamma manbani ishonchsiz desa, javobsiz deb belgilanadi", async () => {
    const provider = scripted({});
    const lowScores: Reranker = { rerank: async (_q, docs) => docs.map((_, index) => ({ index, score: 0.01 })) };
    const { deps } = await setup(provider, {}, lowScores);
    const r = await handleTurn(deps, input("IELTS kursi qancha turadi?"));
    expect(r.source).toBe("unanswerable");
    expect(provider.calls).toHaveLength(0);
  });

  it("reranker ishlamasa RRF tartibi bilan davom etadi", async () => {
    const broken: Reranker = { rerank: async () => { throw new Error("down"); } };
    const { deps, errors } = await setup(scripted({}), {}, broken);
    const r = await handleTurn(deps, input("IELTS kursi qancha turadi?"));
    expect(r.citations[0]?.title).toBe("IELTS kurslari");
    expect(errors).toEqual(["rerank"]);
  });

  it("TeiReranker: /rerank javobini tartiblaydi va noto'g'ri indekslarni tashlaydi", async () => {
    let body: unknown;
    const fakeFetch = (async (_: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify([{ index: 1, score: 0.3 }, { index: 0, score: 0.8 }, { index: 7, score: 0.99 }]));
    }) as unknown as typeof fetch;
    const out = await new TeiReranker("http://tei:8080/", fakeFetch).rerank("savol", ["a", "b"], 5);
    expect(out).toEqual([{ index: 0, score: 0.8 }, { index: 1, score: 0.3 }]);
    expect(body).toMatchObject({ query: "savol", texts: ["a", "b"] });
  });
});
