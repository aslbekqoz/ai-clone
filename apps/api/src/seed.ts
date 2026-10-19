// Demo ma'lumotlar: tenant + "Dilnoza (IELTS)" kloni + bilim + uslub namunalari.
//   pnpm seed   →  API kalit va sinov havolasini chiqaradi.
import { createRuntime, migrate } from "@ai-clone/db";

const rt = createRuntime();
await migrate(rt.db);

const slug = process.env.SEED_SLUG ?? "dilnoza-demo";
const existing = await rt.service.resolveSlug(slug);
if (existing) {
  console.log(`"${slug}" allaqachon mavjud. Boshqa nom uchun SEED_SLUG=... bilan ishga tushiring.`);
  await rt.db.end();
  process.exit(0);
}

const { tenantId, apiKey } = await rt.service.createTenant("Demo — Dilnoza IELTS", "pro");
const clone = await rt.service.createClone(tenantId, {
  slug,
  name: "Dilnoza",
  bio: "IELTS 8.5, 6 yillik tajribali ustoz. 3 000+ o'quvchi.",
  languages: ["uz", "ru"],
  style: { tone: "samimiy, motivatsion, aniq", emoji: "rare", length: "short", signaturePhrases: ["Siz uddalaysiz!"], callToAction: "kursga yozilish uchun raqamingizni qoldiring" },
});

const knowledge = [
  {
    title: "IELTS intensiv kursi",
    text: `IELTS intensiv kursi 3 oy davom etadi. Darslar haftasiga 3 marta: dushanba, chorshanba va juma, soat 19:00 da, Zoom orqali onlayn.

Kurs narxi oyiga 1 200 000 so'm. Uch oyni birdan to'lasangiz — 10% chegirma. To'lov Payme yoki Click orqali.

Guruhda 8 kishidan ko'p emas. Har hafta bitta mock test va Writing bo'yicha shaxsiy feedback beriladi.`,
  },
  {
    title: "Speaking bo'yicha maslahatlar",
    text: `Speaking bo'limida eng muhimi — ravonlik (fluency). Har kuni 15 daqiqa ovoz chiqarib gapiring va o'zingizni telefonga yozib oling.

Part 2 da 1 daqiqalik tayyorgarlik vaqtida to'liq gaplar yozmang — faqat 4–5 ta kalit so'z yozing. Javobni "o'tmish — hozir — kelajak" tuzilmasida bering.`,
  },
  {
    title: "Writing Task 2",
    text: `Writing Task 2 uchun 40 daqiqa ajrating: 5 daqiqa reja, 30 daqiqa yozish, 5 daqiqa tekshirish. Kamida 250 so'z yozing.

Har bir paragraf bitta asosiy fikrga ega bo'lsin: fikr — tushuntirish — misol. Kirish qismida savolni o'z so'zlaringiz bilan qayta yozing va pozitsiyangizni aniq ayting.`,
  },
];
for (const k of knowledge) await rt.service.addSource(tenantId, clone.id, { type: "text", ...k });
await rt.service.addExemplar(tenantId, clone.id, "Men 5.5 olganman, 7 olsa bo'ladimi?", "Albatta bo'ladi! 😊 3 oyda 1–1.5 ball oshirish — real natija, faqat har kuni mashq qilish kerak. Siz uddalaysiz!", "manual");
await rt.service.addExemplar(tenantId, clone.id, "Kurs qachon boshlanadi?", "Yangi guruh har oyning 1-sanasida boshlanadi. Joy cheklangan — 8 kishi, shuning uchun oldinroq yoziling 🙌", "manual");

const port = process.env.PORT ?? 8787;
console.log(`
✅ Demo tayyor (LLM: ${rt.llm})
   Tenant API kaliti:  ${apiKey}
   Klon ID:            ${clone.id}
   Ommaviy sahifa:     http://localhost:${port}/c/${slug}
   Vidjet:             <script src="http://localhost:${port}/widget.js" data-clone="${slug}" async></script>

   curl -s localhost:${port}/v1/clones/${clone.id}/chat -H "authorization: Bearer ${apiKey}" \\
     -H 'content-type: application/json' -d '{"externalId":"test","message":"Kurs narxi qancha?"}'
`);
await rt.db.end();
