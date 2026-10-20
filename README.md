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
| 12 | [Ishga tushirish (runbook)](docs/12-ishga-tushirish-runbook.md) | Deploy, yangilash, zaxira va tiklash, ogohlantirishlar, hodisalar |

## Kod: MVP (ishlaydigan birinchi versiya)

```
packages/core   AI yadro: o'zbek matnini normallashtirish (lotin/kirill), chunking, gibrid qidiruv (RRF),
                persona va uslub prompti, guardrails (eskalatsiya, PII niqoblash), LLM router (fallback,
                circuit breaker, xarajat hisobi), Claude adapteri, Telegram eksporti parseri
packages/db     Postgres + pgvector sxemasi, har bir jadvalda RLS, bilim ombori, CloneService
                (chat, lidlar, human takeover, tuzatish → tasdiqlangan javob, limitlar), fon vazifalari navbati
apps/api        HTTP API (Hono), egasi dashboardi (/app), sayt vidjeti (/widget.js), ommaviy klon sahifasi (/c/<slug>), katalog (/explore), worker
apps/bot        Telegram bot (grammY): suhbat, ovozli xabarlar (STT), /forget, egasiga eskalatsiya, /reply /takeover /bot, kanal sinxroni /sync /unsync
```

### Ishga tushirish

```bash
pnpm install
docker compose up -d                 # Postgres 16 + pgvector
cp .env.example .env && set -a && . ./.env && set +a
pnpm seed                            # demo klon: "Dilnoza (IELTS)" + API kalit
pnpm dev:api                         # dashboard: http://localhost:8787/app · klon: /c/dilnoza-demo
RUN_WORKER=0 pnpm dev:api & pnpm worker  # ixtiyoriy: worker alohida jarayonda
TELEGRAM_BOT_TOKEN=... pnpm dev:bot  # ixtiyoriy: bitta bot, long polling (lokal sinov)
```

Claude ulanganda har bir xabarda qo'shimcha ikkita qadam ham ishlaydi, ikkalasi kichik modelda va parallel:
- **klassifikator:** bilvosita inson so'rovi, shikoyat, xarid niyati, nozik mavzuni aniqlaydi va foydalanuvchi aytgan muhim faktni xotiraga yozadi;
- **so'rovni qayta yozish:** "uning narxi qancha?" kabi savollarni suhbat tarixiga qarab mustaqil qidiruv so'roviga aylantiradi.

Ikkalasi ham xato bersa, tizim qoidalar asosidagi tekshiruvga qaytadi. `TEI_RERANK_URL` berilsa, cross-encoder reranker ham qo'shiladi.

`ANTHROPIC_API_KEY` bo'lmasa, tizim **MockProvider** bilan ishlaydi. Bu rejimda javob topilgan manbaning birinchi gapi bo'ladi, haqiqiy model emas. Kalit qo'yilsa, Claude ishlaydi: oddiy savollar `claude-haiku-5-5` ga, sotuv va murakkab savollar `claude-sonnet-5-5` ga yo'naltiriladi (`packages/core/src/llm/router.ts`, `DEFAULT_POLICY`).

### Prod'ga joylash (bitta server, Docker)

```bash
cp .env.example .env     # kalitlarni to'ldiring; qo'shimcha: APP_DB_PASSWORD, POSTGRES_ADMIN_PASSWORD, PLATFORM_DOMAIN
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml run --rm api seed   # ixtiyoriy: demo klon
```

- **Tarkib:** Postgres + pgvector, API, 2 ta worker va Caddy. Caddy TLS'ni avtomatik oladi, mijoz domenlari uchun on-demand TLS ham shu yerda.
- **Ma'lumotlar bazasi:** ilova bazaga **superuser bo'lmagan** `aiclone` roli bilan ulanadi (`deploy/postgres-init.sh`), shuning uchun RLS haqiqatan ishlaydi. Migratsiyalar API va worker ishga tushganda o'zi qo'llanadi (advisory lock bilan bir marta).
- **Bitta obraz:** `docker run aiclone api | worker | migrate | seed`.
- **Tashqi yopiq yo'llar:** `/internal/*` va `/metrics` Caddy orqali tashqaridan ochilmaydi.

### Ishga tushirishdan oldingi tekshiruv

```bash
pnpm smoke                                               # lokal
docker compose -f docker-compose.prod.yml run --rm api smoke   # serverda
```

