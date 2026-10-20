# 12 — Ishga tushirish va ekspluatatsiya (runbook)

Bu hujjat serverga birinchi marta joylash, yangilash, zaxira va hodisalarda nima qilishni tasvirlaydi. Buyruqlar repozitoriy ildizida, `docker-compose.prod.yml` bilan ishlaydi (`DC="docker compose -f docker-compose.prod.yml"`).

## 1. Birinchi ishga tushirish

**Server.** Shaxsiy va biometrik ma'lumotlar (ovoz, surat) qonunga ko'ra O'zbekistonda saqlanadi, shuning uchun server va zaxiralar O'zbekistondagi data-markazda bo'lishi kerak. Minimal: 4 vCPU, 8 GB RAM, 100 GB SSD. TEI (embedding) uchun alohida GPU server tavsiya etiladi.

**Tartib:**
1. DNS: `api.<domen>` → server IP. White-label uchun `clones.<domen>` → server IP (mijozlar shunga CNAME qiladi).
2. `.env` ni to'ldiring (`.env.example` asosida). Sirlarni yarating:
   ```bash
   openssl rand -hex 24      # ADMIN_TOKEN, METRICS_TOKEN, APP_DB_PASSWORD, POSTGRES_ADMIN_PASSWORD
   openssl rand -base64 32   # CHANNEL_SECRET_KEY, PAYMENT_LINK_SECRET
   ```
   `CHANNEL_SECRET_KEY` ni alohida xavfsiz joyda ham saqlang: u yo'qolsa, ulangan barcha Telegram, Instagram va WhatsApp tokenlarini qayta ulash kerak bo'ladi.
3. Ishga tushiring va tekshiring:
   ```bash
   $DC up -d --build
   $DC run --rm api smoke        # barcha qatorlar ✅ yoki asosli ⚠️ bo'lsin
   ```
4. Tashqi integratsiyalar:
   - **Payme** kabinetida endpoint: `https://api.<domen>/payments/payme`; **Click**: `/payments/click/prepare` va `/complete`. Ikkalasining sandbox test ssenariylarini to'liq o'ting.
   - **Meta** ilovasida webhook: `https://api.<domen>/meta/webhook`, tasdiqlash tokeni `META_VERIFY_TOKEN`. App Review'dan oldin faqat test foydalanuvchilar bilan ishlaydi.
   - **Telegram:** har bir klon egasi tokenni dashboard orqali ulaydi, webhook avtomatik o'rnatiladi.
5. Zaxira cron'ini yoqing (§3) va monitoringni ulang (§4).

## 2. Yangilash

```bash
git pull
$DC build
$DC up -d            # API va worker'lar yangi obraz bilan qayta ishga tushadi
$DC run --rm api smoke
```

- **Migratsiyalar** ishga tushishda avtomatik qo'llanadi va faqat oldinga yuradi.
- **Orqaga qaytarish:**
  - yangilanishda migratsiya bo'lmagan bo'lsa, oldingi commit'ga qaytib, obrazni qayta yig'ing;
  - migratsiya bo'lgan bo'lsa, eski kod yangi sxema bilan ishlamasligi mumkin. Unda yangilashdan oldingi zaxiradan tiklang (§3), shuning uchun **har bir yangilashdan oldin `deploy/backup.sh` ni qo'lda ishga tushiring**.
- **Bitta server cheklovi:** yangilash bir necha soniyalik uzilish beradi. Telegram va Meta webhooklarni qayta yuboradi, shuning uchun xabarlar yo'qolmaydi.

## 3. Zaxira va tiklash

- **Kunlik zaxira:** `15 3 * * * /opt/aiclone/deploy/backup.sh` (cron). Zaxirada biometrik ma'lumot bor, shuning uchun `BACKUP_AGE_RECIPIENT` bilan shifrlang ([age](https://age-encryption.org)) va shifrlangan nusxani ikkinchi joyga (yana O'zbekistonda) ko'chiring. Sukut bo'yicha 14 kun saqlanadi.
- **Tiklash:** `deploy/restore.sh backups/aiclone-<sana>.dump.age`.
  - Skript API va worker'ni to'xtatadi, rollarni yaratadi, zaxirani yangi bazaga tiklaydi va almashtiradi.
  - Eski baza `aiclone_old` bo'lib qoladi; tekshirgandan keyin o'chiring.
- **Oylik mashq:** zaxirani alohida serverga tiklab, `smoke` ishlating. Hech qachon tiklanmagan zaxira — zaxira emas.

## 4. Monitoring va ogohlantirishlar

Prometheus `https://…/metrics` ni ichki tarmoqdan, `Authorization: Bearer $METRICS_TOKEN` bilan oladi (Caddy tashqaridan yopadi). Qoidalar `deploy/alerts.yml` da.

