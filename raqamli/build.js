// 13-mavzu: "Raqamli infratuzilmaning mehnat unumdorligiga ta’sir mexanizmi" — PowerPoint taqdimot (15 slayd).
// Ma’lumotlar: raqamli/data/data.json (Jahon banki WDI). Talaba tahlilidagi regressiyalar shu yerda hisoblanadi.
// Ishga tushirish: npm run raqamli   (build + ../tools/pptx-animate.py bosish animatsiyalari)
const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');

const D = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/data.json'), 'utf8'));
const OUT = process.argv[2] || path.join(__dirname, 'raqamli-infratuzilma.pptx');
const SKILL_THEME = process.env.APPLY_THEME;

/* ---------- mavzu: "optik tola" ---------- */
const HEX = {
  ink: '0F172A', muted: '4B5563', rule: 'D5DAE1', bg: 'F5F7FA', card: 'E8EEF5', src: '6B7280',
  fiber: '0A84C1', fiber2: '7DD3FC', navy: '0F1B33', uzb: 'E8590C', uzbT: 'C2410C', gray: '9AA4B2',
  green: '15803D', red: 'C62828', amber: 'F2A900',
};
const THEME = {
  name: 'Optik tola', headFontFace: 'IBM Plex Sans', bodyFontFace: 'Cambria',
  colors: { dk1: HEX.ink, lt1: 'FFFFFF', dk2: HEX.muted, lt2: HEX.bg, accent1: HEX.fiber, accent2: HEX.uzb, accent3: HEX.green, accent4: HEX.navy, accent5: HEX.fiber2, accent6: HEX.red, hlink: HEX.fiber, folHlink: HEX.muted },
};
const HEAD = '+mj-lt';
const W = 13.333, X0 = 0.6;

/* ---------- raqamlar ---------- */
function fmt(v, dec = 1, plus = false) {
  const s = Math.max(0, Math.abs(v) - 1e-9 * 10 ** -dec).toFixed(dec);
  const [i, f] = s.split('.');
  let out = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (f ? ',' + f : '');
  if (Number(s) !== 0) { if (v < 0) out = '−' + out; else if (plus) out = '+' + out; }
  return out;
}
const Y = D.years, n = Y.length - 1;
const last = (a) => a[a.length - 1];
const cagr = (a) => ((last(a) / a[0]) ** (1 / n) - 1) * 100;
function ols(x, y) {
  const m = x.length, mx = x.reduce((a, b) => a + b) / m, my = y.reduce((a, b) => a + b) / m;
  let sxx = 0, sxy = 0, sst = 0;
  x.forEach((xi, i) => { sxx += (xi - mx) ** 2; sxy += (xi - mx) * (y[i] - my); sst += (y[i] - my) ** 2; });
  const b = sxy / sxx, a = my - b * mx;
  const sse = y.reduce((s, yi, i) => s + (yi - (a + b * x[i])) ** 2, 0);
  return { a, b, r2: 1 - sse / sst, t: b / Math.sqrt(sse / (m - 2) / sxx), n: m };
}
const corr = (x, y) => Math.sqrt(ols(x, y).r2) * Math.sign(ols(x, y).b);
const U = { net: D.internet.UZB, bb: D.broadband.UZB, prod: D.productivity.UZB };
const ln = Math.log;
const TS = ols(U.net.map(ln), U.prod.map(ln)); // elastiklik
const TSB = ols(U.bb.map(ln), U.prod.map(ln));
const CS_KEYS = Object.keys(D.cross2023);
const CS = ols(CS_KEYS.map((k) => D.cross2023[k][0]), CS_KEYS.map((k) => ln(D.cross2023[k][1])));
const csEffect = (Math.exp(10 * CS.b) - 1) * 100;
const uzPred = Math.exp(CS.a + CS.b * D.cross2023.UZB[0]);
const uzGap = (D.cross2023.UZB[1] / uzPred - 1) * 100;
const R = {
  netA: U.net[0], netB: last(U.net), bbA: U.bb[0], bbB: last(U.bb), bbX: last(U.bb) / U.bb[0],
  prodA: U.prod[0], prodB: last(U.prod), prodG: (last(U.prod) / U.prod[0] - 1) * 100, prodC: cagr(U.prod),
  wProd: last(D.productivity.WLD), wBB: last(D.broadband.WLD),
};
console.log({ TS: [TS.b, TS.r2, TS.t], TSB: [TSB.b, TSB.r2], CS: [CS.b, CS.r2, CS.t, csEffect], uzPred, uzGap, corr: corr(U.net, U.prod) });

/* ---------- taqdimot ---------- */
const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';
pres.title = 'Raqamli infratuzilma va mehnat unumdorligi';
pres.subject = '13-mavzu: Raqamli infratuzilmaning mehnat unumdorligiga ta’sir mexanizmi';
pres.author = 'Qo‘ziboyev Aslbek';
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;
const TOTAL = 15;
pres.defineSlideMaster({ title: 'MUQOVA', background: { color: HEX.navy } });
pres.defineSlideMaster({
  title: 'MAZMUN', background: { color: HEX.bg },
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: X0, y: 0.42, w: 8.2, h: 1.05, align: 'left', fontFace: THEME.headFontFace, fontSize: 28, bold: true, color: C.text1, valign: 'top', margin: 0, lineSpacingMultiple: 0.95 }, text: '' } },
  ],
});
let no = 0;
const nm = (k, s) => (k ? `k${k}|${s}` : s);
const ROUTE = ['Nazariya', 'Formula', 'Statistika', 'Grafik', 'Tahlil', 'Xulosa'];
// "optik tola marshruti": oltita bekat, joriy bo‘lim yonadi — taqdimotning doimiy motivi
function route(s, active) {
  const x0 = 9.15, step = 0.72, y = 0.62;
  s.addShape(pres.shapes.LINE, { x: x0, y, w: step * 5, h: 0, line: { color: HEX.rule, width: 2.5 }, objectName: 'marshrut' });
  if (active >= 0) s.addShape(pres.shapes.LINE, { x: x0, y, w: step * active, h: 0, line: { color: HEX.fiber, width: 2.5 }, objectName: 'marshrut-otilgan' });
  ROUTE.forEach((t, i) => {
    const on = i === active, done = i < active;
    s.addShape(pres.shapes.OVAL, { x: x0 + i * step - (on ? 0.1 : 0.065), y: y - (on ? 0.1 : 0.065), w: on ? 0.2 : 0.13, h: on ? 0.2 : 0.13, fill: { color: on ? HEX.fiber : done ? HEX.fiber : 'FFFFFF' }, line: { color: on || done ? HEX.fiber : HEX.gray, width: 1.5 }, objectName: 'bekat' });
    s.addText(t, { x: x0 + i * step - 0.38, y: y + 0.14, w: 0.76, h: 0.22, fontFace: HEAD, fontSize: 9, bold: on, color: on ? HEX.fiber : HEX.muted, align: 'center', margin: 0, isTextBox: true, objectName: 'bekat-nomi' });
  });
}
function newSlide(section, routeIdx, master = 'MAZMUN') {
  no++;
  const s = pres.addSlide({ masterName: master, sectionTitle: section });
  if (master === 'MAZMUN') {
    route(s, routeIdx);
    s.addText(`13-mavzu  ·  ${no} / ${TOTAL}`, { x: 10.6, y: 7.05, w: 2.13, h: 0.24, fontFace: HEAD, fontSize: 10, color: HEX.src, align: 'right', margin: 0, isTextBox: true, objectName: 'sahifa' });
  }
  return s;
}
const title = (s, t) => s.addText(t, { placeholder: 'title' });
function src(s, text, k, y = 7.05) {
  s.addText(text, { x: X0, y, w: 9.5, h: 0.24, fontFace: HEAD, fontSize: 10, color: HEX.src, margin: 0, isTextBox: true, objectName: nm(k, 'manba') });
}
function big(s, x, y, w, num, cap, color, k, size = 34) {
  s.addText(num, { x, y, w, h: size / 58, fontFace: HEAD, fontSize: size, bold: true, color, margin: 0, valign: 'bottom', isTextBox: true, objectName: nm(k, 'katta-raqam') });
  s.addText(cap, { x, y: y + size / 58 + 0.04, w, h: 0.45, fontFace: HEAD, fontSize: 12, color: C.text2, margin: 0, valign: 'top', isTextBox: true, objectName: nm(k, 'katta-raqam-izoh') });
}
// "Grafikni o‘qish" / "Statistik xulosa" kabi izoh bloki: chap tomonda tola rangidagi nuqta
function note(s, x, y, w, h, head, body, k, color = HEX.fiber, size = 13) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: 'FFFFFF' }, line: { color: HEX.rule, width: 1 }, objectName: nm(k, 'izoh-fon') });
  s.addShape(pres.shapes.OVAL, { x: x + 0.2, y: y + 0.22, w: 0.16, h: 0.16, fill: { color }, line: { type: 'none' }, objectName: nm(k, 'izoh-nuqta') });
  s.addText(head, { x: x + 0.46, y: y + 0.12, w: w - 0.6, h: 0.34, fontFace: HEAD, fontSize: 14, bold: true, color, margin: 0, valign: 'middle', isTextBox: true, objectName: nm(k, 'izoh-sarlavha') });
  s.addText(body, { x: x + 0.2, y: y + 0.52, w: w - 0.4, h: h - 0.62, fontSize: size, color: HEX.ink, margin: 0, valign: 'top', paraSpaceAfter: 4, isTextBox: true, objectName: nm(k, 'izoh-matn') });
}
const bullets = (items, o = {}) => items.map((t, i) => ({ text: t, options: { bullet: { indent: 14 }, breakLine: i < items.length - 1, paraSpaceAfter: 6, ...o } }));
const chartBase = (o) => ({
  catAxisLabelFontFace: HEAD, valAxisLabelFontFace: HEAD, catAxisLabelFontSize: 11, valAxisLabelFontSize: 11,
  catAxisLabelColor: HEX.muted, valAxisLabelColor: HEX.muted, catAxisLabelRotate: 0,
  valGridLine: { color: HEX.rule, size: 0.75 }, catGridLine: { style: 'none' },
  catAxisLineShow: true, catAxisLineColor: HEX.ink, valAxisLineShow: false, catAxisMajorTickMark: 'none', valAxisMajorTickMark: 'none',
  plotArea: { fill: { color: HEX.bg, transparency: 100 } }, chartArea: { fill: { color: HEX.bg, transparency: 100 } },
  showLegend: false, ...o,
});
const YL = Y.map((y) => (y % 2 === 0 ? String(y) : ''));
function notes(s, who, text) { s.addNotes(`${who}\n\n` + text.trim().split('\n').map((p) => (p.startsWith('▶') ? '[▶ bosing] ' + p.slice(1).trim() : p)).join('\n\n')); }
const T = (v, d = 1) => fmt(v, d);

