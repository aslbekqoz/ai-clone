"""AI Clone — 36 oylik moliyaviy model.

Ishga tushirish:  python3 finance/model.py
Natija:           finance/projection.csv va finance/summary.md

Barcha taxminlar ASSUMPTIONS lug'atida. Ularni o'zgartirib, qayta ishga tushiring.
Summalar AQSh dollarida (USD).
"""

import csv
import os

ASSUMPTIONS = {
    "months": 36,
    # Ro'yxatdan o'tishlar (yangi klon egalari) — 1-oy va oylik o'sish
    "signups_m1": 150,
    "signup_growth_y1": 0.18,  # 1-yil: oyiga +18% (Telegram blogerlar orqali viral)
    "signup_growth_y2": 0.09,
    "signup_growth_y3": 0.05,
    "free_to_paid": 0.07,  # ro'yxatdan o'tganlarning qancha qismi pullikka o'tadi
    "monthly_churn_start": 0.08,
    "monthly_churn_floor": 0.035,
    "churn_improvement_per_month": 0.0015,
    # Tariflar: (oylik narx USD, ulush, o'rtacha oylik xabarlar)
    "plans": {
        "Creator": (15, 0.60, 900),
        "Pro": (39, 0.30, 3000),
        "Business": (119, 0.10, 9000),
    },
    # Klon monetizatsiyasi (obunachilar klonga to'laydi) — v1 dan, 7-oydan
    "monetization_start_month": 7,
    "monetizing_share_of_paid": 0.15,  # pullik egalarning necha foizi klonini sotadi
    "gmv_per_monetizing_owner": 220,  # oyiga o'rtacha GMV, USD
    "take_rate": 0.12,
    # Korporativ (white-label / API) — 13-oydan
    "enterprise_start_month": 13,
    "enterprise_new_per_quarter": 2,
    "enterprise_mrr": 1500,
    # Xarajatlar
    "cost_per_message": 0.003,  # LLM + rerank + embedding + STT, 80/20 model routing, 30% kesh (04-hujjat §8)
    "infra_fixed": 400,  # oylik server, monitoring, xizmatlar
    "infra_per_paid_user": 0.6,
    "payment_fee": 0.03,  # Payme/Click/Stripe komissiyasi
    "cac_paid_blended": 35,  # bitta pullik mijozni jalb qilish narxi
    "paid_marketing_share": 0.45,  # pullik mijozlarning qanchasi pullik marketingdan keladi
    # Jamoa (oylik, USD, Toshkent bozor stavkalari + soliq)
    "team": [
        # (lavozim, oylik, boshlanish oyi)
        ("CEO / Product (asoschi)", 1200, 1),
        ("CTO / Full-stack (asoschi)", 1200, 1),
        ("Full-stack dasturchi", 1800, 3),
        ("Growth / SMM menejer", 900, 4),
        ("Customer success (UZ/RU)", 700, 7),
        ("ML / AI muhandis", 2500, 10),
        ("Full-stack dasturchi #2", 2000, 13),
        ("Sotuv menejeri (B2B)", 1200, 13),
        ("Dizayner (UI/UX)", 1300, 16),
        ("Customer success #2", 700, 19),
        ("Backend / DevOps", 2500, 22),
        ("Marketing lead", 1800, 25),
    ],
    "overhead_per_employee": 150,  # ofis/coworking, kompyuter, dasturlar
    "starting_cash": 150_000,  # pre-seed raundidan keyin
}


# Ssenariylar: asosiy taxminlarga qo'llaniladigan o'zgarishlar
SCENARIOS = {
    "Pessimistik": {"signup_growth_y1": 0.11, "signup_growth_y2": 0.06, "free_to_paid": 0.045,
                    "monthly_churn_floor": 0.05, "cac_paid_blended": 55},
    "Asosiy": {},
    "Optimistik": {"signup_growth_y1": 0.24, "free_to_paid": 0.09, "monthly_churn_floor": 0.03},
}


def signups_for(month, a):
    s = a["signups_m1"]
    for m in range(2, month + 1):
        if m <= 12:
            g = a["signup_growth_y1"]
        elif m <= 24:
            g = a["signup_growth_y2"]
        else:
            g = a["signup_growth_y3"]
        s *= 1 + g
    return s


