# 05 — Biznes model va narxlash

## Daromad manbalari

1. **SaaS obuna** (asosiy, ~80% daromad) — klon egalari oylik/yillik to'laydi.
2. **Klon monetizatsiyasidan komissiya** (v1 dan) — obunachilar klonga pul to'laganda 12% komissiya (Delphi modeli).
3. **Korporativ / white-label / API** (2-yildan) — banklar, telekom, o'quv markaz tarmoqlari, davlat xizmatlari. $1 000+/oy.
4. **Qo'shimcha xizmatlar** — "Done-for-you" klon sozlash ($150–500 bir martalik), qo'shimcha xabar paketlari, premium ovoz.

## Tariflar

Narxlar so'mda ham ko'rsatiladi (taxminan 1 USD ≈ 12 800 so'm; to'lov sahifasida joriy kurs bo'yicha yaxlitlanadi).

| Tarif | Narx / oy | So'mda (taxm.) | Nima kiradi |
|---|---|---|---|
| **Free** | $0 | 0 | 1 klon, 100 xabar/oy, faqat web-vidjet + umumiy Telegram bot, "Powered by AI Clone" belgisi |
| **Creator** | $15 | 189 000 | 1 klon, 2 000 xabar, o'z Telegram boti, ovozli xabarlarni tushunish, lid yig'ish |
| **Pro** ⭐ | $39 | 499 000 | 3 klon, 6 000 xabar, ovoz klonlash (30 daq.), klon monetizatsiyasi, Instagram DM, analitika |
| **Business** | $119 | 1 490 000 | 5 klon, 25 000 xabar, ovoz 120 daq., WhatsApp, jamoa (5 operator), CRM (AmoCRM/Bitrix24), API |
| **Enterprise** | $1 000+ | kelishuv | White-label, on-prem / UZ server, SLA, SSO, maxsus model |

- Yillik to'lovda **2 oy bepul** (−17%).
- Limitdan oshgan xabarlar: $5 / 1 000 xabar.
- Raqobatchilarga nisbatan: Delphi Builder $79, Coachvox $99 → biz 2–5 barobar arzon, lekin mahalliy xarid qobiliyatiga mos.

## Birlik iqtisodiyoti (unit economics)

### Bitta xabar (foydalanuvchi savoli + klon javobi) narxi

Batafsil hisob: `04-texnik-arxitektura.md` §8.

| Komponent | Narx (USD) | Izoh |
|---|---|---|
| LLM — kichik model (80% savollar) | ~$0.0008 | FAQ, salomlashish, tasdiqlangan javoblar |
| LLM — o'rta model (20% savollar) | ~$0.0025 (ulush) | sotuv, murakkab sintez |
| Rerank + embedding | ~$0.0005–0.002 | o'z serverdagi reranker bilan arzonlashadi |
| Klassifikator / so'rovni qayta yozish | ~$0.00015 | |
| Infratuzilma, kuzatuv (ulush) | ~$0.0005 | |
| Semantik kesh tejami (~30% savollar) | −30% | takroriy savollar LLM'siz javob oladi |
| **Jami (ehtiyotkor baho)** | **~$0.003** | `finance/model.py` → `cost_per_message` |

### Tarif bo'yicha yalpi marja (o'rtacha foydalanish bilan)

| Tarif | Narx | Limit | O'rt. xabar/oy | Xabar narxi | To'lov komissiyasi (3%) | Yalpi marja |
|---|---|---|---|---|---|---|
| Creator | $15 | 2 000 | 900 | $2.70 | $0.45 | **79%** |
| Pro | $39 | 6 000 | 3 000 | $9.00 | $1.17 | **74%** |
| Business | $119 | 25 000 | 9 000 | $27.00 | $3.57 | **74%** |

**Xavflar va himoya:**
- Limitni to'liq ishlatadigan foydalanuvchilar (Pro'da 6 000 xabar → $18, marja ~51%). Himoya: limitdan keyin pullik paket ($5 / 1 000 xabar), marjasi 60% dan past tenantlar haftalik kuzatiladi va faqat kichik modelga o'tkaziladi.
- **Ovoz — marjaning asosiy dushmani:** 300 belgilik ovozli javob $0.03–0.09 turadi (butun matnli suhbatdan qimmat). Shuning uchun ovoz cheksiz emas — alohida **"ovoz daqiqalari" paketi** sifatida sotiladi (Pro'da 30 daqiqa kiradi, keyin $5 / 30 daqiqa).
- Oflayn vazifalar (uslub tahlili, baholash, xotira ajratish) Batch API orqali — 50% arzon.

### LTV / CAC

| Ko'rsatkich | Qiymat (asosiy ssenariy) |
|---|---|
| ARPU (o'rtacha oylik daromad / pullik mijoz) | ~$35 (komissiya bilan ~$40) |
| Yalpi marja | ~75% |
| Oylik churn | 8% → 3.5% (mahsulot yetilishi bilan) |
| O'rtacha umr | 1 / 0.05 ≈ 20 oy |
| **LTV** | $35 × 0.75 × 20 ≈ **$525** |
| Aralash CAC | ~$35 (pullik marketing), organik/referal — deyarli $0 |
| **LTV / CAC** | **~15×** (maqsad: >3×; pullik kanallarda haqiqiy CAC yuqoriroq bo'lishi mumkin) |
| CAC qoplash muddati | ~1.3 oy |

> Bu raqamlar gipoteza. Birinchi 100 pullik mijozdan keyin haqiqiy churn va CAC bilan qayta hisoblanadi.

## Viral mexanizm (o'sish dvigateli)

Har bir klon — reklama. Obunachi blogerning klonidan foydalanganda: "Siz ham o'z AI-kloningizni yarating → aiclone.uz" (Free tarifda majburiy, pullik tariflarda o'chirsa bo'ladi). Bitta 100k obunachili bloger → minglab obunachi mahsulotni ko'radi; ularning bir qismi o'zi ham kreator.

**Referal dasturi:** taklif qilgan bloger har bir pullik mijozdan 12 oy davomida 20% oladi (affiliate) — O'zbekistonda blogerlar reklama orqali pul ishlashga o'rgangan, bu ularga yangi daromad manbai.

## Asosiy biznes metrikalari (dashboard)

| Metrika | MVP maqsadi (3-oy) | 12-oy maqsadi |
|---|---|---|
| Ro'yxatdan o'tganlar | 500 | 6 000 |
| Faol klonlar (haftasiga ≥10 suhbat) | 100 | 1 200 |
| Pullik mijozlar | 30 | 300 |
| MRR | $800 | $10 000 |
| Haftalik foydali suhbatlar | 5 000 | 150 000 |
| Javob sifati (👍 ulushi) | 80% | 90% |
| Free → Paid konversiya | 5% | 7% |
| NPS | 30 | 50 |