/* ================= 1. MUQOVA ================= */
{
  pres.addSection({ title: 'Kirish' });
  const s = newSlide('Kirish', -1, 'MUQOVA');
  // optik tola chiziqlari (bezak): o‘ngda tugunlar bilan
  [[7.6, 1.0, 5.2], [8.4, 1.7, 4.4], [7.0, 2.4, 5.8], [9.2, 3.1, 3.6]].forEach(([x, y, w], i) => {
    s.addShape(pres.shapes.LINE, { x, y, w, h: 0, line: { color: i % 2 ? HEX.fiber : HEX.fiber2, width: 1.5, transparency: 35 }, objectName: 'tola' });
    s.addShape(pres.shapes.OVAL, { x: x - 0.06, y: y - 0.06, w: 0.12, h: 0.12, fill: { color: HEX.fiber2 }, line: { type: 'none' }, objectName: 'tugun' });
  });
  s.addText('13-MAVZU  ·  INFRATUZILMA VA IQTISODIY O‘SISH', { x: X0, y: 0.7, w: 7, h: 0.3, fontFace: HEAD, fontSize: 13, bold: true, color: HEX.fiber2, charSpacing: 2, margin: 0, isTextBox: true, objectName: 'mavzu' });
  s.addText('Raqamli infratuzilma mehnat unumdorligini qanday oshiradi?', { x: X0, y: 1.15, w: 7.6, h: 2.0, fontFace: HEAD, fontSize: 40, bold: true, color: 'FFFFFF', margin: 0, valign: 'top', lineSpacingMultiple: 0.95, isTextBox: true, objectName: 'sarlavha' });
  s.addText('Ta’sir mexanizmi: nazariya, formula, O‘zbekiston va 39 mamlakat ma’lumotlari asosida tahlil', { x: X0, y: 3.3, w: 7.4, h: 0.7, fontSize: 16, italic: true, color: 'C7D2E3', margin: 0, isTextBox: true, objectName: 'kichik-sarlavha' });
  big(s, X0, 4.45, 4.2, `${T(R.netA)}% → ${T(R.netB)}%`, '', 'FFFFFF', 1, 36);
  s.addText('O‘zbekistonda internetdan foydalanuvchilar, 2010 → 2024 [1]', { x: X0, y: 5.13, w: 4.6, h: 0.42, fontFace: HEAD, fontSize: 12, color: 'C7D2E3', margin: 0, isTextBox: true, objectName: 'k1|izoh' });
  big(s, 5.6, 4.45, 3.4, `+${T(R.prodG, 0)}%`, '', HEX.amber, 2, 36);
  s.addText('bitta band xodimga YaIM (unumdorlik), 2010 → 2024 [1]', { x: 5.6, y: 5.13, w: 3.6, h: 0.42, fontFace: HEAD, fontSize: 12, color: 'C7D2E3', margin: 0, isTextBox: true, objectName: 'k2|izoh' });
  s.addText('Savol: ikkalasi bir-biriga bog‘liqmi — va qanday?', { x: X0, y: 5.85, w: 8.5, h: 0.4, fontFace: HEAD, fontSize: 18, bold: true, color: HEX.fiber2, margin: 0, isTextBox: true, objectName: 'k3|savol' });
  s.addText('Tayyorladi: Qo‘ziboyev Aslbek', { x: 8.6, y: 6.75, w: 4.13, h: 0.3, fontFace: HEAD, fontSize: 13, color: 'C7D2E3', align: 'right', margin: 0, isTextBox: true, objectName: 'muallif' });
  notes(s, 'Kirish (≈1 daqiqa)', `Assalomu alaykum! Mening mavzuim — raqamli infratuzilmaning mehnat unumdorligiga ta’sir mexanizmi.
▶ Ikki raqamdan boshlayman. 2010-yilda O‘zbekistonda aholining atigi ${T(R.netA)} foizi internetdan foydalangan, 2024-yilda esa ${T(R.netB)} foizi.
▶ Xuddi shu davrda bitta band xodim yaratadigan YaIM — ya’ni mehnat unumdorligi — ${T(R.prodG, 0)} foizga oshgan.
▶ Savol oddiy: bu ikki o‘sish bir-biriga bog‘liqmi? Agar bog‘liq bo‘lsa, internet unumdorlikni qaysi yo‘llar bilan oshiradi? Javobni nazariya, formula, statistika va grafiklar orqali izlaymiz.`);
}

/* ================= 2. SAVOL VA USUL ================= */
{
  const s = newSlide('Kirish', -1);
  title(s, 'Tadqiqot savoli: internet bor joyda xodim ko‘proq ishlab chiqaradimi?');
  const defs = [
    ['Raqamli infratuzilma', 'Ma’lumot uzatish va saqlash tizimlari: optik tola va keng polosali internet, mobil 4G/5G tarmoqlar, ma’lumot markazlari, raqamli davlat va to‘lov platformalari.'],
    ['Mehnat unumdorligi', 'Bitta band xodimga to‘g‘ri keladigan YaIM:  Y / L  (doimiy 2021 PPP $, Jahon banki). Ko‘rsatkich oshsa — har bir xodim ko‘proq qiymat yaratadi.'],
  ];
  defs.forEach(([h, t], i) => {
    const y = 1.75 + i * 1.75;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: X0, y, w: 6.3, h: 1.5, rectRadius: 0.08, fill: { color: 'FFFFFF' }, line: { color: HEX.rule, width: 1 }, objectName: 'k1|tarif-fon' });
    s.addText([{ text: h, options: { fontFace: HEAD, bold: true, fontSize: 17, color: HEX.fiber, breakLine: true } }, { text: t, options: { fontSize: 14, color: HEX.ink } }], { x: X0 + 0.25, y: y + 0.12, w: 5.85, h: 1.3, margin: 0, valign: 'top', paraSpaceAfter: 4, isTextBox: true, objectName: 'k1|tarif' });
  });
  s.addText('Ma’lumot: Jahon banki WDI (ITU va XMT asosida), 2010–2024; 39 mamlakat kesimi, 2023 [1]', { x: X0, y: 5.4, w: 6.3, h: 0.5, fontFace: HEAD, fontSize: 12, color: HEX.muted, margin: 0, isTextBox: true, objectName: 'k1|malumot' });
  // tadqiqot marshruti: 5 qadam
  s.addText('Tahlil 5 qadamda', { x: 7.4, y: 1.7, w: 5.3, h: 0.36, fontFace: HEAD, fontSize: 17, bold: true, color: HEX.ink, margin: 0, isTextBox: true, objectName: 'k2|qadamlar-sarlavha' });
  const steps = [['Formula', 'unumdorlik o‘sishini manbalarga ajratish'], ['Statistik tahlil', 'O‘zbekiston 2010–2024 va qo‘shnilar'], ['Grafik tahlil', 'trendlar va 39 mamlakat taqqoslovi'], ['Talaba tahlili', 'o‘z regressiyalarim va izohim'], ['Talaba xulosasi', 'natija va takliflar']];
  s.addShape(pres.shapes.LINE, { x: 7.62, y: 2.3, w: 0, h: 3.6, line: { color: HEX.fiber, width: 2 }, objectName: 'k2|qadam-chiziq' });
  steps.forEach(([h, t], i) => {
    const y = 2.18 + i * 0.86;
    s.addShape(pres.shapes.OVAL, { x: 7.44, y, w: 0.36, h: 0.36, fill: { color: HEX.fiber }, line: { color: 'FFFFFF', width: 1.5 }, objectName: 'k2|qadam-raqam' });
    s.addText(String(i + 1), { x: 7.44, y, w: 0.36, h: 0.36, fontFace: HEAD, fontSize: 13, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0, isTextBox: true, objectName: 'k2|qadam-raqam-matn' });
    s.addText([{ text: h, options: { fontFace: HEAD, bold: true, fontSize: 15, breakLine: true } }, { text: t, options: { fontSize: 13, color: HEX.muted } }], { x: 8.0, y: y - 0.06, w: 4.7, h: 0.72, color: HEX.ink, margin: 0, valign: 'top', isTextBox: true, objectName: 'k2|qadam' });
  });
  notes(s, 'Tadqiqot savoli (≈1 daqiqa)', `Avval ikki tushunchani aniqlab olaylik.
▶ Raqamli infratuzilma — bu ma’lumot uzatadigan va saqlaydigan «yo‘llar»: optik tola, mobil tarmoqlar, ma’lumot markazlari, davlat va to‘lov platformalari. Mehnat unumdorligi — bitta band xodimga to‘g‘ri keladigan YaIM. Barcha raqamlar Jahon bankining rasmiy bazasidan olingan.
▶ Tahlilni topshiriq talab qilgan besh qadamda qilaman: formula, statistik tahlil, grafik tahlil, o‘zimning tahlilim va xulosam.`);
}

