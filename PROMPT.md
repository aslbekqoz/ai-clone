# Vazifa: AQSh iqtisodiyoti bo‘yicha animatsion taqdimot

Sen tajribali taqdimot dizayneri, front-end dasturchi va iqtisodchisan. Universitet himoyasi uchun brauzerda ochiladigan, animatsiyali va hikoyaga asoslangan taqdimot yaratasan.

Taqdimot raqamlar ro‘yxati bo‘lmasin. Har bir slayd bitta fikrni aytsin, uni tushuntirsin va raqam bilan isbotlasin.

## 1. Kontekst

- **Fan topshirig‘i:** "AQSh iqtisodiyotining asosiy tarmoqlari rivojlanishini 2000–2025-yillar bo‘yicha tahlil qilish". Tarmoqlar: sanoat, xizmat ko‘rsatish, qishloq xo‘jaligi, qurilish.
- **Himoya:** 5 talaba gapiradi, jami ~15 daqiqa. Taqdimot proyektorda, sinfda ko‘rsatiladi.
- **Til:** o‘zbek (lotin). Tutuq belgisi uchun faqat ‘ (U+2018) ishlatiladi: o‘, g‘, ma’lumot.
- **Topshiriq talab qilgan savollar.** Taqdimot ularning har biriga aniq javob berishi shart:
  1. Qaysi tarmoq eng tez rivojlangan va buni qaysi raqamlar tasdiqlaydi?
  2. Qaysi tarmoqning YaIMdagi ulushi oshgan yoki kamaygan?
  3. Ishlab chiqarish hajmi oshgan davrlarda bandlik ham oshganmi?
  4. Pandemiya va energiya narxlaridagi o‘zgarishlar tarmoqlarga qanday ta’sir ko‘rsatgan?
  5. Transport, energetika, aloqa va boshqa infratuzilma tarmoqlarga qanday yordam bergan?
- **Topshiriq talab qilgan qo‘shimchalar:** har bir tarmoq uchun jadval va kamida 2 ta grafik; infratuzilmaga oid kamida 2 ta haqiqiy misol; O‘zbekiston uchun 3 ta amaliy taklif.

## 2. Ma’lumotlar — qat’iy qoida

`./data/` papkasida tekshirilgan ma’lumotlar bor:
- `data.json` — 2000–2025 yillar uchun barcha qatorlar va birliklar izohi (`_izoh`).
- `faktlar_va_manbalar.md` — tekshirilgan faktlar va to‘liq manbalar ro‘yxati.
- `ssenariy.json` — har bir slayd uchun ma’ruzachi matni (qoralama).
- `AQSh_tarmoqlar_2000-2025.xlsx` — hisob-kitoblar.

Ma’lumot bilan ishlash qoidalari:
- Taqdimotdagi har bir raqam faqat shu fayllardan olinadi. Yangi statistika o‘ylab topma, internetdan qo‘shma, yaxlitlashni o‘zgartirma.
- Grafiklar `data.json` dan JavaScript orqali chiziladi, qo‘lda kiritilmaydi.
- O‘nlik kasr vergul bilan yoziladi (12,4%). Minglik guruhlar bo‘sh joy bilan ajratiladi (1 840). Minus belgisi uchun − ishlatiladi.
- Bitta slaydda ko‘pi bilan 3 ta "katta raqam" bo‘ladi. Qolgan raqamlar grafik ichida yoki jadvalda.

## 3. Manbalar — qanday ko‘rsatiladi

- Slaydlarda uzun havolalar **bo‘lmaydi**.
- Har bir grafik yoki jadval ostida faqat bitta qisqa kulrang qator turadi, masalan: `Manba: BEA [1]` yoki `Manba: BLS [7]`. Topshiriq har bir grafik ostida tashkilot nomini talab qiladi, shuning uchun bu qator albatta qoladi, lekin 30 belgidan oshmaydi.
- To‘liq havolalar faqat oxirgi "Manbalar" slaydida beriladi: `faktlar_va_manbalar.md`, C bo‘limi, raqamlangan holda.

## 4. Hikoya — nimani gapiramiz

Butun taqdimotning markaziy savoli:

> "25 yilda Amerika boyligini qaysi tarmoq yaratdi, odamlar qayerda ishlay boshladi va bunda yo‘l, energiya, internet qanday rol o‘ynadi?"

Hikoya uch qismdan iborat:
1. Katta manzara.
2. To‘rt tarmoq: har biri — **nima bu → nima bo‘ldi → nega → bu nimani anglatadi**.
3. Taqqoslash, saboqlar va O‘zbekiston uchun takliflar.