- **Konfiguratsiya:** kuchsiz `ADMIN_TOKEN`, `http://` manzil, noto'g'ri `CHANNEL_SECRET_KEY`, yetishmayotgan Payme yoki Meta sozlamalari.
- **Ma'lumotlar bazasi:** migratsiyalar to'liqmi, ilova roli superuser emasmi (aks holda RLS ishlamaydi).
- **Haqiqiy kalitlar:** Claude'da har bir sozlangan model mavjudmi, ElevenLabs akkaunti va TTS modeli, D-ID kreditlari, TEI embedding o'lchami (1024), Telegram bot va serverning internetdan ochilishi.
- **Narxi:** tekshiruvlar faqat ma'lumot o'qiydi, pullik generatsiya chaqirilmaydi.
- **Prod'da himoya:** `NODE_ENV=production` da API xavfli konfiguratsiya bilan ishga tushmaydi. Faqat sinov uchun `STRICT_CONFIG=0` bilan chetlab o'tish mumkin.

### Xavfsizlik

- **Ma'lumotlar izolyatsiyasi:** har bir jadvalda RLS; ilova roli superuser emas (CI bunga alohida testlarni ishlatadi). Biometrik ustunlarni (ovoz, surat) ilova roli o'qiy olmaydi.
- **Kalitlar:** API kalitni terib topishga qarshi IP bo'yicha cheklov bor (daqiqasiga 20 ta xato urinish), admin token vaqtga chidamli (timing-safe) taqqoslanadi. Sizib chiqqan kalit dashboard'dan yoki `POST /v1/api-key/rotate` bilan almashtiriladi.
- **Xavfsizlik sarlavhalari:** HSTS, `nosniff`, `X-Frame-Options: DENY`; mikrofon faqat o'z domenida. So'rov hajmi cheklangan: fayllar 20 MB, ommaviy endpointlar 64 KB.
- **Ekspluatatsiya:** deploy, yangilash, zaxira va hodisalar bo'yicha qo'llanma [12-hujjat](docs/12-ishga-tushirish-runbook.md)da.

### Monitoring

