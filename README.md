# AI Clone

**Bilimingiz uxlamaydi.** Ekspert, bloger va tadbirkorlar uchun Telegram-first shaxsiy AI egizak. U egasining bilimi, uslubi va (ixtiyoriy) ovozi bilan 24/7 javob beradi, sotadi va mijoz yig'adi. O'zbek, rus va ingliz tillarida ishlaydi.

## Qisqacha

| | |
|---|---|
| **Muammo** | Ekspertlar kuniga yuzlab takroriy savol oladi. Javob berilmagan har bir savol yo'qolgan mijoz. Mavjud chatbotlarda shaxsiyat yo'q, global AI-klonlar esa o'zbek tilini, Telegramni va mahalliy to'lovlarni bilmaydi. |
| **Yechim** | 15 daqiqada AI-klon yaratiladi: bilim yuklanadi, uslub sozlanadi, Telegram, sayt, Instagram yoki WhatsApp ulanadi. Egasi nazorat qiladi va klon orqali pul ishlaydi. |
| **Bozor** | O'zbekistonda 123 000+ Telegram kanal bor (shundan 16 500 blog, 11 800 savdo kanali). Keyingi bosqich MDH va turkiy davlatlar. Global AI-avatar bozori 2030-yilga borib $117 mlrd bo'lishi kutiladi. |
| **Raqobat** | Eng yaqin raqobatchi Delphi.ai (Sequoia, $79/oy, ingliz tilida). Mahalliy bozorda moliyalashtirilgan raqobatchi topilmadi. |
| **Biznes model** | Freemium SaaS ($15 / $39 / $119), klon monetizatsiyasidan 12% komissiya, korporativ white-label |
| **Moliya (asosiy ssenariy)** | 3-yil oxirida $1.77 mln ARR, 3 389 pullik mijoz, ~77% yalpi marja. 15-oyda foydaga chiqiladi. |
| **So'rov** | $150k pre-seed, 18 oylik runway |

## Hujjatlar

| # | Hujjat | Mazmuni |
|---|---|---|
| 01 | [Vizyon, muammo, yechim](docs/01-vizyon-muammo-yechim.md) | Vizyon, ICP va personalar, North Star metrikasi, unfair advantage |
| 02 | [Mahsulot PRD](docs/02-mahsulot-prd.md) | MVP / v1 / v2 funksiyalari, qabul mezonlari, ekranlar, user story'lar |
| 03 | [Bozor va raqobat](docs/03-bozor-va-raqobat.md) | TAM/SAM/SOM, 10 ta raqobatchi, pozitsiyalash, o'zbek tili texnologiyalari (manbalar bilan) |
| 04 | [Texnik arxitektura](docs/04-texnik-arxitektura.md) | Stek, diagramma, RAG, persona, guardrails, ma'lumotlar modeli, LLM router, evals, xavfsizlik, 8 haftalik MVP rejasi |
| 05 | [Biznes model](docs/05-biznes-model.md) | Tariflar, birlik iqtisodiyoti, LTV/CAC, viral mexanizm, KPI'lar |
| 06 | [Go-to-market](docs/06-go-to-market.md) | Bosqichlar, birinchi 10 mijoz, DM skripti, o'sish dvigatellari, B2B playbook |
| 07 | [Moliyaviy reja](docs/07-moliyaviy-reja.md) | 3 ssenariy, taxminlar, mablag'dan foydalanish |
| 08 | [Roadmap va OKR](docs/08-roadmap-va-okr.md) | 18 oylik Gantt, milestone'lar, choraklik OKR'lar |
| 09 | [Xavflar va huquq](docs/09-xavflar-va-huquq.md) | Xavflar matritsasi, huquqiy nazorat ro'yxati, etika tamoyillari |
| 10 | [Pitch deck](docs/10-pitch-deck.md) | 12 slayd matni va investor savollariga javoblar |
| 11 | [Jamoa va investitsiya](docs/11-jamoa-va-investitsiya.md) | Jamoa rejasi, raundlar, investorlar, data room |

## Moliyaviy model

```bash
python3 finance/model.py   # finance/summary.md va finance/projection.csv ni qayta yaratadi
```

Taxminlar `finance/model.py` faylidagi `ASSUMPTIONS` va `SCENARIOS` ichida.

## Keyingi 30 kun: eng muhim 5 qadam

1. **30 ta muammo-intervyu** o'tkazish. Ular uchun DM skripti [06-hujjat](docs/06-go-to-market.md)da.
2. **10 ta design partner** topish va kamida 5 tasidan oldindan to'lov olish. Asosiy gipoteza shu bilan tekshiriladi.
3. **Yuridik shaxs ochish va IT Parkka ariza berish.** Shaxsiy ma'lumotlar bo'yicha yurist xulosasini olish.
4. **MVP'ning 1–2 haftasi:** monorepo, UZ server, auth, ingest ([04-hujjat](docs/04-texnik-arxitektura.md) §9).
5. **Demo-klon tayyorlash.** Uni 3 ta taniqli blogerning ochiq postlari asosida qurib, sotuv uchrashuvlarida "o'zingni ko'r" effekti sifatida ishlatish.

> ⚠️ Raqamlar va narxlar 2026-yil oktyabr holatiga ko'ra. "Tasdiqlanmagan" deb belgilangan ma'lumotlarni investorga ko'rsatishdan oldin birlamchi manbalarda tekshiring.