Har bir kontent-slayd quyidagi tarkibda bo‘ladi:
- **Sarlavha — xulosa gap.** Mavzu nomi emas, fikr bo‘lsin. Yomon: "Sanoat". Yaxshi: "Sanoat ikki barobar o‘sdi, lekin 4,6 mln ish o‘rni yo‘qoldi".
- **Bitta asosiy vizual:** grafik, sxema yoki animatsiyali raqam.
- **"Nega?" bloki:** 2–3 qisqa gap bilan sabab tushuntiriladi.
- **"Bu nimani anglatadi?":** bitta gap. Masalan: "Ishlab chiqarish o‘sishi har doim ham yangi ish o‘rni degani emas".
- Ma’ruzachi ismi — kichik qilib burchakda.

### Slaydlar rejasi (16 ta)

**1. Muqova — Shahzod**
- Sarlavha: "AQSh iqtisodiyotining asosiy tarmoqlari: 2000–2025".
- Markaziy savol katta harflarda beriladi.
- YaIM 10,3 → 30,9 trln $ animatsiyali hisoblagich bilan.
- Guruh a’zolari ismlari.

**2. Nima uchun bu muhim va qanday o‘rgandik — Shahzod**
- Iqtisodiyotni to‘rt tarmoqqa bo‘lish nima uchun kerakligi, oddiy tilda.
- To‘rt tarmoqning ta’rifi bittadan gapda.
- Metodika 3 qadamda: ma’lumot (BEA) → real o‘sish (inflyatsiyasiz) → taqqoslash.
- Tushunchalarni oddiy izohla: nominal va real, ulush, CAGR. Masalan: "real o‘sish — narxlar o‘sishini olib tashlagandagi haqiqiy hajm".

**3. Katta manzara — Shahzod**
- Tarmoqlar tuzilmasi 2000 va 2025: animatsiyada ulushlar "oqib" o‘zgaradi.
- Xulosa: AQSh xizmatlar iqtisodiyotiga aylandi (76,6% → 82,4%).
- "Nega?" — strukturaviy o‘zgarish:
  - Daromad oshgani sari odamlar pulni ko‘proq sog‘liq, ta’lim, moliya, dam olish va raqamli xizmatlarga sarflaydi.
  - Sanoatda texnologiya kamroq odam bilan ko‘proq mahsulot beradi.
  - Bu iqtisodiyot nazariyasidagi umumiy qonuniyat, AQSh uning yorqin misoli.

**4. Sanoat: o‘sish — Muhammadali**
- Ta’rif: kon qazish, energiya, zavodlar.
- Grafik: QQ ustunlari. 2009 va 2020 pasayishlari belgilanadi.
- Jadval: 2000, 2005 … 2025.
- Xulosa: ikki barobar o‘sish, lekin ulush 17,9% → 12,4%.

**5. Sanoat paradoksi — Muhammadali**
- Grafik: real hajm (+60%) va bandlik (−25%) chiziqlari orasidagi "qaychi" animatsiyada ochiladi.
- "Nega?": Xitoy importi raqobati (kamida 1/4 qismi), avtomatlashtirish, kompyuter va elektronikaning ulkan o‘sishi (×5,3).
- Muhim ogohlantirish: kompyutersiz ishlab chiqarish faqat +23% o‘sgan.
- Energiya infratuzilmasi: slanets inqilobi — neft qazib olish rekordi, arzon gaz zavodlarni jalb qildi.
- Bu nimani anglatadi: "Sanoat o‘sishi har doim ham yangi ish o‘rni yaratmaydi".

**6. Xizmatlar: o‘sish — Zafarbek**
- Ta’rif: nimalar kiradi (savdo, moliya, sog‘liq, ta’lim, IT, davlat).
- Grafik: YaIMdagi va bandlikdagi ulush chiziqlari.
- Jadval.
- Xulosa: eng tez o‘sgan tarmoq (real CAGR 2,32%).

**7. Xizmatlar va raqamli infratuzilma — Zafarbek**
- Grafik: bandlik ustunlari. 2020-yil qizil bilan ajratiladi.
- "Nega?": keng polosali internet (1% → 78%) elektron savdo (0,7% → 16,4%), axborot sohasi (471 → 1 766 mlrd $) va yetkazib berish (transport ×3,3) uchun asos bo‘ldi.
- Pandemiya: bir oyda 20,5 mln ish o‘rni yo‘qoldi. Tiklanish ham tez bo‘ldi (2021: +6,7%).
- Bu nimani anglatadi: "Xizmatlar eng ko‘p ish o‘rni beradi, lekin inqirozga eng sezgir".