/* ================= 3. NAZARIYA ================= */
{
  pres.addSection({ title: 'Nazariya va formula' });
  const s = newSlide('Nazariya va formula', 0);
  title(s, 'Nazariya: raqamli infratuzilma unumdorlikni oshiradi, lekin darhol emas');
  const cards = [
    ['Solow paradoksi, 1987', '«Kompyuter davrini hamma joyda ko‘rish mumkin — faqat unumdorlik statistikasida emas.»', 'Texnologiya bor, natija kechikadi [4]'],
    ['Czernich va b., 2011', 'Keng polosali internet qamrovi 10 f.p. oshsa, aholi jon boshiga yillik o‘sish 0,9–1,5 f.p. tezlashgan (OECD, 1996–2007).', 'Infratuzilma → o‘sish [5]'],
    ['ITU, 2019', 'Mobil keng polosali internet qamrovi 1% oshsa, YaIM 0,15% oshadi (global model). Osiyo-Tinch okeani: +10% → jon boshiga YaIM +0,51%.', 'Ta’sir mintaqaga bog‘liq [6]'],
    ['Akerman va b., 2015', 'Norvegiya firmalarida keng polosali internet malakali xodimlar unumdorligini oshirgan, malakasizlarnikini — pasaytirgan.', 'Ko‘nikma — hal qiluvchi shart [7]'],
  ];
  cards.forEach(([h, t, tag], i) => {
    const x = X0 + (i % 2) * 6.1, y = 1.72 + Math.floor(i / 2) * 2.12, k = i + 1;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 5.85, h: 1.92, rectRadius: 0.08, fill: { color: 'FFFFFF' }, line: { color: HEX.rule, width: 1 }, objectName: `k${k}|karta-fon` });
    s.addText(h, { x: x + 0.25, y: y + 0.15, w: 5.35, h: 0.34, fontFace: HEAD, fontSize: 15, bold: true, color: HEX.fiber, margin: 0, isTextBox: true, objectName: `k${k}|karta-sarlavha` });
    s.addText(t, { x: x + 0.25, y: y + 0.52, w: 5.35, h: 0.95, fontSize: 14, color: HEX.ink, margin: 0, valign: 'top', italic: i === 0, isTextBox: true, objectName: `k${k}|karta-matn` });
    s.addText(tag, { x: x + 0.25, y: y + 1.5, w: 5.35, h: 0.28, fontFace: HEAD, fontSize: 12, bold: true, color: HEX.uzbT, margin: 0, isTextBox: true, objectName: `k${k}|karta-xulosa` });
  });
  s.addText('Bu nimani anglatadi?  Raqamli infratuzilma — zarur, lekin yetarli shart emas: natija ko‘nikma va vaqtga bog‘liq.', { x: X0, y: 6.1, w: 12.1, h: 0.5, fontFace: HEAD, fontSize: 15, bold: true, color: HEX.ink, margin: 0, isTextBox: true, objectName: 'k5|anglatadi' });
  src(s, 'Manbalar: [4]–[7]', 0);
  notes(s, 'Nazariya (≈1,5 daqiqa)', `Iqtisodchilar bu savolni 40 yildan beri o‘rganadi.
▶ 1987-yilda Nobel mukofoti sohibi Robert Solow mashhur gap aytgan: kompyuter hamma joyda, faqat unumdorlik statistikasida yo‘q. Ya’ni texnologiya kelgan zahoti natija ko‘rinmaydi.
▶ Keyingi tadqiqotlar ta’sirni topdi. Czernich va hammualliflari OECD mamlakatlarida keng polosali internet qamrovi 10 foiz punkt oshganda yillik o‘sish 0,9–1,5 foiz punkt tezlashganini ko‘rsatgan.
▶ Xalqaro elektraloqa ittifoqi — ITU hisobiga ko‘ra, mobil keng polosali internet 1 foiz oshsa, YaIM 0,15 foiz oshadi. Lekin Osiyo-Tinch okeani mintaqasida ta’sir kichikroq.
▶ Eng muhim topilma — Akerman va hammualliflari: internet malakali xodimga foyda beradi, malakasizga esa yo‘q.
▶ Demak, infratuzilma zarur, lekin yetarli emas.`);
}

/* ================= 4. MEXANIZM ================= */
{
  const s = newSlide('Nazariya va formula', 0);
  title(s, 'Mexanizm: internet unumdorlikka beshta kanal orqali ta’sir qiladi');
  // chap: sabab
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: X0, y: 2.55, w: 2.45, h: 2.4, rectRadius: 0.1, fill: { color: HEX.navy }, line: { type: 'none' }, objectName: 'k1|sabab' });
  s.addText([{ text: 'Raqamli infratuzilma', options: { fontFace: HEAD, bold: true, fontSize: 17, breakLine: true } }, { text: 'optik tola, 4G/5G, ma’lumot markazlari, platformalar', options: { fontFace: HEAD, fontSize: 12, color: 'C7D2E3' } }], { x: X0 + 0.2, y: 2.55, w: 2.1, h: 2.4, color: 'FFFFFF', margin: 0, valign: 'middle', paraSpaceAfter: 6, isTextBox: true, objectName: 'k1|sabab-matn' });
  // o‘ng: natija
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 10.3, y: 2.55, w: 2.43, h: 2.4, rectRadius: 0.1, fill: { color: HEX.uzb }, line: { type: 'none' }, objectName: 'k1|natija' });
  s.addText([{ text: 'Mehnat unumdorligi', options: { fontFace: HEAD, bold: true, fontSize: 17, breakLine: true } }, { text: 'y = Y / L', options: { fontFace: HEAD, fontSize: 16, bold: true } }], { x: 10.5, y: 2.55, w: 2.1, h: 2.4, color: 'FFFFFF', margin: 0, valign: 'middle', paraSpaceAfter: 6, isTextBox: true, objectName: 'k1|natija-matn' });
  const ch = [
    ['Axborot va tranzaksiya xarajatlari ↓', 'qidiruv, aloqa, to‘lov arzonlashadi', 'A'],
    ['Raqamli kapital chuqurlashuvi', 'har xodimga ko‘proq raqamli vosita', 'd'],
    ['Ko‘nikma komplementarligi', 'malakali xodim ko‘proq foyda oladi [7]', 'L sifati'],
    ['Mehnat bozori va yangi xizmatlar', 'ish topish tezlashadi, bandlik oshadi [8]', 'L'],
    ['Innovatsiya va tarqalish', 'yangi biznes modellar, bilim almashinuvi', 'A'],
  ];
  ch.forEach(([h, t, term], i) => {
    const y = 1.62 + i * 0.97, k = i + 2;
    s.addShape(pres.shapes.LINE, { x: 3.12, y: y + 0.4, w: 0.45, h: 0, line: { color: HEX.fiber, width: 2, endArrowType: 'triangle' }, objectName: `k${k}|kanal-strelka` });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 3.65, y, w: 5.6, h: 0.8, rectRadius: 0.08, fill: { color: 'FFFFFF' }, line: { color: HEX.rule, width: 1 }, objectName: `k${k}|kanal-fon` });
    s.addText(String(i + 1), { x: 3.75, y: y + 0.18, w: 0.44, h: 0.44, fontFace: HEAD, fontSize: 16, bold: true, color: HEX.fiber, align: 'center', valign: 'middle', margin: 0, isTextBox: true, objectName: `k${k}|kanal-raqam` });
    s.addText([{ text: h, options: { fontFace: HEAD, bold: true, fontSize: 14, breakLine: true } }, { text: t, options: { fontSize: 12, color: HEX.muted } }], { x: 4.3, y, w: 3.9, h: 0.8, color: HEX.ink, margin: 0, valign: 'middle', isTextBox: true, objectName: `k${k}|kanal` });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 8.3, y: y + 0.22, w: 0.82, h: 0.36, rectRadius: 0.18, fill: { color: HEX.card }, line: { type: 'none' }, objectName: `k${k}|kanal-had` });
    s.addText(term, { x: 8.3, y: y + 0.22, w: 0.82, h: 0.36, fontFace: HEAD, fontSize: 11, bold: true, italic: true, color: HEX.fiber, align: 'center', valign: 'middle', margin: 0, isTextBox: true, objectName: `k${k}|kanal-had-matn` });
    s.addShape(pres.shapes.LINE, { x: 9.3, y: y + 0.4, w: 0.95, h: 0, line: { color: HEX.uzb, width: 2, endArrowType: 'triangle' }, objectName: `k${k}|kanal-strelka2` });
  });
  s.addText('Ko‘k yorliq — kanal formulaning qaysi hadiga ta’sir qilishi (keyingi slayd).', { x: 3.65, y: 6.5, w: 7, h: 0.3, fontFace: HEAD, fontSize: 12, italic: true, color: HEX.muted, margin: 0, isTextBox: true, objectName: 'k6|izoh' });
  src(s, 'Manbalar: [5], [7], [8]', 0);
  notes(s, 'Mexanizm (≈1,5 daqiqa)', `Endi asosiy savol — qanday qilib? Chapda sabab, o‘ngda natija.
▶ Birinchi kanal — xarajatlar. Internet bilan ma’lumot qidirish, mijoz bilan bog‘lanish, to‘lov qilish arzon va tez bo‘ladi.
▶ Ikkinchisi — raqamli kapital: har bir xodimning qo‘lida kompyuter, dastur, bulutli xizmat ko‘payadi.
▶ Uchinchisi — ko‘nikma: internetdan foyda olish uchun xodim uni ishlata bilishi kerak.
▶ To‘rtinchisi — mehnat bozori: Hjort va Poulsen Afrikada tez internet kelgan hududlarda bandlik 4,2–10 foizga oshganini topgan.
▶ Beshinchisi — innovatsiya: yangi biznes modellar va bilim tez tarqaladi.
▶ Har bir kanal formulaning bitta hadiga ta’sir qiladi — buni keyingi slaydda ko‘ramiz.`);
}

