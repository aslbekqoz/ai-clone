// Taqdimotdagi har bir raqamni data/data.json va data/faktlar_va_manbalar.md bilan solishtiradi.
// Tekshiriladi: slaydlardagi ko‘rinadigan matn (grafik yorliqlari va jadvallar ham), ssenariy (NOTES).
// Ruxsat etilgan raqamlar: (1) faktlar faylidagi barcha raqamlar, (2) data.json qatorlaridan
// to‘g‘ridan-to‘g‘ri hisoblanadigan qiymatlar (qiymat, ulush, o‘sish, CAGR, nisbat, farq).
// Qo‘shimcha: ASCII apostrof (') va minus o‘rniga defis ishlatilganini ham topadi.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const D = JSON.parse(fs.readFileSync(path.join(root, 'data/data.json'), 'utf8'));
const facts = fs.readFileSync(path.join(root, 'data/faktlar_va_manbalar.md'), 'utf8');

const norm = (t) => t.replace(/[\s\u00A0\u202F]/g, '').replace(/[−+-]/g, '').replace(',', '.').replace(/^0+(?=\d)/, '');
// Ikki daraja: TEXT — slayd matni va ssenariy uchun (faktlar + 2000/2025 qiymatlari va 25 yillik
// hisob-kitoblar + real o‘sish); YEAR — data.json'dan avtomatik chiziladigan grafik va jadvallar uchun
// (barcha yillik qiymatlar). Matndagi raqam faqat TEXT to‘plamidan bo‘lishi mumkin.
const TEXT = new Map(), YEAR = new Map();
const add = (set, v, why, decs) => {
  if (v == null || !Number.isFinite(v)) return;
  for (const d of decs) {
    for (const r of [Math.abs(v).toFixed(d), Math.max(0, Math.abs(v) - 1e-9 * 10 ** -d).toFixed(d)]) {
      const k = norm(r);
      if (!set.has(k)) set.set(k, why);
    }
  }
};
const both = (v, why, decs) => { add(TEXT, v, why, decs); add(YEAR, v, why, decs); };

