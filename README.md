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

## Kod: MVP (ishlaydigan birinchi versiya)

```
packages/core   AI yadro: o'zbek matnini normallashtirish (lotin/kirill), chunking, gibrid qidiruv (RRF),
                persona va uslub prompti, guardrails (eskalatsiya, PII niqoblash), LLM router (fallback,
                circuit breaker, xarajat hisobi), Claude adapteri, Telegram eksporti parseri
packages/db     Postgres + pgvector sxemasi, har bir jadvalda RLS, bilim ombori, CloneService
                (chat, lidlar, human takeover, tuzatish → tasdiqlangan javob, limitlar)
apps/api        HTTP API (Hono), egasi dashboardi (/app), sayt vidjeti (/widget.js), ommaviy klon sahifasi (/c/<slug>)
apps/bot        Telegram bot (grammY): suhbat, /forget, egasiga eskalatsiya, /reply /takeover /bot
```

### Ishga tushirish

```bash
pnpm install
docker compose up -d                 # Postgres 16 + pgvector
cp .env.example .env && set -a && . ./.env && set +a
pnpm seed                            # demo klon: "Dilnoza (IELTS)" + API kalit
pnpm dev:api                         # dashboard: http://localhost:8787/app · klon: /c/dilnoza-demo
TELEGRAM_BOT_TOKEN=... pnpm dev:bot  # ixtiyoriy: Telegram bot
```

`ANTHROPIC_API_KEY` bo'lmasa, tizim **MockProvider** bilan ishlaydi. Bu rejimda javob topilgan manbaning birinchi gapi bo'ladi, haqiqiy model emas. Kalit qo'yilsa, Claude ishlaydi: oddiy savollar `claude-haiku-5-5` ga, sotuv va murakkab savollar `claude-sonnet-5-5` ga yo'naltiriladi (`packages/core/src/llm/router.ts`, `DEFAULT_POLICY`).

### Testlar

```bash
pnpm typecheck
TEST_DATABASE_URL=postgres://aiclone:aiclone@localhost:5432/aiclone pnpm test   # 77 test: RLS izolyatsiyasi va to'lov oqimlari ham bor
```

### API qisqacha

| Metod | Yo'l | Vazifa |
|---|---|---|
| POST | `/admin/tenants` (`x-admin-token`) | Tenant va API kalit yaratish |
| POST | `/v1/clones` | Klon yaratish |
| PATCH | `/v1/clones/:id/style` | Uslub profilini tahrirlash |
| POST | `/v1/clones/:id/sources` · `/sources/url` · `/sources/telegram` | Bilim yuklash: matn, sayt yoki Telegram eksporti |
| POST | `/v1/clones/:id/exemplars` | Uslub namunasi qo'shish |
| POST | `/v1/clones/:id/chat` | Klon bilan suhbat |
| GET | `/v1/clones/:id/conversations?filter=escalated` · `/leads?format=csv` · `/stats` | Inbox, lidlar, statistika |
| POST | `/v1/conversations/:id/mode` · `/reply` | Human takeover va egasining javobi |
| POST | `/v1/messages/:id/feedback` | 👍/👎 va tuzatish. Tuzatish tasdiqlangan javobga aylanadi |
| POST/GET | `/public/:slug/chat` · `/public/:slug/updates` | Vidjet uchun ommaviy endpointlar |
| GET/POST | `/v1/billing` · `/v1/billing/orders` | Joriy tarif va foydalanish, Payme/Click checkout havolasi |
| POST | `/payments/payme` · `/payments/click/prepare` · `/payments/click/complete` | To'lov tizimlari webhooklari |

### To'lovlar (Payme va Click)

Tarif obunalari so'mda: Creator 189 000, Pro 499 000, Business 1 490 000 so'm. Yillik to'lovda 2 oy bepul.
- To'lov tasdiqlangach, tarif, xabar limiti va kunlik xarajat chegarasi avtomatik yangilanadi. Muddat amaldagi muddat ustiga qo'shiladi.
- Muddat tugagach, limitlar avtomatik bepul tarifga qaytadi. Buning uchun cron kerak emas.

**Payme Merchant API**
- To'liq amalga oshirilgan metodlar: `CheckPerformTransaction`, `CreateTransaction`, `PerformTransaction`, `CancelTransaction`, `CheckTransaction`, `GetStatement`.
- Yaratilgan tranzaksiya 12 soatdan keyin bekor qilinadi. O'tkazilgan to'lov bekor qilinsa (pul qaytarilsa), tarif darhol tugaydi.

**Click SHOP API:** Prepare va Complete bosqichlari, md5 imzo tekshiruvi bilan.

**Ishga tushirish:** kalitlarni `.env` ga yozing (`PAYME_*`, `CLICK_*`). Merchant kabinetida endpoint sifatida `<PUBLIC_BASE_URL>/payments/payme` va `<PUBLIC_BASE_URL>/payments/click/{prepare,complete}` ni ko'rsating.

> ⚠️ Prod'dan oldin Payme va Click sandbox muhitida rasmiy test ssenariylaridan o'ting. Payme fiskal chek uchun xizmatning IKPU kodi ham kerak (`PAYME_IKPU_CODE`).

Barcha `/v1` so'rovlari `Authorization: Bearer <api kalit>` sarlavhasini talab qiladi.

### MVP'da hali yo'q (keyingi qadamlar)

- Ovozli xabarlarni tushunish (STT), PDF/DOCX parserlari, YouTube transkriptlari.
- So'rovni LLM orqali qayta yozish, reranker va LLM asosidagi eskalatsiya klassifikatori. Hozircha qoidalar asosida ishlaydi.
- Ko'p klonli Telegram webhook marshrutlash. Hozir bitta bot bitta klonga xizmat qiladi.

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