/* ================= 5. FORMULA: O‘SISH HISOBI ================= */
{
  const s = newSlide('Nazariya va formula', 1);
  title(s, 'Formula: unumdorlik o‘sishini manbalarga ajratamiz');
  const eq = (y, text, k, size = 26) => s.addText(text, { x: X0 + 0.3, y, w: 7.2, h: 0.6, fontFace: 'Cambria Math', fontSize: size, color: HEX.ink, margin: 0, valign: 'middle', isTextBox: true, objectName: nm(k, 'formula') });
  const lab = (y, text, k) => s.addText(text, { x: X0 + 0.3, y, w: 7.2, h: 0.3, fontFace: HEAD, fontSize: 12, bold: true, color: HEX.fiber, margin: 0, isTextBox: true, objectName: nm(k, 'formula-yorliq') });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: X0, y: 1.65, w: 7.7, h: 4.95, rectRadius: 0.1, fill: { color: 'FFFFFF' }, line: { color: HEX.rule, width: 1 }, objectName: 'formula-fon' });
  lab(1.85, '1. Kengaytirilgan Cobb–Douglas ishlab chiqarish funksiyasi', 1);
  eq(2.17, [{ text: 'Y = A · K' }, { text: 'α', options: { superscript: true } }, { text: ' · D' }, { text: 'γ', options: { superscript: true } }, { text: ' · L' }, { text: '1−α−γ', options: { superscript: true } }], 1);
  lab(3.05, '2. Bitta xodimga (Y, K, D ni L ga bo‘lamiz)', 2);
  eq(3.37, [{ text: 'y = Y/L = A · k' }, { text: 'α', options: { superscript: true } }, { text: ' · d' }, { text: 'γ', options: { superscript: true } }], 2);
  lab(4.25, '3. O‘sish sur’atlarida (logarifm olib, vaqt bo‘yicha differensiallaymiz)', 3);
  eq(4.57, [{ text: 'g' }, { text: 'y', options: { subscript: true } }, { text: ' = g' }, { text: 'A', options: { subscript: true } }, { text: ' + α·g' }, { text: 'k', options: { subscript: true } }, { text: ' + γ·g' }, { text: 'd', options: { subscript: true } }], 3);
  s.addText('γ — raqamli kapital elastikligi: d 1% oshsa, y taxminan γ% oshadi. Masalan, γ = 0,1 bo‘lsa, d ning 10% o‘sishi y ni ≈1% oshiradi.', { x: X0 + 0.3, y: 5.35, w: 7.2, h: 1.0, fontSize: 13, italic: true, color: HEX.muted, margin: 0, valign: 'top', isTextBox: true, objectName: 'k3|formula-misol' });
  // o‘ng: hadlar izohi
  const terms = [['y', 'mehnat unumdorligi (YaIM / band xodim)'], ['A', 'umumiy omil unumdorligi (TFP): texnologiya, tashkil etish — 1 va 5-kanal'], ['k', 'oddiy kapital / xodim (bino, mashina)'], ['d', 'raqamli kapital / xodim (tarmoq, kompyuter, dastur) — 2-kanal'], ['α, γ', 'kapital va raqamli kapitalning ulushi (elastikligi)'], ['L', 'band xodimlar (sifati — 3 va 4-kanal)']];
  s.addText('Hadlar', { x: 8.65, y: 1.65, w: 4, h: 0.34, fontFace: HEAD, fontSize: 16, bold: true, color: HEX.ink, margin: 0, isTextBox: true, objectName: 'k4|hadlar-sarlavha' });
  terms.forEach(([t, d], i) => {
    const y = 2.1 + i * 0.72;
    s.addText(t, { x: 8.65, y, w: 0.75, h: 0.62, fontFace: 'Cambria Math', fontSize: 20, bold: true, italic: true, color: HEX.fiber, margin: 0, valign: 'top', isTextBox: true, objectName: 'k4|had' });
    s.addText(d, { x: 9.45, y: y + 0.02, w: 3.3, h: 0.66, fontSize: 13, color: HEX.ink, margin: 0, valign: 'top', isTextBox: true, objectName: 'k4|had-izoh' });
  });
  src(s, 'Asos: Solow o‘sish hisobi; Jorgenson va Stiroh (2000) AKT kapitali bilan kengaytirgan [11]', 0);
  notes(s, 'Formula (≈1,5 daqiqa)', `Mexanizmni formula bilan yozamiz.
▶ Birinchi qator — Cobb–Douglas ishlab chiqarish funksiyasi, unga alohida omil sifatida raqamli kapital D qo‘shilgan.
▶ Ikkala tomonni xodimlar soni L ga bo‘lsak, bitta xodimga to‘g‘ri keladigan formula chiqadi: unumdorlik y texnologiya A, oddiy kapital k va raqamli kapital d ga bog‘liq.
▶ Logarifm olib, vaqt bo‘yicha differensiallasak, o‘sish sur’atlari chiqadi: unumdorlik o‘sishi = TFP o‘sishi + alfa karra kapital o‘sishi + gamma karra raqamli kapital o‘sishi. Gamma — elastiklik: raqamli kapital 1 foiz oshsa, unumdorlik gamma foiz oshadi.
▶ O‘ngda har bir had qaysi kanalga mos kelishi yozilgan. Bu Jorgenson va Stiroh AQSh uchun qo‘llagan o‘sish hisobi usuli.`);
}

/* ================= 6. FORMULA: EKONOMETRIK MODEL ================= */
{
  const s = newSlide('Nazariya va formula', 1);
  title(s, 'Formula: bog‘liqlikni regressiya bilan o‘lchaymiz');
  const box = (x, w, k, head, eqRuns, lines) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.65, w, h: 3.35, rectRadius: 0.1, fill: { color: 'FFFFFF' }, line: { color: HEX.rule, width: 1 }, objectName: `k${k}|model-fon` });
    s.addText(head, { x: x + 0.25, y: 1.8, w: w - 0.5, h: 0.34, fontFace: HEAD, fontSize: 15, bold: true, color: HEX.fiber, margin: 0, isTextBox: true, objectName: `k${k}|model-sarlavha` });
    s.addText(eqRuns, { x: x + 0.25, y: 2.25, w: w - 0.5, h: 0.6, fontFace: 'Cambria Math', fontSize: 21, color: HEX.ink, margin: 0, valign: 'middle', isTextBox: true, objectName: `k${k}|model-formula` });
    s.addText(bullets(lines), { x: x + 0.25, y: 3.0, w: w - 0.5, h: 1.9, fontSize: 13, color: HEX.ink, margin: 0, valign: 'top', isTextBox: true, objectName: `k${k}|model-izoh` });
  };
  const sub = (t) => ({ text: t, options: { subscript: true } });
  box(X0, 5.95, 1, 'A) Vaqt qatori: O‘zbekiston, 2010–2024', [{ text: 'ln y' }, sub('t'), { text: ' = β' }, sub('0'), { text: ' + β' }, sub('1'), { text: '·ln Internet' }, sub('t'), { text: ' + ε' }, sub('t')], ['β₁ — elastiklik: internetdan foydalanuvchilar 1% ko‘paysa, unumdorlik β₁% o‘zgaradi', 'n = 15 yil; xuddi shu model keng polosali obunalar bilan ham baholanadi']);
  box(6.75, 5.98, 2, 'B) Kesim: 39 mamlakat, 2023', [{ text: 'ln y' }, sub('i'), { text: ' = β' }, sub('0'), { text: ' + β' }, sub('1'), { text: '·Internet' }, sub('i'), { text: ' + ε' }, sub('i')], ['Internet +10 f.p. bo‘lsa, unumdorlik 100·(e^(10β₁) − 1) % ga farq qiladi', 'Model chizig‘i har mamlakat uchun «kutilgan» unumdorlikni beradi']);
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: X0, y: 5.2, w: 12.13, h: 1.55, rectRadius: 0.1, fill: { color: HEX.card }, line: { type: 'none' }, objectName: 'k3|ekk-fon' });
  s.addText([{ text: 'Eng kichik kvadratlar usuli (EKKU):  ', options: { fontFace: HEAD, bold: true, fontSize: 14 } }, { text: 'β₁ = Σ(x − x̄)(y − ȳ) / Σ(x − x̄)²', options: { fontFace: 'Cambria Math', fontSize: 18 } }], { x: X0 + 0.25, y: 5.3, w: 11.6, h: 0.5, color: HEX.ink, margin: 0, valign: 'middle', isTextBox: true, objectName: 'k3|ekk' });
  s.addText('Ogohlantirish: regressiya bog‘liqlikni o‘lchaydi, sababni emas. Boy mamlakatlar internetga ko‘proq sarflaydi (endogenlik). Czernich va b. buni eski telefon/kabel tarmoqlari orqali (instrumental o‘zgaruvchi) hal qilgan [5].', { x: X0 + 0.25, y: 5.82, w: 11.6, h: 0.85, fontSize: 13, italic: true, color: HEX.muted, margin: 0, valign: 'top', isTextBox: true, objectName: 'k4|ogohlantirish' });
  src(s, 'Hisob-kitob: talaba, Jahon banki WDI ma’lumotlari asosida [1]', 0);
  notes(s, 'Ekonometrik model (≈1 daqiqa)', `Formulani ma’lumotga qo‘llash uchun ikkita regressiya tuzdim.
▶ Birinchisi — vaqt qatori: O‘zbekistonning 15 yillik ma’lumoti. Ikkala tomonda logarifm bo‘lgani uchun beta-bir elastiklik bo‘ladi.
▶ Ikkinchisi — kesim: 2023-yilda 39 mamlakat. Bu yerda beta-bir internet 10 foiz punkt farq qilganda unumdorlik qancha farq qilishini ko‘rsatadi.
▶ Koeffitsiyentlar eng kichik kvadratlar usuli bilan hisoblanadi.
▶ Muhim ogohlantirish: regressiya bog‘liqlikni o‘lchaydi, sababni emas. Boy mamlakatlar internetga ko‘proq sarflaydi. Czernich va hammualliflari bu muammoni instrumental o‘zgaruvchi bilan hal qilgan.`);
}