| Ogohlantirish | Ma'nosi | Birinchi qadam |
|---|---|---|
| `ApiServerErrors` | 5xx ulushi 2% dan oshdi | `$DC logs api --since 15m \| grep '"level":"error"'`; `requestId` bo'yicha qidiring |
| `QueueBacklog` | Telegram/Meta xabarlari 60 soniyadan beri navbatda — foydalanuvchilar javob olmayapti | `$DC ps worker`; o'lgan bo'lsa `$DC up -d worker`; yuklama bo'lsa `$DC up -d --scale worker=4` |
| `JobsFailing` | Vazifalar ko'p yiqilmoqda | `SELECT queue, last_error, count(*) FROM jobs WHERE status='failed' GROUP BY 1,2` |
| `ChatSlow` | Javob p95 > 10 s | LLM provayder holati; `aiclone_jobs_running`; TEI serveri |
| `LlmSpendHigh` | Kunlik LLM xarajati chegaradan oshdi | Eng ko'p xabar yozgan tenantni toping (`usage_ledger`), suiiste'mol bo'lsa tarif limitini kamaytiring |
| `ApiDown` | Metrikalar kelmayapti | `$DC ps`, `curl /health/ready`, disk joyi (`df -h`) |

## 5. Hodisalar bo'yicha qo'llanma

**Claude ishlamayapti (5xx, 529).** Router avval zaxira modelga o'tadi (`DEFAULT_POLICY`); ketma-ket xatolarda circuit breaker shu modelni vaqtincha chetlab o'tadi. Hamma model ishlamasa, foydalanuvchi xato emas, "Hozir texnik sabab bilan javob bera olmayapman, savolingizni egasiga yetkazdim" degan javob oladi. Suhbat esa egasiga "⚠️ AI vaqtincha ishlamayapti" sababi bilan eskalatsiya qilinadi, ya'ni savol yo'qolmaydi. Provayder holatini kuzating; kodni o'zgartirish shart emas.

**Telegram xabarlari kelmayapti.** `curl https://api.telegram.org/bot<token>/getWebhookInfo` — `last_error_message` ni ko'ring. Ko'pincha sabab TLS yoki DNS bo'ladi. Webhookni qayta o'rnatish uchun egasi dashboard'da botni uzib, qayta ulaydi.

**To'lov o'tdi, tarif yoqilmadi.** Buyurtma va tranzaksiyani tekshiring: `SELECT o.status, t.state FROM payme_transactions t JOIN orders o ON o.id = t.order_id WHERE t.id = '<Payme tranzaksiya ID>'` (Click uchun — `click_transactions`). Payme holatlari: 1 — yaratilgan, 2 — o'tkazilgan, -1/-2 — bekor qilingan. Payme `PerformTransaction` yoki Click `complete` kelmagan bo'lsa, kabinetdagi endpoint va `PAYME_KEY` ni tekshiring. Qo'lda tuzatishdan oldin to'lov tizimi kabinetida tranzaksiya holatini tasdiqlang.

**API kalit yoki admin token sizib chiqdi.**
- Tenant kaliti: dashboard → Sozlamalar → "Kalitni almashtirish" yoki `POST /admin/tenants/<id>/rotate-key`.
- Admin token: `.env` da yangilang va `$DC up -d`.
- `audit_log` ni tekshiring.

**Foydalanuvchi ma'lumotini o'chirishni so'radi.**
- Telegram'da `/forget` buyrug'i; boshqa kanallar uchun egasi dashboard'dan o'chiradi.
- Klon egasining hisobini butunlay o'chirish: `DELETE FROM tenants WHERE id = '<id>'`. Hamma narsa, jumladan ovoz, surat va videolar, kaskad bilan o'chadi. Ovoz klonini provayderdan (ElevenLabs) o'chirish uchun undan oldin dashboard'da rozilikni qaytarib oling.

**Klon soxta shaxs nomidan ishlayapti.** `GET /admin/reports`, keyin `POST /admin/clones/<id>/moderation {"status":"blocked","reason":"…"}`. Jiddiy holatda tenantning Telegram botini ham uzing.

## 6. Ma'lum cheklovlar

- **`CHANNEL_SECRET_KEY` almashtirib bo'lmaydi.** Tokenlarni yangi kalit bilan qayta shifrlash vositasi hali yo'q.
- **Rate limit har bir API jarayonida alohida xotirada.** Bir nechta API nusxasida umumiy limit uchun Redis yoki Valkey kerak.
- **Videolar va OCR fayllari Postgres'da saqlanadi.** Hajm oshganda S3 bilan mos obyekt xotiraga ko'chirish kerak.
- **Bitta serverli sxema** — yuqori mavjudlik (HA) uchun boshqariladigan Postgres va bir nechta API nusxasi kerak.
