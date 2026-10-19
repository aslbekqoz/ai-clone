import { describe, expect, it } from "vitest";
import { HashingEmbedder, MemoryKnowledgeStore, cosine, normalizeForSearch, reciprocalRankFusion, resolveCitations, retrieve, type SearchHit } from "../src/index.js";
import { seedStore } from "./fixtures.js";

const hit = (id: string): SearchHit => ({ chunkId: id, documentId: "d", title: id, text: id, locator: {}, score: 0 });

describe("reciprocalRankFusion", () => {
  it("ikkala ro'yxatda yuqori bo'lgan natija birinchi chiqadi", () => {
    const fused = reciprocalRankFusion([
      [hit("a"), hit("b"), hit("c")],
      [hit("b"), hit("d")],
    ]);
    expect(fused[0]?.chunkId).toBe("b");
    expect(fused.map((h) => h.chunkId).sort()).toEqual(["a", "b", "c", "d"]);
  });
});

describe("HashingEmbedder", () => {
  it("o'xshash matnlar o'xshash emas matnlardan yaqinroq", async () => {
    const e = new HashingEmbedder();
    const [q, related, unrelated] = await e.embed(["IELTS kursi narxi qancha", "IELTS kursining narxi 1 200 000 so'm", "Ertaga havo issiq bo'ladi"], "doc");
    expect(cosine(q!, related!)).toBeGreaterThan(cosine(q!, unrelated!) + 0.1);
  });

  it("lotin va kirill yozuvdagi savol bir xil vektorga yaqin", async () => {
    const e = new HashingEmbedder();
    const [lat, cyr] = await e.embed([normalizeForSearch("Kurs narxi qancha?"), normalizeForSearch("Курс нархи қанча?", "uz-cyrl")], "query");
    expect(cosine(lat!, cyr!)).toBeCloseTo(1, 5);
  });
});

describe("retrieve", () => {
  it("gibrid qidiruv tegishli chunkni topadi", async () => {
    const { store, embedder } = await seedStore();
    const r = await retrieve(store, embedder, "clone-1", "IELTS kursi qancha turadi?", embedder.thresholds);
    expect(r.answerable).toBe(true);
    expect(r.hits[0]?.text).toContain("1 200 000");
  });

  it("boshqa klonning ma'lumotini qaytarmaydi", async () => {
    const { store, embedder } = await seedStore();
    const r = await retrieve(store, embedder, "clone-2", "IELTS kursi qancha turadi?", embedder.thresholds);
    expect(r.hits).toHaveLength(0);
    expect(r.answerable).toBe(false);
  });

  it("bilim bazasida yo'q mavzu javobsiz deb belgilanadi", async () => {
    const { store, embedder } = await seedStore();
    const r = await retrieve(store, embedder, "clone-1", "Futbol bo'yicha chempionat qachon?", embedder.thresholds);
    expect(r.answerable).toBe(false);
  });

  it("tasdiqlangan javobni topadi", async () => {
    const { store, embedder } = await seedStore();
    const r = await retrieve(store, embedder, "clone-1", "Darslar onlaynmi?", embedder.thresholds);
    expect(r.verified?.answer).toContain("Zoom");
  });
});

describe("resolveCitations", () => {
  it("mavjud ID'larni saqlaydi, noto'g'rilarini olib tashlaydi", () => {
    const sources = [hit("c1"), hit("c2")];
    const out = resolveCitations("Narxi 1 200 000 so'm [S1]. Chegirma bor [S9]. Ikkalasi [S1, S2].", sources);
    expect(out.text).toBe("Narxi 1 200 000 so'm [S1]. Chegirma bor. Ikkalasi [S1, S2].");
    expect(out.citations.map((c) => c.id)).toEqual(["S1", "S2"]);
    expect(out.invalid).toEqual(["S9"]);
  });
});

describe("MemoryKnowledgeStore", () => {
  it("bo'sh so'rovda kalit so'z qidiruvi bo'sh qaytadi", async () => {
    expect(await new MemoryKnowledgeStore().keywordSearch("x", "", 5)).toEqual([]);
  });
});

describe("stripCitationMarkers", () => {
  it("iqtibos belgilarini olib tashlaydi", async () => {
    const { stripCitationMarkers } = await import("../src/index.js");
    expect(stripCitationMarkers("Narxi 1 200 000 so'm [S1]. Zoom orqali [S1, S2].")).toBe("Narxi 1 200 000 so'm. Zoom orqali.");
  });
});