/* ================= 7. STATISTIK TAHLIL: O‘ZBEKISTON ================= */
{
  pres.addSection({ title: 'Statistik va grafik tahlil' });
  const s = newSlide('Statistik va grafik tahlil', 2);
  title(s, 'Statistik tahlil: O‘zbekistonda ulanish tez, unumdorlik barqaror o‘sdi');
  big(s, X0, 1.62, 3.8, `${T(R.netA)}% → ${T(R.netB)}%`, 'internetdan foydalanuvchilar, aholiga nisbatan', HEX.fiber, 1, 30);
  big(s, 4.75, 1.62, 3.6, `×${T(R.bbX, 0)}`, `qat’iy keng polosali obuna: ${T(R.bbA, 2)} → ${T(R.bbB, 2)} ta / 100 kishi`, HEX.fiber, 1, 30);
  big(s, 8.75, 1.62, 3.98, `+${T(R.prodG, 0)}%`, `unumdorlik: ${fmt(R.prodA, 0)} → ${fmt(R.prodB, 0)} $ (yiliga ${T(R.prodC, 2)}%)`, HEX.uzbT, 1, 30);
  const TY = [2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024];
  const at = (a, y) => a[Y.indexOf(y)];
  const TB = { fontFace: HEAD, fontSize: 13, color: HEX.ink, margin: [0.04, 0.08, 0.03, 0.08], valign: 'middle' };
  const noB = { type: 'none' };
  const cell = (t, o = {}) => ({ text: t, options: { ...TB, align: 'right', border: [noB, noB, { pt: 0.75, color: HEX.rule }, noB], ...o } });
  const head = (t, o = {}) => cell(t, { bold: true, border: [noB, noB, { pt: 2, color: HEX.ink }, noB], ...o });
  const rows = [[head('Ko‘rsatkich (O‘zbekiston)', { align: 'left' }), ...TY.map((y) => head(String(y)))]];
  rows.push([cell('Internetdan foydalanuvchilar, %', { align: 'left', color: HEX.muted }), ...TY.map((y) => cell(T(at(U.net, y))))]);
  rows.push([cell('Qat’iy keng polosali obuna / 100 kishi', { align: 'left', color: HEX.muted }), ...TY.map((y) => cell(T(at(U.bb, y), 2)))]);
  rows.push([cell('Unumdorlik, $ / xodim (2021 PPP)', { align: 'left', color: HEX.muted }), ...TY.map((y) => cell(fmt(at(U.prod, y), 0)))]);
  rows.push([cell('Unumdorlik o‘sishi, oldingi ustunga nisbatan %', { align: 'left', color: HEX.muted }), ...TY.map((y, i) => cell(i ? fmt((at(U.prod, y) / at(U.prod, TY[i - 1]) - 1) * 100, 1, true) : '—'))]);
  s.addTable(rows, { x: X0, y: 3.05, w: 12.13, colW: [4.05, ...TY.map(() => 8.08 / TY.length)], rowH: 0.38, objectName: 'k2|jadval' });
  note(s, X0, 5.2, 12.13, 1.45, 'Statistik xulosa', `14 yilda internet qamrovi ${T(R.netB - R.netA)} f.p. oshdi, keng polosali obunalar soni dunyo o‘rtachasidan (${T(R.wBB, 2)}) ham o‘tib ketdi. Unumdorlik esa sakrashsiz, yiliga ~${T(R.prodC, 1)}% dan o‘sdi: ulanish tez, foydaning yig‘ilishi esa sekin.`, 3);
  src(s, 'Manba: Jahon banki WDI — IT.NET.USER.ZS, IT.NET.BBND.P2 (ITU), SL.GDP.PCAP.EM.KD [1]', 0);
  notes(s, 'Statistik tahlil (≈1,5 daqiqa)', `Endi O‘zbekiston raqamlari.
▶ Internetdan foydalanuvchilar ${T(R.netA)} foizdan ${T(R.netB)} foizga chiqdi. Uydagi keng polosali internet obunalari 100 kishiga ${T(R.bbA, 2)} tadan ${T(R.bbB, 2)} taga — ${T(R.bbX, 0)} barobar oshdi. Unumdorlik ${fmt(R.prodA, 0)} dollardan ${fmt(R.prodB, 0)} dollarga, ya’ni ${T(R.prodG, 0)} foizga oshdi — yiliga o‘rtacha ${T(R.prodC, 2)} foiz.
▶ Jadvalda har ikki yillik qadam. E’tibor bering: internet ba’zi yillarda sakrab o‘sgan, unumdorlik esa har ikki yilda deyarli bir xil — 7–10 foiz atrofida o‘sgan.
▶ Statistik xulosa: ulanish tez bo‘ldi, keng polosali obunalar soni bo‘yicha biz dunyo o‘rtachasidan ham o‘tdik. Lekin foyda sekin yig‘iladi.`);
}

/* ================= 8. GRAFIK TAHLIL: O‘ZBEKISTON ================= */
{
  const s = newSlide('Statistik va grafik tahlil', 3);
  title(s, 'Grafik tahlil: ulanish 2018–2019 da sakradi, unumdorlik esa bir tekis o‘sdi');
  // A: internet % (chiziq) + keng polosali (ustun), bir xil 0–100 o‘q
  s.addText('A. Raqamli infratuzilma, O‘zbekiston', { x: X0, y: 1.6, w: 5.9, h: 0.3, fontFace: HEAD, fontSize: 14, bold: true, color: HEX.ink, margin: 0, isTextBox: true, objectName: 'k1|grafik-a-sarlavha' });
  s.addChart([
    { type: pres.charts.BAR, data: [{ name: 'Keng polosali obuna / 100 kishi', labels: YL, values: U.bb }], options: { chartColors: [HEX.fiber2], barGapWidthPct: 40 } },
    { type: pres.charts.LINE, data: [{ name: 'Internetdan foydalanuvchilar, %', labels: YL, values: U.net }], options: { chartColors: [HEX.fiber], lineSize: 3, lineDataSymbol: 'circle', lineDataSymbolSize: 5 } },
    { type: pres.charts.LINE, data: [{ name: 'Dunyo: internet, %', labels: YL, values: D.internet.WLD }], options: { chartColors: [HEX.gray], lineSize: 2, lineDataSymbol: 'none', lineDash: 'dash' } },
  ], chartBase({ x: X0, y: 1.95, w: 5.95, h: 3.4, valAxisMinVal: 0, valAxisMaxVal: 100, valAxisMajorUnit: 20, showLegend: true, legendPos: 'b', legendFontFace: HEAD, legendFontSize: 10, legendColor: HEX.muted, objectName: 'k1|grafik-a' }));
  // B: unumdorlik (ustun) + dunyo (chiziq)
  s.addText('B. Mehnat unumdorligi, $ / xodim (2021 PPP)', { x: 6.78, y: 1.6, w: 5.9, h: 0.3, fontFace: HEAD, fontSize: 14, bold: true, color: HEX.ink, margin: 0, isTextBox: true, objectName: 'k2|grafik-b-sarlavha' });
  s.addChart([
    { type: pres.charts.BAR, data: [{ name: 'O‘zbekiston', labels: YL, values: U.prod }], options: { chartColors: [HEX.uzb], barGapWidthPct: 40 } },
    { type: pres.charts.LINE, data: [{ name: 'Dunyo o‘rtachasi', labels: YL, values: D.productivity.WLD }], options: { chartColors: [HEX.gray], lineSize: 2.5, lineDataSymbol: 'none', lineDash: 'dash' } },
  ], chartBase({ x: 6.78, y: 1.95, w: 5.95, h: 3.4, valAxisMinVal: 0, valAxisMaxVal: 60000, valAxisMajorUnit: 10000, valAxisLabelFormatCode: '[>=1000]# ##0;0', showLegend: true, legendPos: 'b', legendFontFace: HEAD, legendFontSize: 10, legendColor: HEX.muted, objectName: 'k2|grafik-b' }));
  const j = U.net[Y.indexOf(2019)] - U.net[Y.indexOf(2018)];
  note(s, X0, 5.5, 12.13, 1.2, 'Grafikni o‘qish', `A: internet 2018→2019 da bir yilda +${T(j)} f.p. sakradi, keng polosali obuna 2024 da dunyo o‘rtachasidan ${T(R.bbB / R.wBB, 1)} barobar ko‘p. B: unumdorlik grafigida sakrash yo‘q — u dunyo o‘rtachasining ${T((R.prodB / R.wProd) * 100, 0)}% ida qolmoqda.`, 3);
  src(s, 'Manba: Jahon banki WDI [1]; grafiklar data.json asosida chizilgan', 0);
  notes(s, 'Grafik tahlil (≈1,5 daqiqa)', `Grafikda bu yaqqol ko‘rinadi.
▶ Chapda — infratuzilma. Ko‘k chiziq internetdan foydalanuvchilar, och ustunlar keng polosali obunalar, kulrang uzuq chiziq — dunyo o‘rtachasi. 2018–2019-yillarda bir yilda ${T(j)} foiz punkt sakrash bor, O‘zbekiston dunyo o‘rtachasini 2015-yildan beri ortda qoldirgan.
▶ O‘ngda — unumdorlik. To‘q sariq ustunlar bir tekis o‘sadi, sakrash yo‘q. Kulrang chiziq — dunyo o‘rtachasi. Biz hali uning ${T((R.prodB / R.wProd) * 100, 0)} foizidamiz.
▶ Ya’ni infratuzilma «tez yo‘l» bilan keldi, unumdorlik esa «sekin yo‘l» bilan ergashmoqda — bu nazariyadagi kechikishga mos.`);
}

