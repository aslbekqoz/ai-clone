# 07 — Moliyaviy reja

Model: [`finance/model.py`](../finance/model.py) — taxminlarni o'zgartirib, `python3 finance/model.py` bilan qayta hisoblang. Natijalar: [`finance/summary.md`](../finance/summary.md), oylik jadval: [`finance/projection.csv`](../finance/projection.csv).

## Asosiy taxminlar

| Taxmin | Qiymat | Asos |
|---|---|---|
| 1-oy ro'yxatdan o'tishlar | 150 | Beta + design partnerlar auditoriyasi |
| Oylik o'sish | 1-yil 18%, 2-yil 9%, 3-yil 5% | Viral sikl + affiliate |
| Free → Paid | 7% | Freemium SaaS uchun odatiy 3–10% |
| Oylik churn | 8% → 3.5% | SMB SaaS uchun odatiy; mahsulot yetilishi bilan pasayadi |
| Tarif aralashmasi | Creator 60% / Pro 30% / Business 10% | |
| Bitta xabar narxi | $0.003 | `04-texnik-arxitektura.md` §8 |
| Klon monetizatsiyasi | 7-oydan; pullik egalarning 15% i, oyiga $220 GMV, 12% komissiya | Delphi modeli |
| Korporativ mijozlar | 13-oydan, har chorakda +2, $1 500/oy | |
| Aralash CAC | $35, pullik mijozlarning 45% i pullik kanaldan | |
| Jamoa | 2 asoschi → 12 kishi (36-oy), Toshkent bozor stavkalari | IT Park: 0% foyda solig'i, 7.5% JShDS |
| Boshlang'ich kassa | $150 000 | Pre-seed raundi |

## Natijalar (3 ssenariy)

| | Pessimistik | **Asosiy** | Optimistik |
|---|---|---|---|
| 1-yil daromad | $23k | **$50k** | $87k |
| 2-yil daromad | $194k | **$421k** | $799k |
| 3-yil daromad | $480k | **$1.26 mln** | $2.51 mln |
| 3-yil oxiri ARR | $621k | **$1.77 mln** | $3.63 mln |
| 3-yil oxiri pullik mijozlar | 758 | **3 389** | 7 607 |
| Yalpi marja (3-yil) | 80% | **77%** | 76% |
| Eng past kassa | $40k (22-oy) | **$96k (14-oy)** | $117k (10-oy) |
| Birinchi foydali oy | 23-oy | **15-oy** | 11-oy |

## Talqin

1. **$150k pre-seed hatto pessimistik ssenariyda ham 36 oyga yetadi** (eng past nuqta $40k) — bu O'zbekistondagi past jamoa xarajati va IT Park soliq imtiyozlari natijasi. Bu kompaniyani investorlar uchun xavfi past qiladi.
2. Model ataylab **"tejamkor" (lean)** — marketing xarajati kam. Seed raundi ($1–1.5 mln, 12–18-oy) olinsa, foyda o'rniga o'sishga sarflanadi: global hujayra, MDH bozorlari, kuchliroq jamoa. Bunda maqsad — 3-yil oxirida $5 mln+ ARR.
3. **Eng sezgir taxminlar:** Free→Paid konversiya va churn. Konversiya 7% → 4.5% va churn 3.5% → 5% bo'lsa (pessimistik), 3-yil daromadi 2.6 barobar kamayadi. Shuning uchun birinchi 6 oyning asosiy vazifasi — aynan shu ikki metrikani o'lchash va yaxshilash.
4. **Ovoz va video** modelga alohida daromad sifatida kiritilmagan (konservativ) — ular qo'shimcha paketlar sifatida yuqoriga qarab xavf (upside).

## Mablag'dan foydalanish (pre-seed $150 000, 18 oy)

| Yo'nalish | Ulush | Summa |
|---|---|---|
| Jamoa (dasturchilar, growth, CS) | 60% | $90 000 |
| Infratuzilma va AI API | 12% | $18 000 |
| Marketing va bloger hamkorliklari | 18% | $27 000 |
| Huquqiy (yurist xulosasi, IT Park, shartnomalar, brend) | 5% | $7 500 |
| Zaxira | 5% | $7 500 |

## Kuzatiladigan moliyaviy KPI'lar (oylik)

MRR va o'sish %, yangi / churn / expansion MRR, ARPU, yalpi marja (tenant bo'yicha), CAC (kanal bo'yicha), LTV/CAC, burn rate, runway (oylar), xabar boshiga narx.