- **Holat tekshiruvlari:** `/health` (jarayon tirikmi) va `/health/ready` (baza ulanadi va barcha migratsiyalar qo'llangan, aks holda 503).
- **Metrikalar:** `/metrics` Prometheus formatida, `Authorization: Bearer $METRICS_TOKEN` bilan. Ichida: so'rovlar va javob vaqti (marshrut shabloni bo'yicha, ID'larsiz), navbat chuqurligi va eng eski vazifa yoshi, muvaffaqiyatsiz vazifalar, bugungi xabarlar va LLM xarajati.
- **Ogohlantirishlar:** `deploy/alerts.yml` da 5xx ulushi, sekin chat, webhook navbati tiqilishi va kunlik xarajat chegarasi bor.
- **Loglar:** prod'da bir qatorli JSON. Har bir so'rovda `X-Request-Id` bor, 500 javobida ham qaytadi, shuning uchun foydalanuvchi shikoyatini logdan topish mumkin. Query satri logga yozilmaydi (tashrifchi ID'si, tokenlar).

### Testlar

```bash
pnpm typecheck
TEST_DATABASE_URL=postgres://aiclone:aiclone@localhost:5432/aiclone pnpm test   # 192 test: RLS, navbat, katalog, to'lovlar, monetizatsiya, ovoz, fayl, LLM qadamlari, Telegram, Instagram, WhatsApp
```

> Prod'dagi kabi superuser bo'lmagan ega bilan tekshirish: bazani oddiy rol (`CREATEROLE`) egaligida yarating, kengaytmalarni (`vector`, `pg_trgm`, `pgcrypto`) admin o'rnatadi, keyin shu rol bilan `TEST_DATABASE_URL` ni ishga tushiring. Docker'dagi `aiclone` superuser bo'lgani uchun RLS xatolarini yashirishi mumkin.

### API qisqacha

| Metod | Yo'l | Vazifa |
|---|---|---|
| POST | `/admin/tenants` (`x-admin-token`) | Tenant va API kalit yaratish |
| POST | `/v1/clones` | Klon yaratish |
| PATCH | `/v1/clones/:id/style` | Uslub profilini tahrirlash |
| POST | `/v1/clones/:id/sources` · `/sources/url` · `/sources/telegram` | Bilim yuklash: matn, sayt yoki Telegram eksporti |
| POST | `/v1/clones/:id/sources/file` (multipart) · `/sources/youtube` | PDF (iqtibos sahifa raqami bilan), DOCX, TXT/MD; YouTube (iqtibos videoning aniq daqiqasiga havola bilan) |
| GET | `/v1/jobs/:id` | Fon vazifasi holati (YouTube, OCR): `queued` → `running` → `done` / `failed` |
| POST | `/v1/clones/:id/exemplars` | Uslub namunasi qo'shish |
| POST | `/v1/clones/:id/chat` | Klon bilan suhbat |
| GET | `/v1/clones/:id/conversations?filter=escalated` · `/leads?format=csv` · `/stats` | Inbox, lidlar, statistika |
| POST | `/v1/conversations/:id/mode` · `/reply` | Human takeover va egasining javobi |
| POST | `/v1/messages/:id/feedback` | 👍/👎 va tuzatish. Tuzatish tasdiqlangan javobga aylanadi |
| POST/GET | `/public/:slug/chat` · `/public/:slug/updates` | Vidjet uchun ommaviy endpointlar |
| GET/POST | `/v1/billing` · `/v1/billing/orders` | Joriy tarif va foydalanish, Payme/Click checkout havolasi |
| POST | `/payments/payme` · `/payments/click/prepare` · `/payments/click/complete` | To'lov tizimlari webhooklari |
| GET/POST/DELETE | `/v1/clones/:id/telegram` | Klonning o'z Telegram botini ulash yoki uzish |
| POST | `/telegram/:id` | Telegram webhook (`X-Telegram-Bot-Api-Secret-Token` bilan) |
| GET/POST/DELETE | `/v1/clones/:id/channels` · `/channels/instagram` · `/channels/whatsapp` | Instagram DM va WhatsApp Cloud API kanallarini ulash |
| GET/POST/PATCH/DELETE | `/v1/clones/:id/voice` · `/voice/consent` · `/voice/preview` | Ovoz kloni: rozilik matni, yozib olish, rejim, eshitib ko'rish, qaytarib olish |
| GET/PATCH | `/v1/clones/:id/monetization` · POST `/v1/clones/:id/products` · PATCH `/v1/products/:id` · GET `/v1/earnings` | Klon monetizatsiyasi: pullik kirish, mahsulotlar, daromad |
| GET/PATCH | `/v1/clones/:id/marketplace` | Katalogga qo'yish: kategoriya, qisqa tavsif |
| GET | `/explore` · `/public/marketplace?q=&category=` | Ommaviy katalog: HTML sahifa va JSON |
| POST | `/public/:slug/feedback` · `/public/:slug/report` | Obunachi bahosi (👍/👎) va shikoyat |
| GET/POST | `/admin/reports` · `/admin/clones/:id/moderation` (`x-admin-token`) | Shikoyatlar va moderatsiya |
| GET/PATCH/PUT/POST/DELETE | `/v1/clones/:id/white-label` · `/brand` · `/domain` · `/domain/verify` | White-label: brend va o'z domeni (Business) |
| GET | `/public/:slug/config` · `/internal/tls-ask?domain=` | Vidjet uchun brend; Caddy on-demand TLS tekshiruvi |
| GET/POST/PATCH/DELETE | `/v1/clones/:id/avatar` | Video-avatar: surat va rozilik (multipart `photo`, `signature`), rejim, qaytarib olish |
| GET | `/public/:slug/video/:id` · `/public/:slug/video/:id/file` | Vidjet: video holati va faylning o'zi (faqat o'z tashrifchisiga) |
| GET | `/pay/:token` · `/pay/:token/{payme,click}` | Obunachi to'lov sahifasi (imzolangan havola) |
| POST | `/admin/payouts` (`x-admin-token`) | Kreatorga to'lab berilgan summani qayd etish |
| GET/POST | `/meta/webhook` | Meta webhooki: tasdiqlash (`hub.challenge`) va `X-Hub-Signature-256` imzosi bilan xabarlar |

### Telegram: ikki rejim

1. **Ko'p klonli, prod uchun.** Serverda `CHANNEL_SECRET_KEY` va `PUBLIC_BASE_URL` o'rnatiladi. Har bir klon egasi dashboarddagi **Ulash** bo'limida BotFather tokenini kiritadi. Shundan keyin:
   - token tekshiriladi (`getMe`) va AES-256-GCM bilan shifrlanib saqlanadi;
   - webhook har bir bot uchun alohida sir bilan o'rnatiladi;
   - barcha botlar bitta API serveri orqali ishlaydi;
   - bitta bot faqat bitta klonga ulanadi.
2. **Bitta bot, lokal sinov uchun.** `TELEGRAM_BOT_TOKEN` va `CLONE_SLUG` bilan `pnpm dev:bot` ishga tushiriladi. Bu rejim long polling ishlatadi.

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

> YouTube: avval subtitrlar olinadi (o'zbek → rus → ingliz). Subtitr bo'lmasa yoki YouTube server so'rovini bloklasa, audio STT orqali matnga aylantiriladi (`ELEVENLABS_API_KEY`).

### Klonlar katalogi

Egasi **Sozlamalar → Katalog** bo'limida kategoriya va qisqa tavsifni tanlab, klonni `/explore` katalogiga qo'yadi. Buning uchun kamida bitta bilim manbai kerak.
- **Qidiruv:** ism, tavsif va bio bo'yicha, lotin va kirill yozuvida; 8 ta kategoriya bo'yicha filtr. Sahifa serverda chiziladi, shuning uchun JS'siz ishlaydi va qidiruv tizimlari indekslaydi.
- **Reyting:** vidjetdagi 👍/👎 asosida (oxirgi 90 kun, kamida 5 ta baho). Saralash: Wilson quyi chegarasi (70%) + 30 kunlik suhbatlar soni (30%), shuning uchun 3 ta tasodifiy 👍 olgan yangi klon tepaga chiqib ketmaydi. Obunachi faqat o'z suhbatidagi javobni, har birini bir marta baholaydi.
- **Moderatsiya:** katalogdagi klon sahifasida "Shikoyat qilish" bor (boshqa shaxs nomidan, zararli maslahat, spam). Admin shikoyatlarni `/admin/reports` da ko'radi va klonni bloklaydi. Bloklangan klon katalogdan yo'qoladi, lekin o'z havolasi orqali ishlashda davom etadi.

> Katalog reytingi hozir har so'rovda hisoblanadi; klonlar minglab bo'lganda uni materialized view'ga ko'chirish kerak.

### Video-avatar

Business tarifida klon qisqa javoblarni egasining yuzi va ovozida video sifatida ham yuboradi:
- **Shartlar:** avval ovoz kloni (rozilik bilan) yaratilgan bo'ladi. Keyin egasi **Ovoz → Video-avatar** bo'limida o'z suratini yuklaydi va rozilik matnini to'liq ismini yozib tasdiqlaydi. Fayl turi baytlardan tekshiriladi (JPG yoki PNG).
- **Qayerda ishlaydi:** vidjetda va ulangan Telegram botida (ko'p klonli rejim). Matnli javob darhol boradi, video navbatda tayyorlanib, ortidan keladi. 300 belgigacha bo'lgan javoblar videoga aylanadi, uzunroqlari faqat matnda qoladi. Suhbatdagi birinchi video "Men …ning AI-kloniman" deb boshlanadi.
- **Kvota:** Business tarifida oyiga 20 daqiqa, Enterprise'da 100 daqiqa.
- **Provayder:** D-ID (`DID_API_KEY`). Surat har bir video uchun D-ID'ning vaqtinchalik xotirasiga yuklanadi; tayyor video yuklab olingach, D-ID'dagi nusxa o'chiriladi. D-ID mashhur shaxsni aniqlasa, so'rovni rad etadi va egasiga tushunarli xato qaytadi.
- **Biometrik ma'lumot:** surat va rozilik faqat bazada saqlanadi, ilova roli ularni o'qiy olmaydi. Rozilik qaytarib olinsa, surat va barcha videolar o'chiriladi. Videolar 30 kundan keyin avtomatik o'chiriladi. `uz` regionidagi tenantlar uchun xorijiy provayder `AVATAR_ALLOW_CROSS_BORDER=1` (yurist xulosasidan keyin) yoqilmaguncha bloklanadi.

> Videolar hozir Postgres'da saqlanadi. Hajm oshganda ularni S3 bilan mos obyekt xotirasiga ko'chirish kerak.

### White-label

Business tarifida egasi **Sozlamalar → White-label** bo'limida quyidagilarni sozlaydi:
- **Brend:** aksent rangi (oq matn o'qilishi uchun WCAG kontrasti kamida 4.5 bo'lishi tekshiriladi), logo (faqat https) va klon sahifasidagi "O'z kloningizni yarating" havolasini yashirish. "Javoblar AI tomonidan beriladi" degan oshkoralik har doim qoladi.
- **O'z domeni** (masalan, `ai.dilnoza.uz`): egasi DNS'ga TXT yozuvini (`_aiclone-challenge.<domen>`) va `CUSTOM_DOMAIN_TARGET` ga CNAME qo'shadi, keyin "Tekshirish"ni bosadi. Tasdiqlangan domenning bosh sahifasida klon ochiladi, boshqaruv yo'llari (`/app`, `/v1`, `/admin`) esa u yerda yopiq.
- **TLS:** `deploy/Caddyfile` dagi on-demand TLS sertifikatni faqat `/internal/tls-ask` "ha" degan domenga chiqaradi, ya'ni domen tasdiqlangan va Business tarifi faol bo'lishi kerak.
- **Tarif tugasa:** domen va brend o'chadi, sozlamalar saqlanadi va to'lovdan keyin qayta ishlaydi.

### OCR va Telegram kanali sinxroni

- **OCR:** matn qatlami yo'q PDF (sahifasiga 30 belgidan kam) va rasmlar (png, jpg, webp) Claude orqali o'qiladi (`OCR_MODEL`, sukut bo'yicha `claude-opus-5-5`). Chegara 40 sahifa, undan katta faylga 413 qaytadi. `ANTHROPIC_API_KEY` bo'lmasa, javob 422 "OCR sozlanmagan" bo'ladi.
- **Kanal sinxroni:** botni kanalga admin qiling, so'ng egasi botga `/sync -100…` yozadi. Bot o'zi kanal admini ekanini tekshiradi. Shundan keyin yangi va tahrirlangan postlar bilimga avtomatik qo'shiladi; 40 belgidan qisqa postlar o'tkazib yuboriladi, tahrirlangan post eski nusxasini almashtiradi. `/unsync` sinxronni to'xtatadi. Egasi tasdiqlamagan kanal postlari hech qachon bilimga tushmaydi.

### Instagram va WhatsApp

Meta ilovasining webhook manzili `<PUBLIC_BASE_URL>/meta/webhook` bo'ladi, tasdiqlash tokeni `META_VERIFY_TOKEN`.
- **Instagram:** egasi dashboarddagi Ulash bo'limiga Instagram Login tokenini kiritadi. Ilova akkauntga avtomatik obuna bo'ladi.
- **WhatsApp:** egasi `phone_number_id` va system user tokenini kiritadi.
- **Kiruvchi xabarlar:** imzo bilan tekshiriladi, takroriy yetkazishlar o'tkazib yuboriladi. WhatsApp ovozli xabarlari STT orqali matnga aylantiriladi.
- **24 soatlik qoida:** Meta erkin matnli javobga faqat foydalanuvchining oxirgi xabaridan keyingi 24 soat ichida ruxsat beradi. Egasining kech javobi `delivered: false` qaytaradi.
- **Prod uchun Meta App Review kerak.**

### Ovoz kloni

Egasi dashboarddagi **Ovoz** bo'limida jarayonni boshlaydi:
1. Har safar yangi tasdiqlash kodi bo'lgan rozilik matnini oladi va uni o'qib, yozib oladi.
2. 1–2 daqiqalik ovoz namunasini yuklaydi.

Keyin tizim quyidagicha ishlaydi:
- **Rozilik tekshiruvi:** yozuv STT orqali matnga aylantiriladi. Unda kod va "roziman" so'zi bo'lmasa, ovoz yaratilmaydi. Eski yozuvni qayta ishlatib bo'lmaydi, matn 30 daqiqa amal qiladi.
- **Javob rejimlari:** o'chiq; foydalanuvchi ovozli yozsa ovozda javob; har doim ovozda ham javob. Birinchi ovozli javob "Men …ning AI-kloniman" deb boshlanadi.
- **Kvota:** Pro tarifida oyiga 30 daqiqa, Business'da 120 daqiqa. Kvota tugasa, javob faqat matnda boradi.
- **Biometrik ma'lumot:** rozilik yozuvi faqat bazada saqlanadi, ilova roli uni o'qiy olmaydi. Rozilik qaytarib olinsa, ovoz provayderdan o'chiriladi va yozuv tozalanadi.
- **Huquqiy cheklov:** 2026-yil mart o'zgartirishiga ko'ra, UZ fuqarolari biometrik ma'lumotlari faqat O'zbekistonda qayta ishlanadi. Shuning uchun `uz` regionidagi tenantlar uchun xorijiy provayder (ElevenLabs) sukut bo'yicha bloklanadi. Yechim: mahalliy TTS provayderi (`VoiceCloner` interfeysi) yoki yurist xulosasi bilan `VOICE_ALLOW_CROSS_BORDER=1`.

### Klon monetizatsiyasi

Egasi **Daromad** bo'limida mahsulot yaratadi (masalan, "50 ta savol" paketi yoki "30 kun cheksiz" obunasi) va pullik kirishni yoqadi.
- **Bepul savollar:** har bir obunachi oyiga N ta savolni bepul beradi. Shundan keyin klon LLM chaqirmasdan to'lov taklifini yuboradi. Vidjetda taklif tugma sifatida, Telegram, Instagram va WhatsApp'da havola sifatida ko'rinadi.
- **Havolalar:** HMAC bilan imzolangan va 7 kun amal qiladi. To'lov mavjud Payme/Click oqimi orqali o'tadi.
- **To'lovdan keyin:** obunachi huquq oladi. Paketda har bir javob bitta savolni yechadi, obuna esa muddat tugaguncha cheksiz.
- **Hisob-kitob:** platforma 12% komissiya oladi. Kreator balansi = sof daromad − to'lab berilgan summa. Pul qaytarilsa, huquq bekor qilinadi va daromadga teskari yozuv qo'shiladi.

> ⚠️ Platforma kreator nomidan pul qabul qiladi. Prod'dan oldin quyidagilarni yuristingiz va buxgalteringiz bilan hal qiling: kreatorlar bilan agentlik shartnomasi, to'lov tizimining marketplace (sub-merchant) shartlari, soliq (QQS, kreator daromadi).

### Fon vazifalari navbati

Og'ir ishlar HTTP so'rovidan chiqarilib, Postgres ustidagi navbatga (`jobs` jadvali, alohida broker kerak emas) qo'yiladi:
- **Telegram webhook:** sir tekshiriladi, yangilanish navbatga yoziladi va Telegram'ga darhol 200 qaytadi. Telegram qayta yuborgan `update_id` ikkinchi vazifa yaratmaydi.
- **Meta webhook:** imzo tekshiriladi, har bir xabar alohida vazifa bo'ladi; takroriy yetkazish `messageId` bo'yicha o'tkazib yuboriladi.
- **YouTube va OCR:** API `202 { jobId }` qaytaradi, dashboard `/v1/jobs/:id` orqali natijani kutadi.
- **Tartib:** bitta suhbatning xabarlari ketma-ket qayta ishlanadi, turli suhbatlar parallel.
- **Qayta urinish:** xatoda 5 s, 10 s, 20 s… (10 daqiqagacha) kechikish bilan; qayta urinish foyda bermaydigan xatolar (subtitr yo'q, OCR rad etildi) darhol `failed`. Osilib qolgan vazifa qulf muddati (15 daqiqa) tugagach boshqa worker'ga o'tadi.
- **Maxfiylik:** tugagan vazifalar 7 kundan keyin o'chiriladi, OCR fayli vazifa tugashi bilan tozalanadi.

Sukut bo'yicha worker API jarayonining ichida ishlaydi. Yuklama oshsa: `RUN_WORKER=0` bilan API, alohida `pnpm worker` nusxalari (`FOR UPDATE SKIP LOCKED` bilan xavfsiz). `JOBS=0` navbatni o'chiradi va hammasi so'rov ichida bajariladi.

> Yetkazish kafolati "kamida bir marta": worker javob yuborgandan keyin, vazifani yopishdan oldin qulasa, foydalanuvchi javobni ikki marta olishi mumkin.

### Keyingi qadamlar: prod'ga tayyorlash

Mahsulot ro'yxatidagi (v1–v2, `docs/02-mahsulot-prd.md`) barcha funksiyalar kodda bor. Ishga tushirishdan oldin:
- **Integratsiyalarni haqiqiy kalitlar bilan sinash.** Claude, ElevenLabs, D-ID, Payme/Click sandbox va Meta App Review hozircha faqat soxta servislar bilan testlangan.
- **Mahalliy provayderlar.** Biometrik ma'lumot (ovoz, yuz) uchun O'zbekistonda joylashgan TTS va avatar provayderi kerak (`VoiceCloner`, `TalkingAvatar` interfeyslari tayyor), aks holda yurist xulosasi talab qilinadi.
- **Infratuzilma:** fayl va videolar uchun obyekt xotira; katalog reytingi uchun materialized view; monitoring va alertlar; yuklama testi.
- **Huquqiy:** agentlik shartnomasi, oferta, shaxsiy ma'lumotlar reyestri (`docs/09`).

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