// (1) faktlar fayli
const NUM = /\d{1,3}(?:[ \u00A0]\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g;
for (const m of facts.matchAll(NUM)) { TEXT.set(norm(m[0]), 'faktlar_va_manbalar.md'); YEAR.set(norm(m[0]), 'faktlar_va_manbalar.md'); }

// (2) data.json dan hisoblanadiganlar. units: [bo‘luvchi, kasr xonalari]
const n = D.years.length - 1;
const S = [];
for (const k in D.nominal) S.push([`nominal.${k}`, D.nominal[k], [[1000, [0, 1]], [1e6, [1, 2]]]]);
for (const k in D.share) S.push([`share.${k}`, D.share[k], [[1, [1, 2]]]]);
for (const k in D.realidx) S.push([`realidx.${k}`, D.realidx[k], [[1, [1]]]]);
for (const k in D.emp) S.push([`emp.${k}`, D.emp[k], [[1, [0]], [1000, [1, 2]]]]);
for (const k in D.sub) S.push([`sub.${k}`, D.sub[k], [[1000, [0, 1]], [1e6, [2]]]]);
S.push(['emp.serv/total, %', D.emp.serv.map((v, i) => (v / D.emp.total[i]) * 100), [[1, [1]]]]);
for (const [name, a, units] of S) {
  const first = a[0], last = a[n];
  a.forEach((v, i) => {
    for (const [div, decs] of units) {
      add(YEAR, v / div, `${name} (${D.years[i]})`, decs);
      if (i === 0 || i === n) add(TEXT, v / div, `${name} (${D.years[i]})`, decs);
    }
    if (i) {
      const g = (v / a[i - 1] - 1) * 100;
      add(YEAR, g, `${name} o‘sish ${D.years[i]}`, [1]);
      if (!name.startsWith('emp') && !name.startsWith('share')) add(TEXT, g, `${name} o‘sish ${D.years[i]}`, [1]);
    }
  });
  both((last / first - 1) * 100, `${name}: 2000–2025 o‘zgarish, %`, [0, 1]);
  both(((last / first) ** (1 / n) - 1) * 100, `${name}: CAGR`, [2]);
  both(last / first, `${name}: 2025/2000 nisbat`, [1]);
  for (const [div, decs] of units) both((last - first) / div, `${name}: 2025−2000 farq`, decs);
}
both((D.nominal.constr[n] / D.nominal.constr[0]) / (D.realidx.constr[n] / 100), 'qurilish narxi (deflyator) nisbati', [1]);
for (const k of ['agri', 'ind', 'serv', 'constr']) both(D.nominal[k][n] / D.emp[k][n], `QQ/xodim ${k}, ming $`, [0]);
for (const grp in D.worldbank) for (const y of ['2000', '2025']) both(D.worldbank[grp][y], `worldbank.${grp} ${y}`, [1]);
for (const k of ['agri', 'ind', 'serv', 'constr']) {
  let up = 0, bo = 0;
  for (let i = 1; i <= n; i++) if (D.realidx[k][i] > D.realidx[k][i - 1]) { up++; if (D.emp[k][i] > D.emp[k][i - 1]) bo++; }
  both(up, `real o‘sgan yillar (${k})`, [0]); both(bo, `bandlik ham o‘sgan yillar (${k})`, [0]);
}

// raqamni ajratish va "hisoblagich" (oddiy son) ekanini aniqlash
const TOKEN = /[−+-]?\d{1,3}(?:[  ]\d{3})+(?:,\d+)?|[−+-]?\d+(?:,\d+)?/g;
const UNIT = /^\s*(%|\$|mln|mlrd|trln|ming|foiz|f\.p\.|barobar|km|akr|mlrd t|m³)/;
function classify(tok, after, before) {
  const plain = tok.replace(/^[−+-]/, '');
  const isInt = /^\d+$/.test(plain);
  const v = parseInt(plain, 10);
  if (isInt && plain.length === 4 && v >= 1990 && v <= 2031 && !UNIT.test(after)) return 'yil';
  if (isInt && v <= 30 && !UNIT.test(after) && !/[×~<>]\s*$/.test(before)) return 'hisob';
  if (/^\d{2}\.\d{2}\.\d{4}/.test(tok + after)) return 'sana';
  return null;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('file://' + path.join(root, 'taqdimot/index.html') + '?print');
  await page.waitForFunction(() => window.__ready === true);
  await page.waitForTimeout(500);
  const texts = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.slide').forEach((s, i) => {
      if (s.hasAttribute('data-nocheck')) return;
      const parts = [], gen = [];
      const walk = (node, buf) => {
        if (node.nodeType === 3) { buf.push(node.nodeValue); return; }
        if (node.nodeType !== 1) return;
        if (node.matches('.grid, .axis, .unit, .speaker, .sign .tab, script')) return; // o‘q belgilari va birligi, slayd raqami
        if (node.matches('.chart, [data-table], .apx-wrap')) buf = gen; // data.json'dan chiziladiganlar
        node.childNodes.forEach((c) => walk(c, buf));
        buf.push(/^(P|LI|TD|TH|DIV|H\d|SMALL|DD|DT|text)$/i.test(node.tagName) ? '\n' : ' ');
      };
      walk(s, parts);
      // ilova: har bir ko‘rsatkich tugmasini bosib, barcha jadvallarni tekshiramiz
      s.querySelectorAll('.tabs button').forEach((b) => { b.click(); walk(s.querySelector('.apx-wrap'), gen); });
      out.push({ where: `${i + 1}-slayd`, text: parts.join(''), gen: false });
      out.push({ where: `${i + 1}-slayd (grafik/jadval)`, text: gen.join(''), gen: true });
    });
    for (const [id, nt] of Object.entries(window.NOTES)) out.push({ where: `ssenariy:${id}`, text: nt.text, gen: false });
    return out;
  });
  await browser.close();

  let checked = 0;
  const bad = [], style = [];
  const report = [];
  for (const { where, text, gen } of texts) {
    const set = gen ? YEAR : TEXT;
    for (const line of text.split('\n')) {
      if (/'/.test(line)) style.push(`${where}: ASCII apostrof — "${line.trim().slice(0, 60)}"`);
      if (/(^|[\s(:;])-\d/.test(line)) style.push(`${where}: minus o‘rniga defis — "${line.trim().slice(0, 60)}"`);
      if (/\d\.\d/.test(line.replace(/\d{2}\.\d{2}\.\d{4}/g, '').replace(/\d+\.\d+[A-Z]/g, ''))) style.push(`${where}: o‘nlik nuqta bilan — "${line.trim().slice(0, 60)}"`);
      for (const m of line.matchAll(TOKEN)) {
        const tok = m[0];
        const after = line.slice(m.index + tok.length, m.index + tok.length + 8);
        const before = line.slice(Math.max(0, m.index - 2), m.index);
        if (/\d\/$/.test(before) || /^\/\d/.test(after)) {
          // "22/23" — har ikki son hisoblangan qiymatlar orasida bo‘lishi kerak
        } else if (classify(tok, after, before)) continue;
        checked++;
        const src = set.get(norm(tok));
        if (!src) bad.push(`${where}: ${tok}   …${line.trim().slice(Math.max(0, m.index - 30), m.index + 40)}…`);
        else if (!gen) report.push(`${where}\t${tok}\t${src}`);
      }
    }
  }
  console.log(`Tekshirilgan raqamlar: ${checked}`);
  console.log(`Matn uchun ruxsat etilgan qiymatlar: ${TEXT.size}; grafik/jadval uchun: ${YEAR.size}`);
  fs.writeFileSync(path.join(root, 'tools/tekshiruv_hisoboti.tsv'), 'joy\traqam\tmanba\n' + [...new Set(report)].join('\n') + '\n');
  console.log('Matndagi har bir raqam va uning manbai: tools/tekshiruv_hisoboti.tsv');
  if (style.length) console.log('\nYozuv qoidalari buzilgan joylar:\n' + style.join('\n'));
  if (bad.length) {
    console.log(`\nMANBADA TOPILMADI (${bad.length}):\n` + bad.join('\n'));
    process.exitCode = 1;
  } else console.log('\nNatija: barcha raqamlar data.json yoki faktlar_va_manbalar.md bilan mos.');
})();
