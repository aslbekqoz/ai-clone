import { HashingEmbedder, MemoryKnowledgeStore, normalizeForSearch, type ClonePersona, DEFAULT_STYLE, defaultDisclosure } from "../src/index.js";

export const KNOWLEDGE = [
  { title: "IELTS kurslari", text: "IELTS intensiv kursi 3 oy davom etadi. Kurs narxi oyiga 1 200 000 so'm. Guruhda 8 kishidan ko'p emas." },
  { title: "Dars jadvali", text: "Darslar haftasiga 3 marta: dushanba, chorshanba va juma kunlari soat 19:00 da bo'ladi." },
  { title: "Speaking maslahatlari", text: "Speaking bo'limida eng muhimi — ravonlik. Har kuni 15 daqiqa ovoz chiqarib gapirishni mashq qiling va o'zingizni yozib oling." },
];

export async function seedStore() {
  const embedder = new HashingEmbedder();
  const store = new MemoryKnowledgeStore();
  for (const [i, k] of KNOWLEDGE.entries()) {
    const textNorm = normalizeForSearch(k.text);
    const [embedding] = await embedder.embed([textNorm], "doc");
    store.chunks.push({ chunkId: `c${i + 1}`, documentId: `d${i + 1}`, cloneId: "clone-1", title: k.title, text: k.text, textNorm, locator: {}, embedding: embedding! });
  }
  const [vq] = await embedder.embed([normalizeForSearch("Darslar onlayn bo'ladimi?")], "doc");
  store.verified.push({ cloneId: "clone-1", question: "Darslar onlayn bo'ladimi?", answer: "Ha, barcha darslar Zoom orqali onlayn o'tadi.", embedding: vq! });
  const [ve] = await embedder.embed([normalizeForSearch("Kursga qanday yozilaman?")], "doc");
  store.exemplars.push({ cloneId: "clone-1", question: "Kursga qanday yozilaman?", answer: "Juda oson 😊 Menga raqamingizni qoldiring, admin o'zi bog'lanadi!", embedding: ve! });
  return { store, embedder };
}

export const PERSONA: ClonePersona = {
  name: "Dilnoza",
  bio: "IELTS 8.5, 6 yillik tajribali ustoz.",
  languages: ["uz", "ru"],
  style: { ...DEFAULT_STYLE, signaturePhrases: ["Siz uddalaysiz!"], callToAction: "kursga yozilish: t.me/dilnoza_ielts" },
  grounded: true,
  disclosure: defaultDisclosure("Dilnoza"),
};