def run(a=ASSUMPTIONS):
    rows = []
    paid = {p: 0.0 for p in a["plans"]}
    enterprise = 0
    cash = a["starting_cash"]
    churn = a["monthly_churn_start"]
    total_signups = 0.0

    for m in range(1, a["months"] + 1):
        signups = signups_for(m, a)
        total_signups += signups
        new_paid = signups * a["free_to_paid"]

        for p, (_, share, _) in a["plans"].items():
            paid[p] = paid[p] * (1 - churn) + new_paid * share
        churn = max(a["monthly_churn_floor"], churn - a["churn_improvement_per_month"])

        if m >= a["enterprise_start_month"] and (m - a["enterprise_start_month"]) % 3 == 0:
            enterprise += a["enterprise_new_per_quarter"]

        paid_total = sum(paid.values())
        subs_mrr = sum(paid[p] * price for p, (price, _, _) in a["plans"].items())
        ent_mrr = enterprise * a["enterprise_mrr"]

        gmv = 0.0
        if m >= a["monetization_start_month"]:
            gmv = paid_total * a["monetizing_share_of_paid"] * a["gmv_per_monetizing_owner"]
        take = gmv * a["take_rate"]

        revenue = subs_mrr + ent_mrr + take

        messages = sum(paid[p] * msgs for p, (_, _, msgs) in a["plans"].items())
        messages += (total_signups - paid_total) * 0.15 * 60  # faol free foydalanuvchilar
        messages += enterprise * 40_000
        cogs = (
            messages * a["cost_per_message"]
            + a["infra_fixed"]
            + paid_total * a["infra_per_paid_user"]
            + revenue * a["payment_fee"]
        )
        gross_profit = revenue - cogs

        headcount = [t for t in a["team"] if t[2] <= m]
        payroll = sum(t[1] for t in headcount)
        overhead = len(headcount) * a["overhead_per_employee"]
        marketing = new_paid * a["paid_marketing_share"] * a["cac_paid_blended"] + 300

        opex = payroll + overhead + marketing
        net = gross_profit - opex
        cash += net

        rows.append(
            {
                "oy": m,
                "yangi_royxat": round(signups),
                "pullik_mijozlar": round(paid_total),
                "korporativ": enterprise,
                "obuna_mrr": round(subs_mrr),
                "korporativ_mrr": round(ent_mrr),
                "klon_gmv": round(gmv),
                "komissiya_daromad": round(take),
                "jami_daromad": round(revenue),
                "xabarlar": round(messages),
                "tannarx_cogs": round(cogs),
                "yalpi_marja_%": round(100 * gross_profit / revenue, 1) if revenue else 0,
                "jamoa_soni": len(headcount),
                "ish_haqi": payroll,
                "marketing": round(marketing),
                "sof_foyda": round(net),
                "kassa": round(cash),
            }
        )
    return rows


def yearly(rows, y):
    r = rows[(y - 1) * 12 : y * 12]
    rev = sum(x["jami_daromad"] for x in r)
    return {
        "daromad": rev,
        "arr_oxiri": r[-1]["jami_daromad"] * 12,
        "pullik": r[-1]["pullik_mijozlar"],
        "jamoa": r[-1]["jamoa_soni"],
        "marja": round(100 * (1 - sum(x["tannarx_cogs"] for x in r) / max(1, rev)), 1),
        "sof": sum(x["sof_foyda"] for x in r),
        "kassa": r[-1]["kassa"],
    }


LABELS = [
    ("Yillik daromad (USD)", "daromad"),
    ("Yil oxiridagi ARR (USD)", "arr_oxiri"),
    ("Yil oxiridagi pullik mijozlar", "pullik"),
    ("Yalpi marja, %", "marja"),
    ("Jamoa (yil oxiri)", "jamoa"),
    ("Sof foyda / zarar (USD)", "sof"),
    ("Yil oxiridagi kassa (USD)", "kassa"),
]


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    lines = [
        "# Moliyaviy model natijalari (avtomatik yaratilgan)",
        "",
        "`python3 finance/model.py` tomonidan yaratildi. Taxminlar: `finance/model.py` ichidagi "
        "`ASSUMPTIONS` va `SCENARIOS`. Oylik batafsil jadval (asosiy ssenariy): `finance/projection.csv`.",
        "",
    ]
    for name, overrides in SCENARIOS.items():
        rows = run({**ASSUMPTIONS, **overrides})
        if name == "Asosiy":
            with open(os.path.join(here, "projection.csv"), "w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
                w.writeheader()
                w.writerows(rows)
        ys = [yearly(rows, y) for y in (1, 2, 3)]
        min_cash = min(rows, key=lambda x: x["kassa"])
        breakeven = next((x["oy"] for x in rows if x["sof_foyda"] > 0), None)
        lines += [f"## {name} ssenariy", "", "| Ko'rsatkich | 1-yil | 2-yil | 3-yil |", "|---|---|---|---|"]
        for label, k in LABELS:
            lines.append(f"| {label} | " + " | ".join(f"{y[k]:,}" for y in ys) + " |")
        lines += [
            "",
            f"- Eng past kassa: **{min_cash['kassa']:,} USD** ({min_cash['oy']}-oyda)",
            f"- Birinchi foydali oy: **{breakeven}-oy**" if breakeven else "- 36 oy ichida foydaga chiqilmaydi",
            "",
        ]
    with open(os.path.join(here, "summary.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
