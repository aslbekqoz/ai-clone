// Ommaviy klonlar katalogi (aiclone.uz/explore): serverda chiziladi — JS'siz ishlaydi va qidiruv tizimlari indekslaydi.
import { CATEGORIES, type Category, type MarketplaceCard } from "@ai-clone/db";

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
const som = (n: number) => n.toLocaleString("ru-RU").replace(/,/g, " ").replace(/[\u00a0\u202f]/g, " ");
const LANGS: Record<string, string> = { uz: "O'zbek", "uz-cyrl": "Ўзбек", ru: "Русский", en: "English" };

export const PAGE_SIZE = 24;

function card(c: MarketplaceCard): string {
  const meta = [
    CATEGORIES[c.category],
    c.languages.map((l) => LANGS[l] ?? l).join(" · "),
    c.rating ? `👍 ${Math.round(c.rating.positive * 100)}% (${c.rating.votes})` : null,
    c.priceFromUzs ? `${som(c.priceFromUzs)} so'mdan` : "Bepul",
  ].filter(Boolean);
  return `<a class="card" href="/c/${esc(c.slug)}"><h2>${esc(c.name)}</h2><p>${esc(c.tagline)}</p><small>${meta.map((m) => esc(String(m))).join(" · ")}</small></a>`;
}

export function exploreHtml(cards: MarketplaceCard[], opts: { q: string; category: Category | null; page: number; hasMore: boolean }): string {
  const link = (over: Partial<{ q: string; category: Category | null; page: number }>) => {
    const p = { q: opts.q, category: opts.category, page: 1, ...over };
    const qs = new URLSearchParams();
    if (p.q) qs.set("q", p.q);
    if (p.category) qs.set("category", p.category);
    if (p.page > 1) qs.set("page", String(p.page));
    const s = qs.toString();
    return `/explore${s ? `?${s}` : ""}`;
  };
  const chips = [`<a class="chip${opts.category ? "" : " on"}" href="${esc(link({ category: null }))}">Hammasi</a>`]
    .concat((Object.keys(CATEGORIES) as Category[]).map((k) => `<a class="chip${opts.category === k ? " on" : ""}" href="${esc(link({ category: k }))}">${CATEGORIES[k]}</a>`))
    .join("");
  const list = cards.length
    ? `<div class="grid">${cards.map(card).join("")}</div>`
    : `<p class="empty">${opts.q || opts.category ? "Hech narsa topilmadi. So'rovni o'zgartirib ko'ring." : "Katalog hozircha bo'sh."}</p>`;
  const pager = [
    opts.page > 1 ? `<a href="${esc(link({ page: opts.page - 1 }))}">← Oldingi</a>` : "",
    opts.hasMore ? `<a href="${esc(link({ page: opts.page + 1 }))}">Keyingi →</a>` : "",
  ].join("");
  return `<!doctype html>
<html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI-klonlar katalogi</title><meta name="description" content="Ustozlar, mutaxassislar va blogerlarning AI-klonlari: savol bering — ular o'z materiallari asosida javob beradi.">
<style>
:root{--ink:#16130f;--bone:#f6f1e7;--line:#d9d0bf;--accent:#b4441c;--muted:#6f675b}
*{box-sizing:border-box}body{margin:0;background:var(--bone);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1040px;margin:0 auto;padding:32px 16px 48px}
h1{font:700 clamp(30px,6vw,48px)/1.05 Georgia,"Times New Roman",serif;margin:0 0 8px}
.lead{margin:0 0 20px;color:var(--muted)}
form{display:flex;gap:8px;margin-bottom:14px}
input{flex:1;min-width:0;border:1px solid var(--line);border-radius:10px;padding:11px 12px;font:inherit;background:#fff;color:var(--ink)}
button{border:0;border-radius:10px;padding:0 18px;background:var(--ink);color:var(--bone);font:inherit;cursor:pointer}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:22px}
.chip{padding:5px 12px;border:1px solid var(--line);border-radius:999px;color:var(--ink);text-decoration:none;font-size:14px;background:#fff}
.chip.on{background:var(--ink);color:var(--bone);border-color:var(--ink)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:14px}
.card{display:flex;flex-direction:column;gap:6px;padding:16px;border:1px solid var(--line);border-radius:14px;background:#fff;color:inherit;text-decoration:none;min-width:0}
.card:hover{border-color:var(--ink)}
.card h2{margin:0;font:600 19px/1.25 Georgia,"Times New Roman",serif}
.card p{margin:0;flex:1}
.card small{color:var(--muted);font-size:13px}
.empty{color:var(--muted)}
.pager{display:flex;justify-content:space-between;margin-top:22px}.pager a{color:var(--accent)}
footer{margin-top:36px;font-size:13px;color:var(--muted)}footer a{color:inherit}
</style></head>
<body><main>
<h1>AI-klonlar katalogi</h1>
<p class="lead">Ustozlar, mutaxassislar va blogerlarning AI-klonlari. Har bir javob egasining o'z materiallariga asoslanadi.</p>
<form method="get" action="/explore" role="search">${opts.category ? `<input type="hidden" name="category" value="${esc(opts.category)}">` : ""}<input name="q" value="${esc(opts.q)}" placeholder="Masalan: IELTS, marketing, fitnes" maxlength="100" aria-label="Qidiruv"><button type="submit">Qidirish</button></form>
<nav class="chips" aria-label="Kategoriyalar">${chips}</nav>
${list}
<div class="pager">${pager}</div>
<footer>Klonlar AI tomonidan javob beradi va xato qilishi mumkin. <a href="https://aiclone.uz">O'z kloningizni yarating →</a></footer>
</main></body></html>`;
}