**8. Qishloq xo‘jaligi: kichik, lekin hal qiluvchi — Visola**
- Grafik: nominal va real indeks.
- Jadval.
- "Nega ulushi kichik?": unumdorlik juda yuqori — oz odam butun mamlakatni boqadi va eksport qiladi. Talab daromad bilan birga tez o‘smaydi.
- Bandlik bo‘yicha izoh: FTE 1,2 mln ga o‘zini o‘zi band qilgan fermerlar kirmaydi. Jahon banki bahosi 2,4% → 1,5%.

**9. Qishloq xo‘jaligi: ob-havo, narx, siyosat — Visola**
- Grafik: yillik real o‘sish ustunlari, musbat yashil, manfiy qizil. Eng beqaror tarmoq.
- "Nega?": qo‘shilgan qiymat = mahsulot − xarajatlar, shuning uchun kichik o‘zgarish katta sakrash beradi. Misollar: 2012 qurg‘oqchilik, 2019 toshqin, savdo urushi (23 mlrd $ kompensatsiya).
- Infratuzilma: sug‘orish (17% yer → 50%+ qiymat), Missisipi barjalari (don eksportining ~60%).

**10. Qurilish: pul ko‘paydi, hajm emas — Aslbek**
- Grafik: nominal va real indeks, ular orasidagi maydon "narx o‘sishi" deb belgilanadi.
- Jadval.
- "Nega?": qurilish narxlari ~3,1 barobar oshgan, unumdorlik pasaygan (Goolsbee va Syverson).
- Bu nimani anglatadi: "Pul hisobidagi o‘sish har doim ham real o‘sish emas".

**11. Qurilish: uch to‘lqin — Aslbek**
- Grafik: bandlik ustunlari.
- Uch voqea vaqt chizig‘ida:
  - 2006–09 uy-joy pufagi (−1,9 mln ish o‘rni);
  - 2022 foiz shoki (Fed 5,25–5,50%, ipoteka 7,79%);
  - 2023–24 zavodlar bumi (CHIPS, 233,2 mlrd $).
- Bu nimani anglatadi: "Qurilish — foiz stavkalari va davlat siyosatining barometri".

**12. Taqqoslash — 5 savolga javob — Visola**
- To‘rt tarmoq jadvali: CAGR, ulush o‘zgarishi, bandlik o‘zgarishi, unumdorlik, "real o‘sish yillarida bandlik ham o‘sgan" (10/19, 22/23, 6/14, 12/13).
- 1–3-savollarga aniq javoblar katta va aniq yoziladi.

**13. Inqirozlar: 2009, 2020, 2022 — Shahzod**
- Guruhlangan ustunlar grafigi.
- Har bir inqiroz uchun "nima bo‘ldi → qaysi tarmoq ko‘p zarar ko‘rdi → nega". Bu 4-savolga javob.

**14. Infratuzilma: uchta haqiqiy misol — Zafarbek**
- Energiya → sanoat: gaz narxi 2,21 $ va Osiyo/Yevropada 10–11 $.
- IIJA qonuni → qurilish: 1,2 trln $ va uning taqsimoti.
- Avtomagistral → logistika: yo‘llarning 1% i harakatning 26% ini tashiydi.
- Har biri sabab → natija sxemasi ko‘rinishida. Bu 5-savolga javob.

**15. Xulosa va O‘zbekiston uchun 3 taklif — Aslbek**
- To‘rt tarmoq bo‘yicha 4 qisqa xulosa.
- 3 ta taklif. Har birida: O‘zbekistondagi muammo (raqam bilan) → AQSh tajribasi → foyda.
  1. Sug‘orish kanallarini modernizatsiya qilish.
  2. Elektr tarmog‘ini yangilash.
  3. Logistika koridorlari va omborlar, DXSh limiti bilan.

**16. Manbalar**
- Raqamlangan to‘liq ro‘yxat.
- "Rahmat, savollaringizga tayyormiz" yozuvi.

Ma’ruzachi matni:
- `ssenariy.json` dagi matnni har bir slaydga moslab qayta yoz: jonli, tushuntiruvchi, raqamlarni o‘qib bermaydigan.
- Har bir ma’ruzachi uchun 2–3 daqiqa.
- Matn taqdimot ichidagi "ssenariy" panelida ko‘rinadi.