/* ================= 9. STATISTIK TAHLIL: TAQQOSLASH ================= */
{
  const s = newSlide('Statistik va grafik tahlil', 2);
  title(s, 'Statistik tahlil: internet qamrovi deyarli teng, unumdorlik esa 3 barobar farq qiladi');
  const P = [['KOR', 'Koreya'], ['TUR', 'Turkiya'], ['KAZ', 'Qozog‘iston'], ['WLD', 'Dunyo'], ['UZB', 'O‘zbekiston'], ['KGZ', 'Qirg‘iziston']];
  s.addChart(pres.charts.BAR, [{ name: 'Unumdorlik 2024', labels: P.map((p) => p[1]), values: P.map((p) => last(D.productivity[p[0]])) }], chartBase({
    x: X0, y: 1.7, w: 6.6, h: 4.0, barDir: 'bar', catAxisOrientation: 'maxMin', barGapWidthPct: 35, valAxisMinVal: 0, valAxisMaxVal: 120000, valAxisMajorUnit: 30000,
    valAxisLabelFormatCode: '[>=1000]# ##0;0', catAxisLabelFontSize: 13, catAxisLabelColor: HEX.ink,
    chartColors: P.map((p) => (p[0] === 'UZB' ? HEX.uzb : p[0] === 'WLD' ? HEX.gray : HEX.fiber)),
    showValue: true, dataLabelPosition: 'outEnd', dataLabelFormatCode: '# ##0" $"', dataLabelFontFace: HEAD, dataLabelFontSize: 12, dataLabelFontBold: true, dataLabelColor: HEX.ink,
    objectName: 'k1|grafik',
  }));
  s.addText('Unumdorlik, $ / xodim, 2024', { x: X0, y: 1.4, w: 6, h: 0.28, fontFace: HEAD, fontSize: 12, color: HEX.muted, margin: 0, isTextBox: true, objectName: 'k1|birlik' });
  const TB = { fontFace: HEAD, fontSize: 13, color: HEX.ink, margin: [0.04, 0.08, 0.03, 0.08], valign: 'middle' };
  const noB = { type: 'none' };
  const cell = (t, o = {}) => ({ text: t, options: { ...TB, align: 'right', border: [noB, noB, { pt: 0.75, color: HEX.rule }, noB], ...o } });
  const head = (t, o = {}) => cell(t, { bold: true, border: [noB, noB, { pt: 2, color: HEX.ink }, noB], ...o });
  const rows = [[head('2024', { align: 'left' }), head('Internet, %'), head('Unumdorlik / UZB'), head('O‘sish, yiliga %')]];
  P.forEach(([k, name]) => rows.push([cell(name, { align: 'left', bold: k === 'UZB', color: k === 'UZB' ? HEX.uzbT : HEX.ink }), cell(T(last(D.internet[k]))), cell('×' + T(last(D.productivity[k]) / R.prodB, 2)), cell(T(cagr(D.productivity[k]), 2), { bold: k === 'UZB' })]));
  s.addTable(rows, { x: 7.5, y: 1.7, w: 5.23, colW: [1.6, 1.15, 1.33, 1.15], rowH: 0.42, objectName: 'k2|jadval' });
  note(s, 7.5, 4.85, 5.23, 1.85, 'Statistik xulosa', `Koreya va Turkiyada internet qamrovi bizdan 1–8 f.p. farq qiladi, unumdorlik esa 3,2–3,4 barobar yuqori. O‘zbekiston esa eng tez o‘sayotgan mamlakat: yiliga ${T(R.prodC, 2)}%, Koreyada — ${T(cagr(D.productivity.KOR), 2)}%.`, 3);
  src(s, 'Manba: Jahon banki WDI [1]; «O‘sish» — 2010–2024 o‘rtacha yillik (CAGR), talaba hisobi', 0);
  notes(s, 'Taqqoslash (≈1,5 daqiqa)', `Endi O‘zbekistonni qo‘shnilar va dunyo bilan solishtiramiz.
▶ Grafikda 2024-yildagi unumdorlik. Koreyada bitta xodim ${fmt(last(D.productivity.KOR), 0)} dollar, Turkiyada ${fmt(last(D.productivity.TUR), 0)}, Qozog‘istonda ${fmt(last(D.productivity.KAZ), 0)}, bizda ${fmt(R.prodB, 0)} dollar yaratadi.
▶ Jadvalga qarang: internet qamrovi deyarli bir xil — 87 dan 98 foizgacha. Unumdorlik farqi esa uch barobardan ko‘p. Demak, internetga ulanishning o‘zi farqni tushuntirmaydi.
▶ Ijobiy tomoni: O‘zbekiston bu guruhdagi eng tez o‘sayotgan mamlakat — yiliga ${T(R.prodC, 2)} foiz.`);
}

/* ================= 10. GRAFIK TAHLIL: 39 MAMLAKAT ================= */
{
  const s = newSlide('Statistik va grafik tahlil', 3);
  title(s, 'Grafik tahlil: 39 mamlakat ichida O‘zbekiston model chizig‘idan ancha past');
  const keys = CS_KEYS.filter((k) => k !== 'UZB');
  const xs = keys.map((k) => D.cross2023[k][0]);
  const lineX = [20, 30, 40, 50, 60, 70, 80, 90, 100];
  // tarqoq nuqtalar + model chizig‘i + O‘zbekiston: bitta X qatori ustida uch Y qatori
  const allX = [...xs, ...lineX, D.cross2023.UZB[0]];
  const pad = (arr, from) => allX.map((_, i) => (i >= from && i < from + arr.length ? arr[i - from] : null));
  s.addChart(pres.charts.SCATTER, [
    { name: 'Internet, %', values: allX },
    { name: 'Mamlakatlar', values: pad(keys.map((k) => D.cross2023[k][1]), 0) },
    { name: '— Model chizig‘i', values: pad(lineX.map((x) => Math.exp(CS.a + CS.b * x)), xs.length) },
    { name: 'O‘zbekiston', values: pad([D.cross2023.UZB[1]], xs.length + lineX.length) },
  ], chartBase({
    x: X0, y: 1.75, w: 7.9, h: 4.95, layout: { x: 0.11, y: 0.03, w: 0.86, h: 0.84 },
    valAxisLogScaleBase: 10, valAxisMinVal: 5000, valAxisMaxVal: 250000, valAxisLabelFormatCode: '# ##0',
    catAxisMinVal: 10, catAxisMaxVal: 100, catAxisMajorUnit: 10, catGridLine: { style: 'none' },
    chartColors: [HEX.fiber, HEX.ink, HEX.uzb], lineSize: 0, lineDataSymbolSize: 9,
    objectName: 'k1|tarqoq',
  }));
  {
    const fx = (x) => X0 + 0.11 * 7.9 + ((x - 10) / 90) * 0.86 * 7.9;
    const fy = (v) => 1.75 + 0.03 * 4.95 + ((Math.log(250000) - Math.log(v)) / (Math.log(250000) - Math.log(5000))) * 0.84 * 4.95;
    [['UZB', 'O‘zbekiston', -1.3, 0.05, HEX.uzbT], ['KGZ', 'Qirg‘iziston', -1.25, 0.02, HEX.ink], ['KAZ', 'Qozog‘iston', -1.3, 0.16, HEX.ink], ['KOR', 'Koreya', 0.12, 0.17, HEX.ink], ['USA', 'AQSh', -0.55, -0.12, HEX.ink], ['ETH', 'Efiopiya', 0.1, 0, HEX.ink]].forEach(([k, name, dx, dy, col]) => {
      const [x, v] = D.cross2023[k];
      s.addText(name, { x: fx(x) + dx, y: fy(v) - 0.12 + dy, w: 1.15, h: 0.24, fontFace: HEAD, fontSize: 10, bold: true, color: col, align: dx < 0 ? 'right' : 'left', margin: 0, isTextBox: true, objectName: 'k1|mamlakat' });
    });
  }
  s.addText('Unumdorlik, $ / xodim (log shkala)', { x: X0, y: 1.45, w: 4, h: 0.28, fontFace: HEAD, fontSize: 12, color: HEX.muted, margin: 0, isTextBox: true, objectName: 'k1|y-birlik' });
  s.addText('Internetdan foydalanuvchilar, % aholi, 2023', { x: 3.0, y: 6.42, w: 4.5, h: 0.26, fontFace: HEAD, fontSize: 12, color: HEX.muted, align: 'center', margin: 0, isTextBox: true, objectName: 'k1|x-birlik' });
  big(s, 8.85, 1.7, 3.88, `+${T(csEffect, 0)}%`, 'unumdorlik farqi: internet +10 f.p. bo‘lganda (model)', HEX.fiber, 2, 32);
  big(s, 8.85, 2.9, 3.88, `R² = ${T(CS.r2, 2)}`, `39 mamlakat; t = ${T(CS.t, 1)}`, HEX.ink, 2, 26);
  note(s, 8.85, 4.0, 3.88, 2.7, 'Grafikni o‘qish', `Har nuqta — bitta mamlakat. Ko‘k chiziq — model. O‘zbekiston (to‘q sariq) chiziqdan ancha pastda: ${T(D.cross2023.UZB[0])}% internet bilan model ${fmt(uzPred, 0)} $ kutadi, haqiqatda — ${fmt(D.cross2023.UZB[1], 0)} $.`, 3, HEX.uzb, 12);
  src(s, 'Manba: Jahon banki WDI, 2023 [1]; regressiya — talaba hisobi (EKKU, ln y = β₀ + β₁·Internet)', 0);
  notes(s, '39 mamlakat (≈1,5 daqiqa)', `Bu taqdimotdagi eng muhim grafik.
▶ Har bir nuqta — bitta mamlakat, 2023-yil. Gorizontalda internetdan foydalanuvchilar ulushi, vertikalda unumdorlik, logarifmik shkalada. Ko‘k chiziq — men hisoblagan regressiya modeli.
▶ Model bo‘yicha internet 10 foiz punkt yuqori bo‘lgan mamlakatda unumdorlik o‘rtacha ${T(csEffect, 0)} foiz yuqori. R-kvadrat ${T(CS.r2, 2)}: farqlarning uchdan ikki qismini shu bitta ko‘rsatkich tushuntiradi.
▶ Endi to‘q sariq nuqta — O‘zbekiston. U chiziqdan ancha pastda. Bizdagi internet darajasi bilan model ${fmt(uzPred, 0)} dollar kutadi, haqiqatda ${fmt(D.cross2023.UZB[1], 0)} dollar.`);
}

