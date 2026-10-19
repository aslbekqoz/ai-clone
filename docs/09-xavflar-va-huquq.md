# 09 — Xavflar, huquqiy masalalar va etika

## Xavflar matritsasi

| # | Xavf | Ehtimol | Ta'sir | Yumshatish choralari |
|---|---|---|---|---|
| R1 | **Klon noto'g'ri yoki zararli javob beradi** (gallyutsinatsiya) — egasining obro'siga putur | O'rta | Yuqori | Grounded rejim, iqtiboslar, faithfulness darvozasi ≥ 0.9, xavfli mavzularda eskalatsiya, egasi tuzatishlari → tasdiqlangan javoblar |
| R2 | **Telegram / Meta platforma xavfi** (API cheklovlari, siyosat o'zgarishi, Telegram o'zi AI funksiyalarini chiqarishi) | O'rta | Yuqori | Ko'p kanallilik (web vidjet, ommaviy klon sahifasi — o'z kanalimiz), qiymat "bot"da emas — bilim, uslub, monetizatsiya va analitikada |
| R3 | **Global raqobatchi lokalizatsiya qiladi** (Delphi va b.) | Past–O'rta | O'rta | Mahalliy to'lovlar, UZ ma'lumot mahalliylashtirish, o'zbek tili sifati, narx, mahalliy hamjamiyat va affiliate tarmog'i — tez nusxa olib bo'lmaydigan ustunliklar |
| R4 | **LLM narxi yoki mavjudligi** (provayder narxni oshiradi, bloklaydi) | Past | O'rta | Provayderdan mustaqil yadro, fallback, ochiq modellar uchun suveren variant |
| R5 | **Deepfake / boshqa shaxs nomidan klon** (firibgarlik) | O'rta | Juda yuqori | Kreator verifikatsiyasi, ovoz uchun jonli rozilik, taniqli shaxslar blocklisti, watermark, shikoyat tugmasi, tezkor o'chirish |
| R6 | **Huquqiy noaniqlik** (biometrik ma'lumot, chegaradan tashqari uzatish) | O'rta | Yuqori | Biometrik ma'lumotlar faqat UZ serverda, yurist xulosasi, PII niqoblash, rozilik matnlari, shaxsiy ma'lumotlar reyestrida ro'yxat |
| R7 | **O'zbek TTS sifati yetarli emas** | Yuqori | O'rta | MVP ovozsiz; v1 da bir nechta provayder A/B testi; ovoz — qo'shimcha, asosiy qiymat emas |
| R8 | **Past to'lovga tayyorlik** (mahalliy kreatorlar oyiga $15 to'lamaydi) | O'rta | Yuqori | Bosqich 0 da oldindan to'lov bilan tekshirish; klon monetizatsiyasi orqali "o'zini qoplaydigan" taklif; so'mda narx; yillik chegirma |
| R9 | **Asoschilar va jamoa xavfi** (kuchli ML/AI muhandisni topish) | O'rta | O'rta | Erta opsion (ESOP) puli, IT Park / universitet hamkorliklari, masofaviy MDH mutaxassislari |
| R10 | **Xavfsizlik buzilishi** (tenantlararo ma'lumot sizishi) | Past | Juda yuqori | RLS, CI'da sizib chiqish testlari, shifrlash, 24/72 soatlik incident jarayoni, pentest (v1 dan oldin) |

## Huquqiy nazorat ro'yxati (launch'dan oldin)

### Kompaniya
- [ ] MChJ ro'yxatdan o'tkazish (asoschilar ulushi, vesting — 4 yil, 1 yil cliff)
- [ ] IT Park rezidentligi (0% foyda solig'i, 0% ijtimoiy soliq, 7.5% JShDS, daromaddan 1% IT Parkka — 2028-yilgacha; >50% eksport bilan 2040-yilgacha) — [IT Park](https://www.it-park.uz/en/itpark/news/useful-guide-what-support-programs-does-it-park-provide)
- [ ] Intellektual mulk: barcha kod va brend kompaniyaga o'tkazilgani haqida asoschilar shartnomasi
- [ ] Tovar belgisini ro'yxatdan o'tkazish (UZ, keyin Madrid tizimi)
- [ ] Global to'lovlar va investitsiya uchun keyinchalik xorijiy holding (masalan, Delaware C-Corp yoki AIFC/Astana Hub) — seed raundidan oldin yurist bilan

### Ma'lumotlar va maxfiylik
- [ ] Shaxsiy ma'lumotlar bazalari davlat reyestrida ro'yxatdan o'tish (ZRU-547)
- [ ] Biometrik ma'lumotlar (ovoz, yuz) faqat UZ serverlarda — arxitekturada ta'minlangan
- [ ] Maxfiylik siyosati va foydalanish shartlari (UZ/RU/EN)
- [ ] Klon egasi bilan DPA (biz — qayta ishlovchi, egasi — operator)
- [ ] Obunachi uchun rozilik matni (bot start xabari, vidjet)
- [ ] Ma'lumot buzilishi jarayoni: 24 soatda xabarnoma, 72 soatda hisobot
- [ ] LLM provayderlari bilan DPA va zero-retention sozlamalari

### AI va kontent
- [ ] Har bir kanalda "AI-klon" oshkoraligi — EU AI Act 50-modda (2026-yil 2-avgustdan; yevropalik foydalanuvchilar uchun ham amal qiladi, jarima €15 mln yoki aylanmaning 3% igacha) — [Faegre Drinker](https://www.faegredrinker.com/en/insights/publications/2026/7/eu-ai-act-commission-confirms-transparency-code-of-practice-as-adequate-and-publishes-final-version-of-its-guidelines-on-transparency-obligations)
- [ ] AI generatsiya qilingan audio/videoga mashina o'qiy oladigan belgi (watermark)
- [ ] Ovoz/qiyofa klonlash roziligi: shaxsni tasdiqlash, jonli rozilik iborasi, yozma va qaytarib olinadigan rozilik, faqat hisob egasi, audit log
- [ ] Taqiqlangan foydalanish siyosati (AUP): boshqa shaxs nomidan, siyosiy dezinformatsiya, tibbiy/huquqiy maslahatni professional sifatida taqdim etish va h.k.
- [ ] Klon egasining javobgarligi: klon javoblari egasining nomidan — shartnomada aniq belgilash

## Etika tamoyillari (ommaviy e'lon qilinadi)

1. **Shaffoflik:** klon hech qachon o'zini inson deb ko'rsatmaydi.
2. **Rozilik:** hech kimning ovozi, yuzi yoki nomi uning roziligisiz klonlanmaydi.
3. **Nazorat:** egasi har bir suhbatni ko'radi va istalgan vaqtda klonni o'chiradi; o'chirish — haqiqiy o'chirish.
4. **Ma'lumotlarga hurmat:** yuklangan bilim va suhbatlar umumiy modellarni o'qitishga ishlatilmaydi.
5. **Xavfsizlik birinchi:** tibbiy, huquqiy, moliyaviy va ruhiy salomatlik mavzularida klon ehtiyotkor va insonga yo'naltiradi.