## 5. Dizayn

- Proyektor uchun: **och fon**, yuqori kontrast, matn kamida 24px (1920×1080 sahnada).
- Har bir tarmoqning bitta doimiy rangi bor, butun taqdimotda o‘zgarmaydi. Ranglar yorqinligi bilan ham farq qilsin, chunki proyektor ranglarni so‘ndiradi.
- Shablon ko‘rinishidan qoch: bir xil kartochkalar, har sarlavha ustida KATTA HARFLI yorliq, gradient bezaklar bo‘lmasin. Mavzuga xos bitta kuchli vizual g‘oya tanla (masalan, AQSh avtomagistral belgilari, xarita yoki statistika byurosining hisobot uslubi) va uni izchil ishlat.
- Shriftlar: 2 ta. Ular o‘zbekcha ‘ belgisini to‘g‘ri ko‘rsatsin.
- Har bir slaydda bitta fikr. Bo‘sh joydan qo‘rqma.
- Agar `frontend-design` yoki shunga o‘xshash dizayn skill’i bo‘lsa, ishni boshlashdan oldin uni o‘qi.

## 6. Animatsiya

GSAP kutubxonasidan foydalan.
- **Slayd almashinuvi:** bir xil, yumshoq, 0,5 soniyadan oshmaydi.
- **Kirish ketma-ketligi:** avval sarlavha, keyin vizual, keyin "Nega?" bloki.
- **Grafiklar o‘zi chiziladi:**
  - chiziqlar — stroke animatsiyasi;
  - ustunlar — pastdan o‘sadi;
  - ulushlar — kengligi o‘zgaradi.
- Katta raqamlar noldan sanab ko‘tariladi.
- Har bir tarmoq slaydida bitta "voy" moment bo‘lsin:
  - sanoat — "qaychi" ochiladi;
  - qurilish — narx maydoni to‘ladi;
  - xizmatlar — 2020-yil ustuni qulaydi.
- Animatsiyalar bosish (click) bilan qadam-baqadam ochilishi ham mumkin. Ma’ruzachi gapirib turib keyingi elementni ochadi.
- `prefers-reduced-motion` hurmat qilinsin.
- Video (ixtiyoriy): agar `./assets/video/` papkasida mp4 fayllar bo‘lsa, bo‘lim boshlanadigan slaydlarda xira fon sifatida ishlat. Bo‘lmasa, videosiz ishlasin.

## 7. Texnik talablar

- Natija: `./taqdimot/` papkasida `index.html` + `css/` + `js/` + `assets/`. **Internetsiz ishlashi shart:**
  - GSAP'ni npm orqali o‘rnatib, faylini lokal nusxala;
  - shriftlarni (woff2) ham lokal saqla.
- Sahna 1920×1080, oyna o‘lchamiga proporsional moslashadi.
- Boshqaruv:
  - ← → tugmalari, sichqoncha bosishi, telefonda surish;
  - `S` — ssenariy paneli, `F` — to‘liq ekran;
  - `Home`/`End` — birinchi va oxirgi slayd;
  - pastda progress chizig‘i.
- Excel ma’lumotlari bo‘yicha ilova slayd ham bo‘lishi mumkin: to‘liq yillik jadval, ko‘rsatkichni tanlash tugmalari bilan.
- Zaxira sifatida Playwright bilan har bir slaydning yakuniy holatini `taqdimot.pdf` qilib eksport qil (1920×1080, har sahifada bitta slayd).

## 8. Ish tartibi

1. `./data/` dagi barcha fayllarni o‘qi. Slaydlar rejasini va har bir slaydda ishlatiladigan raqamlarni ro‘yxat qilib menga ko‘rsat, tasdiqlashimni kut.
2. Dizayn yo‘nalishini 3–4 qatorda taklif qil: ranglar, shriftlar, asosiy vizual g‘oya.
3. Qur.
4. Har bir slaydni Playwright bilan 1920×1080 da skrinshot qilib ko‘r. Matn ustma-ust tushishi, kesilish va o‘qilishini tekshirib, tuzat.
5. Barcha raqamlarni `data.json` va `faktlar_va_manbalar.md` bilan avtomatik solishtiruvchi kichik skript yoz va ishga tushir.
6. Yakunda menga ayt:
   - taqdimotni qanday ochish kerak;
   - qaysi tugmalar nima qiladi;
   - PDF qayerda.