/* ================= 11. TALABA TAHLILI: REGRESSIYA NATIJALARI ================= */
{
  pres.addSection({ title: 'Talaba tahlili va xulosasi' });
  const s = newSlide('Talaba tahlili va xulosasi', 4);
  title(s, `Talaba tahlili: bog‘liqlik kuchli, ammo O‘zbekiston kutilgandan ${T(-uzGap, 0)}% past`);
  // natijalar jadvali
  const TB = { fontFace: HEAD, fontSize: 13, color: HEX.ink, margin: [0.05, 0.08, 0.04, 0.08], valign: 'middle' };
  const noB = { type: 'none' };
  const cell = (t, o = {}) => ({ text: t, options: { ...TB, align: 'right', border: [noB, noB, { pt: 0.75, color: HEX.rule }, noB], ...o } });
  const head = (t, o = {}) => cell(t, { bold: true, border: [noB, noB, { pt: 2, color: HEX.ink }, noB], ...o });
  const rows = [
    [head('Model', { align: 'left' }), head('β₁'), head('R²'), head('t'), head('n')],
    [cell('A. O‘zbekiston: ln y ~ ln Internet', { align: 'left' }), cell(T(TS.b, 2), { bold: true }), cell(T(TS.r2, 2)), cell(T(TS.t, 1)), cell(String(TS.n))],
    [cell('A′. O‘zbekiston: ln y ~ ln Keng polosali', { align: 'left' }), cell(T(TSB.b, 2), { bold: true }), cell(T(TSB.r2, 2)), cell(T(TSB.t, 1)), cell(String(TSB.n))],
    [cell('B. 39 mamlakat: ln y ~ Internet', { align: 'left' }), cell(T(CS.b, 3), { bold: true }), cell(T(CS.r2, 2)), cell(T(CS.t, 1)), cell(String(CS.n))],
  ];
  s.addTable(rows, { x: X0, y: 1.75, w: 7.2, colW: [3.9, 0.85, 0.85, 0.8, 0.8], rowH: 0.42, objectName: 'k1|natijalar' });
  s.addText(bullets([
    `A: internetdan foydalanuvchilar 1% ko‘paysa, unumdorlik ~${T(TS.b, 2)}% yuqori (korrelyatsiya ${T(corr(U.net, U.prod), 2)}).`,
    `B: mamlakatlar o‘rtasida +10 f.p. internet ≈ +${T(csEffect, 0)}% unumdorlik.`,
    'Ehtiyot: A modelida ikkala qator ham yil sayin o‘sadi — umumiy trend bog‘liqlikni kuchaytirib ko‘rsatadi; bu sabab-oqibat isboti emas.',
  ]), { x: X0, y: 3.65, w: 7.2, h: 2.2, fontSize: 14, color: HEX.ink, margin: 0, valign: 'top', isTextBox: true, objectName: 'k2|talqin' });
  // o‘ng: kutilgan va haqiqiy unumdorlik
  s.addText('O‘zbekiston, 2023: $ / xodim', { x: 8.3, y: 1.7, w: 4.43, h: 0.3, fontFace: HEAD, fontSize: 14, bold: true, color: HEX.ink, margin: 0, isTextBox: true, objectName: 'k3|bosliq-sarlavha' });
  s.addChart(pres.charts.BAR, [{ name: 'Unumdorlik', labels: ['Model kutgan', 'Haqiqiy'], values: [Math.round(uzPred), D.cross2023.UZB[1]] }], chartBase({
    x: 8.3, y: 2.05, w: 4.43, h: 3.0, barGapWidthPct: 45, valAxisHidden: true, valGridLine: { style: 'none' }, valAxisMinVal: 0, valAxisMaxVal: 75000,
    catAxisLabelFontSize: 13, catAxisLabelColor: HEX.ink, chartColors: [HEX.fiber2, HEX.uzb],
    showValue: true, dataLabelPosition: 'outEnd', dataLabelFormatCode: '# ##0" $"', dataLabelFontFace: HEAD, dataLabelFontSize: 14, dataLabelFontBold: true, dataLabelColor: HEX.ink,
    objectName: 'k3|bosliq-grafik',
  }));
  big(s, 8.3, 5.15, 4.43, `${fmt(uzGap, 0)}%`, 'haqiqiy unumdorlik model kutganidan past', HEX.red, 4, 32);
  src(s, 'Hisob-kitob: talaba; ma’lumot — Jahon banki WDI [1]', 0);
  notes(s, 'Talaba tahlili 1 (≈1,5 daqiqa)', `Endi o‘zimning natijalarim.
▶ Jadvalda uchta model. O‘zbekiston vaqt qatorida elastiklik ${T(TS.b, 2)}: internetdan foydalanuvchilar 1 foiz ko‘paysa, unumdorlik ${T(TS.b, 2)} foiz yuqori. Keng polosali internet bo‘yicha — ${T(TSB.b, 2)}. 39 mamlakat modelida +10 foiz punkt internet unumdorlikning taxminan ${T(csEffect, 0)} foiz yuqoriligiga mos keladi.
▶ Lekin halol bo‘lishim kerak: O‘zbekiston ma’lumotida ikkala ko‘rsatkich ham har yili o‘sadi, shuning uchun korrelyatsiya ${T(corr(U.net, U.prod), 2)} — bu sabab-oqibatni isbotlamaydi.
▶ Eng qiziq natija — o‘ngda. Bizdagi internet darajasi bilan xalqaro model ${fmt(uzPred, 0)} dollar unumdorlik kutadi, haqiqatda ${fmt(D.cross2023.UZB[1], 0)} dollar.
▶ Ya’ni biz kutilgan darajadan ${T(-uzGap, 0)} foiz pastdamiz. Raqamli dividendning yarmidan kamini olayapmiz.`);
}

/* ================= 12. TALABA TAHLILI: NEGA BO‘SHLIQ ================= */
{
  const s = newSlide('Talaba tahlili va xulosasi', 4);
  title(s, 'Talaba tahlili: muammo — ulanishda emas, foydalanish samarasida');
  big(s, X0, 1.62, 3.8, `${T(R.bbB, 1)} va ${T(R.wBB, 1)}`, 'keng polosali obuna / 100 kishi: O‘zbekiston va dunyo, 2024', HEX.fiber, 1, 30);
  big(s, 4.75, 1.62, 3.6, `${T((R.prodB / R.wProd) * 100, 0)}%`, 'O‘zbekiston unumdorligi dunyo o‘rtachasiga nisbatan, 2024', HEX.uzbT, 1, 30);
  big(s, 8.75, 1.62, 3.98, '140 → 344 mln $', 'IT Park rezidentlari eksporti, 2022 → 2023 (×2,4) [10]', HEX.green, 1, 30);
  const hyp = [
    ['J-egri chiziq', 'Ulanishning asosiy qismi 2018–2024 yillarga to‘g‘ri keladi. Brynjolfsson va b. ko‘rsatganidek, raqamli investitsiya foydasi yillar o‘tib ko‘rinadi [9].'],
    ['Ko‘nikma yetishmasligi', 'Internet malakali xodim unumdorligini oshiradi [7]. Raqamli ko‘nikma tarqalmaguncha ulanish smartfondagi iste’mol bilan cheklanadi.'],
    ['Raqamli sektor hali kichik', 'IT xizmatlari eksporti tez o‘smoqda, lekin u iqtisodiyotning kichik qismi. Firmalarning raqamlashuvi — hal qiluvchi bo‘g‘in.'],
  ];
  hyp.forEach(([h, t], i) => {
    const x = X0 + i * 4.1, k = i + 2;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 3.0, w: 3.9, h: 2.7, rectRadius: 0.08, fill: { color: 'FFFFFF' }, line: { color: HEX.rule, width: 1 }, objectName: `k${k}|faraz-fon` });
    s.addText(`Faraz ${i + 1}`, { x: x + 0.22, y: 3.12, w: 3.4, h: 0.26, fontFace: HEAD, fontSize: 11, bold: true, color: HEX.muted, charSpacing: 1, margin: 0, isTextBox: true, objectName: `k${k}|faraz-raqam` });
    s.addText(h, { x: x + 0.22, y: 3.4, w: 3.46, h: 0.36, fontFace: HEAD, fontSize: 16, bold: true, color: HEX.fiber, margin: 0, isTextBox: true, objectName: `k${k}|faraz-sarlavha` });
    s.addText(t, { x: x + 0.22, y: 3.82, w: 3.46, h: 1.8, fontSize: 13, color: HEX.ink, margin: 0, valign: 'top', isTextBox: true, objectName: `k${k}|faraz-matn` });
  });
  s.addText('Bu nimani anglatadi?  Keyingi bosqichda «qancha odam ulangan?» emas, «ulanish bilan qancha qiymat yaratilmoqda?» degan savol muhim.', { x: X0, y: 5.95, w: 12.13, h: 0.7, fontFace: HEAD, fontSize: 15, bold: true, color: HEX.ink, margin: 0, isTextBox: true, objectName: 'k5|anglatadi' });
  src(s, 'Manba: Jahon banki WDI [1]; IT Park (2024) [10]; farazlar — talaba talqini, [7], [9] asosida', 0);
  notes(s, 'Talaba tahlili 2 (≈1,5 daqiqa)', `Nega biz chiziqdan pastdamiz?
▶ Avval faktlar. Keng polosali obunalar bo‘yicha biz dunyo o‘rtachasidan yuqorimiz — 100 kishiga ${T(R.bbB, 1)} va ${T(R.wBB, 1)}. Unumdorlik esa dunyo o‘rtachasining ${T((R.prodB / R.wProd) * 100, 0)} foizi. IT Park rezidentlari eksporti bir yilda 140 milliondan 344 million dollarga oshdi. Demak, muammo ulanishda emas.
▶ Mening birinchi farazim — J-egri chiziq. Ulanishning katta qismi so‘nggi olti yilda bo‘ldi, foyda esa kechikib keladi.
▶ Ikkinchisi — ko‘nikma. Internetdan ishda foydalanishni bilmasak, u faqat iste’mol vositasi bo‘lib qoladi.
▶ Uchinchisi — raqamli sektor va firmalarning raqamlashuvi hali boshlang‘ich bosqichda.
▶ Xulosa: endi «nechta odam ulangan» emas, «ulanish qancha qiymat yaratmoqda» degan savol muhim.`);
}

