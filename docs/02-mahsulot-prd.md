# 02 — Mahsulot talablari hujjati (PRD)

## Maqsad

MVP'ning vazifasi bitta gipotezani isbotlash: **"Ekspert-bloger o'z AI-klonini 15 daqiqada yaratib, Telegramga ulaydi va birinchi haftada klon kamida 50 ta foydali suhbat o'tkazadi."**

## Asosiy foydalanuvchi oqimi (MVP)

```
Ro'yxatdan o'tish (Telegram/Google)
  → "Klon yaratish" ustasi
      1. Ism, rasm, qisqa bio, soha
      2. Bilim yuklash (fayl / URL / YouTube / Telegram eksport)
      3. Uslub: 5–10 ta o'z yozgan postini qo'yish → tizim uslub profilini chiqaradi
      4. Qoidalar: "nima haqida gapirmaydi", eskalatsiya holatlari, CTA (masalan, kursga havola)
  → Sinov chati (preview) + javoblarni tuzatish
  → Kanalga ulash: Telegram bot tokeni yoki bizning umumiy bot orqali deep-link
  → Dashboard: suhbatlar, baholar, lidlar, statistika
```

## Funksional talablar

### P0 — MVP (6–8 hafta)

| # | Funksiya | Qabul qilish mezoni |
|---|---|---|
| F1 | Auth (Telegram Login, Google) | 30 soniyada ro'yxatdan o'tish |
| F2 | Klon profili (ism, avatar, bio, til) | Bir hisobda 1 ta klon (Free), ko'proq — pullik |
| F3 | Bilim manbalari: PDF/DOCX/TXT, URL, YouTube transkript | 50 MB / 100 sahifa → 3 daqiqadan kam vaqtda indekslanadi |
| F4 | Uslub profili (style extraction) | 5+ namunadan ohang, uzunlik, emoji, iboralar ajratiladi; egasi tahrirlaydi |
| F5 | RAG javob + manbaga havola | Javoblarning ≥85% i "golden set"da to'g'ri (faithfulness) |
| F6 | Guardrails | Bilim tashqarisida "bilmayman, egamga yo'naltiraman"; birinchi xabarda "Men X ning AI-kloniman" oshkoralik |
| F7 | Telegram kanal | Bot orqali suhbat, ovozli xabarni matnga aylantirish (STT) |
| F8 | Web vidjet | Bitta `<script>` qatori bilan saytga qo'yish |
| F9 | Suhbatlar inboxi | Barcha suhbatlar, 👍/👎, javobni tuzatish → "tuzatilgan javoblar" xotirasi |
| F10 | Human takeover | Egasi istalgan suhbatni qo'lga oladi; klon to'xtaydi |
| F11 | Lid yig'ish | Ism + telefon so'rash ssenariysi, CSV eksport, Telegram'ga xabarnoma |
| F12 | Tariflar va to'lov | Payme/Click + Stripe; xabar limiti hisoblanadi |
| F13 | Til | UZ (lotin/kirill), RU, EN — avtomatik aniqlash |

### P1 — v1 (3–4 oy)

- Ovoz klonlash (rozilik videosi bilan) — klon ovozli xabar bilan javob beradi
- Instagram DM va WhatsApp Business integratsiyasi
- **Klon monetizatsiyasi**: obunachi klonga pullik kirish (oylik / savol uchun), egasiga to'lov (payout)
- Uchrashuv band qilish (Google Calendar / Calendly)
- CRM integratsiyasi (AmoCRM, Bitrix24 — MDHda keng tarqalgan)
- Analitika: eng ko'p so'raladigan savollar, "bilim bo'shliqlari" (klon bilmagan mavzular)
- Telegram kanal avtomatik sinxronizatsiya (yangi postlar bilimga qo'shiladi)
- Jamoa a'zolari (o'quv markaz uchun bir nechta operator)

### P2 — v2 (6–12 oy)

- Video-avatar (lip-sync) javoblar
- Proaktiv klon: obunachilarga shaxsiylashtirilgan xabarlar, follow-up
- Klon marketpleysi ("Ekspertlar kataloggi") — obunachilar klonlarni topadi
- API va white-label (korporativ: banklar, telekom, davlat xizmatlari)
- Ochiq modellarni o'z serverda (on-prem) ishga tushirish — korporativ va ma'lumot mahalliylashtirish uchun

## Nofunksional talablar

| Soha | Talab |
|---|---|
| Tezlik | Birinchi token < 1.5 s (p50), to'liq javob < 6 s (p95) |
| Ishonchlilik | 99.5% uptime (MVP), LLM provayderi ishdan chiqsa — avtomatik fallback |
| Xavfsizlik | Tenantlar izolyatsiyasi (Postgres RLS), ma'lumotlar shifrlangan (at rest + in transit) |
| Maxfiylik | Egasi bilimini va suhbatlarni o'chirish huquqi (1 klik), yuklangan ma'lumot modelni o'qitishga ishlatilmaydi |
| Masshtab | 1 000 faol klon, kuniga 100k xabar — MVP arxitekturasi o'zgarishsiz |
| Narx | Bitta javobning o'rtacha LLM narxi ≤ $0.003 |

## Ekranlar ro'yxati (dizayn uchun)

1. Landing (UZ/RU/EN) — "O'z AI-kloningizni 15 daqiqada yarating"
2. Onboarding ustasi (4 qadam)
3. Klon studiyasi: Bilim | Uslub | Qoidalar | Sinov chati
4. Inbox (suhbatlar, filtrlar: baholanmagan / eskalatsiya / lid)
5. Kanallar (Telegram, Vidjet, Instagram, WhatsApp)
6. Analitika
7. Tarif va to'lov
8. Ommaviy klon sahifasi: `aiclone.uz/@dilnoza` — obunachi shu yerda gaplashadi

Dizayn yo'nalishi: avvalgi "AI Clone — UI/UX Design Exploration" (Ink & Bone — tahririy, qora-oq-krem, kuchli tipografiya) uslubida davom etish tavsiya etiladi: bu "robot chatbot" emas, "premium shaxsiy brend" hissini beradi.

## Foydalanuvchi hikoyalari (asosiylari)

- *Klon egasi sifatida* men o'z Telegram kanalim eksportini yuklamoqchiman, *shunda* klon mening barcha eski javoblarimni bilsin.
- *Klon egasi sifatida* noto'g'ri javobni bir marta tuzatmoqchiman, *shunda* klon boshqa hech qachon bu xatoni qaytarmasin.
- *Obunachi sifatida* ovozli xabar yubormoqchiman, *chunki* yozish noqulay.
- *Obunachi sifatida* bu AI ekanini bilishni xohlayman, *shunda* aldanganimni his qilmayman.
- *O'quv markaz sifatida* kechasi kelgan har bir lid ertalab CRM'da bo'lishini xohlayman.

## MVP'ga KIRMAYDI (ataylab)

Video-avatar, marketpleys, mobil ilova (Telegram + PWA yetarli), murakkab avtomatlashtirish (workflow builder), o'z modelimizni o'qitish.