/* ================= 13. TALABA XULOSASI ================= */
{
  const s = newSlide('Talaba tahlili va xulosasi', 5);
  title(s, 'Talaba xulosasi: infratuzilma — poydevor, lekin o‘zi natija emas');
  const items = [
    ['Mexanizm', 'Internet unumdorlikka bevosita emas, besh kanal orqali ta’sir qiladi: xarajatlar, raqamli kapital, ko‘nikma, mehnat bozori va innovatsiya.'],
    ['Formula', `O‘sish hisobida raqamli kapital alohida had (γ·g_d). O‘zbekiston ma’lumotida elastiklik ≈ ${T(TS.b, 2)}, 39 mamlakatda +10 f.p. ≈ +${T(csEffect, 0)}%.`],
    ['O‘zbekiston', `Ulanish bo‘yicha natija yaxshi: ${T(R.netB)}% internet, keng polosali obunalar dunyo o‘rtachasidan yuqori.`],
    ['Bo‘shliq', `Unumdorlik model kutganidan ${T(-uzGap, 0)}% past: raqamli dividend hali to‘liq olinmagan — sabab ko‘nikma, vaqt va firmalarning raqamlashuvi.`],
  ];
  items.forEach(([h, t], i) => {
    const y = 1.7 + i * 1.18, k = i + 1;
    s.addShape(pres.shapes.OVAL, { x: X0, y: y + 0.05, w: 0.5, h: 0.5, fill: { color: i === 3 ? HEX.uzb : HEX.fiber }, line: { type: 'none' }, objectName: `k${k}|xulosa-raqam` });
    s.addText(String(i + 1), { x: X0, y: y + 0.05, w: 0.5, h: 0.5, fontFace: HEAD, fontSize: 18, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0, isTextBox: true, objectName: `k${k}|xulosa-raqam-matn` });
    s.addText([{ text: h, options: { fontFace: HEAD, bold: true, fontSize: 17, color: i === 3 ? HEX.uzbT : HEX.fiber, breakLine: true } }, { text: t, options: { fontSize: 14, color: HEX.ink } }], { x: X0 + 0.75, y, w: 11.35, h: 1.05, margin: 0, valign: 'top', isTextBox: true, objectName: `k${k}|xulosa` });
  });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: X0, y: 6.4, w: 12.13, h: 0.55, rectRadius: 0.08, fill: { color: HEX.navy }, line: { type: 'none' }, objectName: 'k5|asosiy-fon' });
  s.addText('Asosiy fikr: infratuzilma qurildi — endi undan foydalanish samarasini oshirish kerak.', { x: X0 + 0.25, y: 6.4, w: 11.7, h: 0.55, fontFace: HEAD, fontSize: 16, bold: true, color: 'FFFFFF', margin: 0, valign: 'middle', isTextBox: true, objectName: 'k5|asosiy' });
  notes(s, 'Talaba xulosasi (≈1,5 daqiqa)', `Xulosa qilaman.
▶ Birinchidan, raqamli infratuzilma unumdorlikka bevosita emas, besh kanal orqali ta’sir qiladi.
▶ Ikkinchidan, formula bo‘yicha raqamli kapital alohida o‘sish manbai. Mening hisobimda O‘zbekiston uchun elastiklik ${T(TS.b, 2)}, mamlakatlar o‘rtasida esa +10 foiz punkt internet taxminan ${T(csEffect, 0)} foiz yuqori unumdorlikka mos keladi.
▶ Uchinchidan, O‘zbekiston ulanish bo‘yicha katta yutuqqa erishdi.
▶ To‘rtinchidan, unumdorlik hali model kutganidan ${T(-uzGap, 0)} foiz past.
▶ Asosiy fikr: infratuzilma qurildi, endi undan foydalanish samarasini oshirish kerak.`);
}

/* ================= 14. TAKLIFLAR ================= */
{
  const s = newSlide('Talaba tahlili va xulosasi', 5);
  title(s, 'Takliflar: ulanishdan unumdorlikka o‘tish uchun uchta qadam');
  const props = [
    ['Ish joyida raqamli ko‘nikma', 'Muammo', 'Internet malakali xodimga foyda beradi, malakasizga — yo‘q [7].', 'Taklif', 'Korxona xodimlari uchun sertifikatlangan qisqa kurslar (buxgalteriya, CRM, ma’lumot tahlili); xarajatning bir qismini davlat qoplashi.', 'Kutiladigan natija', '3-kanal (L sifati) kuchayadi.'],
    ['Kichik biznesni raqamlashtirish', 'Muammo', 'Ulanish bor, lekin firmalar bulutli xizmat, e-tijorat va elektron to‘lovdan kam foydalanadi (2-kanal).', 'Taklif', 'Bulutli dasturlar va onlayn savdo uchun vaucher/soliq imtiyozi; IT Park rezidentlarini mahalliy KOB buyurtmalariga bog‘lash.', 'Kutiladigan natija', 'Raqamli kapital (d) firmaga yetib boradi.'],
    ['Sifatni o‘lchash', 'Muammo', 'Statistika «nechta odam ulangan»ni o‘lchaydi, «qanday foydalanilmoqda»ni emas.', 'Taklif', 'Firmalarda AKTdan foydalanish bo‘yicha yillik so‘rov va tezlik/ishonchlilik standarti — «Raqamli O‘zbekiston — 2030» monitoringiga qo‘shish [3].', 'Kutiladigan natija', 'Siyosat natijani o‘lchab boshqariladi.'],
  ];
  props.forEach(([h, a1, b1, a2, b2, a3, b3], i) => {
    const x = X0 + i * 4.1, k = i + 1;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.7, w: 3.9, h: 4.95, rectRadius: 0.08, fill: { color: 'FFFFFF' }, line: { color: HEX.rule, width: 1 }, objectName: `k${k}|taklif-fon` });
    s.addShape(pres.shapes.OVAL, { x: x + 0.22, y: 1.88, w: 0.44, h: 0.44, fill: { color: HEX.fiber }, line: { type: 'none' }, objectName: `k${k}|taklif-raqam` });
    s.addText(String(i + 1), { x: x + 0.22, y: 1.88, w: 0.44, h: 0.44, fontFace: HEAD, fontSize: 16, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0, isTextBox: true, objectName: `k${k}|taklif-raqam-matn` });
    s.addText(h, { x: x + 0.78, y: 1.82, w: 2.95, h: 0.62, fontFace: HEAD, fontSize: 15, bold: true, color: HEX.ink, margin: 0, valign: 'middle', isTextBox: true, objectName: `k${k}|taklif-sarlavha` });
    const lab = (t) => ({ text: t, options: { fontFace: HEAD, bold: true, fontSize: 12, color: HEX.muted, breakLine: true, paraSpaceAfter: 2 } });
    const body = (t, last1) => ({ text: t, options: { fontSize: 15, color: HEX.ink, breakLine: !last1, paraSpaceAfter: 12 } });
    s.addText([lab(a1), body(b1), lab(a2), body(b2), lab(a3), { text: b3, options: { fontFace: HEAD, bold: true, fontSize: 15, color: HEX.uzbT } }], { x: x + 0.22, y: 2.6, w: 3.46, h: 3.95, margin: 0, valign: 'top', isTextBox: true, objectName: `k${k}|taklif` });
  });
  src(s, 'Manbalar: [3], [7], [10]; takliflar — talaba xulosasi', 0);
  notes(s, 'Takliflar (≈1 daqiqa)', `Tahlildan kelib chiqib, uchta taklif beraman.
▶ Birinchisi — ish joyida raqamli ko‘nikma. Akerman tadqiqoti ko‘rsatganidek, internet malakali xodimga foyda beradi.
▶ Ikkinchisi — kichik biznesni raqamlashtirish: bulutli dasturlar va onlayn savdo uchun imtiyozlar. Shunda raqamli kapital firmalarga yetib boradi.
▶ Uchinchisi — o‘lchash. Hozir statistika qancha odam ulanganini o‘lchaydi, lekin internetdan ishda qanday foydalanilayotganini o‘lchamaydi. Buni «Raqamli O‘zbekiston — 2030» strategiyasi monitoringiga qo‘shish kerak.`);
}

/* ================= 15. MANBALAR ================= */
{
  pres.addSection({ title: 'Manbalar' });
  const s = newSlide('Manbalar', -1);
  title(s, 'Manbalar');
  const refs = [
    'World Bank. World Development Indicators: IT.NET.USER.ZS, IT.NET.BBND.P2 (ITU ma’lumoti), SL.GDP.PCAP.EM.KD (XMT ma’lumoti); yangilangan 08.10.2026. https://data.worldbank.org',
    'International Telecommunication Union (ITU). Statistics: Individuals using the Internet; Fixed broadband subscriptions. https://www.itu.int/en/ITU-D/Statistics',
    'O‘zbekiston Respublikasi Prezidentining PF-6079-son Farmoni, 05.10.2020. «Raqamli O‘zbekiston — 2030» strategiyasi. https://lex.uz/docs/7008256',
    'Solow R. (1987). We’d Better Watch Out. New York Times Book Review, 12 July 1987, p. 36.',
    'Czernich N., Falck O., Kretschmer T., Woessmann L. (2011). Broadband Infrastructure and Economic Growth. The Economic Journal, 121(552), 505–532.',
    'ITU (2019). Economic contribution of broadband, digitization and ICT regulation (R. Katz, F. Callorda); Econometric modelling for the Asia-Pacific region. https://www.itu.int/en/ITU-D/Regulatory-Market/Pages/Economic-Contribution.aspx',
    'Akerman A., Gaarder I., Mogstad M. (2015). The Skill Complementarity of Broadband Internet. Quarterly Journal of Economics, 130(4), 1781–1824.',
    'Hjort J., Poulsen J. (2019). The Arrival of Fast Internet and Employment in Africa. American Economic Review, 109(3), 1032–1079.',
    'Brynjolfsson E., Rock D., Syverson C. (2021). The Productivity J-Curve: How Intangibles Complement General Purpose Technologies. AEJ: Macroeconomics, 13(1), 333–372.',
    'IT Park Uzbekistan (2024). Results of 2023: transformation and plans for 2024. https://www.it-park.uz/en/itpark/news/results-of-2023-transformation-and-plans-for-2024',
    'Jorgenson D., Stiroh K. (2000). Raising the Speed Limit: U.S. Economic Growth in the Information Age. Brookings Papers on Economic Activity, 2000(1), 125–235.',
  ];
  const runs = refs.map((r, i) => ({ text: `[${i + 1}]  ${r}`, options: { breakLine: i < refs.length - 1, paraSpaceAfter: 7 } }));
  s.addText(runs, { x: X0, y: 1.55, w: 12.13, h: 5.25, fontFace: HEAD, fontSize: 12, color: HEX.ink, margin: 0, valign: 'top', isTextBox: true, objectName: 'manbalar' });
  s.addText('Rahmat! Savollaringizga tayyorman.', { x: X0, y: 6.75, w: 8, h: 0.4, fontFace: HEAD, fontSize: 18, bold: true, color: HEX.fiber, margin: 0, isTextBox: true, objectName: 'k1|rahmat' });
  notes(s, 'Manbalar', 'Bu slayd gapirilmaydi. Savol bo‘lsa, kerakli manbaga ko‘rsatiladi. Barcha statistik raqamlar [1] dan, regressiyalar — talaba hisobi (raqamli/data/data.json, raqamli/build.js).');
}

if (no !== TOTAL) throw new Error(`TOTAL=${TOTAL}, lekin ${no} ta slayd`);
(async () => {
  await pres.writeFile({ fileName: OUT });
  if (SKILL_THEME) await require(SKILL_THEME).applyTheme(OUT, THEME);
  console.log(`PPTX: ${OUT} (${no} slayd)`);
})();
