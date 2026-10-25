// HTML taqdimotning PowerPoint (PPTX) nusxasi: grafiklar PowerPoint'ning o‘z (tahrirlanadigan) grafiklari,
// raqamlar data/data.json va faktlar_va_manbalar.md dan, ssenariy ma’ruzachi eslatmalarida.
// Ishga tushirish: npm run pptx  (keyin tools/pptx-animate.py bosish animatsiyalarini qo‘shadi)
//
// Bosish bilan ochiladigan elementlar objectName'i "k<qadam>|nom" ko‘rinishida yoziladi;
// pptx-animate.py shu nomlardan animatsiya ketma-ketligini quradi.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const pptxgen = require('pptxgenjs');

const root = path.join(__dirname, '..');
const D = JSON.parse(fs.readFileSync(path.join(root, 'data/data.json'), 'utf8'));
const OUT = process.argv[2] || path.join(root, 'pptx/aqsh-taqdimot.pptx');
const SKILL_THEME = process.env.APPLY_THEME; // apply_theme.js yo‘li (ixtiyoriy)

// ssenariy: taqdimot/js/notes.js (window.NOTES)
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'taqdimot/js/notes.js'), 'utf8'), ctx);
const NOTES = ctx.window.NOTES;

/* ---------- mavzu ---------- */
const HEX = {
  ink: '141414', muted: '55524B', rule: 'D6D0C2', paper: 'F7F5F0', paper2: 'EEEAE0', src: '77736A',
  ind: '1C3F94', ind2: '7F9BD6', serv: 'F59F00', servT: 'B86E00', agri: '2F9E44', agri2: '9CD3A6', agriT: '237A34',
  constr: '9C36B5', constr2: 'D7A6E3', red: 'C92A2A', hwy: '00653A', road: '2E2E2E', yel: 'F5C400', gray: '8B887F',
};
const THEME = {
  name: 'AQSh avtomagistrali',
  headFontFace: 'IBM Plex Sans',
  bodyFontFace: 'Cambria',
  colors: {
    dk1: HEX.ink, lt1: 'FFFFFF', dk2: HEX.muted, lt2: HEX.paper,
    accent1: HEX.ind, accent2: HEX.serv, accent3: HEX.agri, accent4: HEX.constr, accent5: HEX.hwy, accent6: HEX.red,
    hlink: HEX.hwy, folHlink: HEX.muted,
  },
};
const HEAD = '+mj-lt'; // IBM Plex Sans (mavzu sarlavha shrifti)
const SECT = [
  { k: 'ind', name: 'Sanoat', c: HEX.ind, t: HEX.ind },
  { k: 'serv', name: 'Xizmatlar', c: HEX.serv, t: HEX.servT },
  { k: 'agri', name: 'Qishloq xo‘jaligi', c: HEX.agri, t: HEX.agriT },
  { k: 'constr', name: 'Qurilish', c: HEX.constr, t: HEX.constr },
];
const LANE = Object.fromEntries(SECT.map((s) => [s.k, s]));

/* ---------- raqamlar (HTML'dagi fmt bilan bir xil) ---------- */
const Y = D.years;
const n = Y.length - 1;
function fmt(v, dec = 1, plus = false) {
  const s = Math.max(0, Math.abs(v) - 1e-9 * 10 ** -dec).toFixed(dec);
  const [i, f] = s.split('.');
  let out = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (f ? ',' + f : '');
  if (Number(s) !== 0) { if (v < 0) out = '−' + out; else if (plus) out = '+' + out; }
  return out;
}
const at = (a, yr) => a[Y.indexOf(yr)];
const last = (a) => a[a.length - 1];
const toIdx = (a) => a.map((v) => (v / a[0]) * 100);
const yoy = (a) => a.map((v, i) => (i ? (v / a[i - 1] - 1) * 100 : null));
const div = (a, k) => a.map((v) => v / k);
const change = (a) => (last(a) / a[0] - 1) * 100;
const cagr = (a) => ((last(a) / a[0]) ** (1 / n) - 1) * 100;
function coMove(k) {
  const g = yoy(D.realidx[k]), e = yoy(D.emp[k]);
  let up = 0, both = 0;
  for (let i = 1; i <= n; i++) if (g[i] > 0) { up++; if (e[i] > 0) both++; }
  return [both, up];
}
// o‘q yorliqlari: faqat har 5 yil (2000, 2005 …) — PowerPoint ham, LibreOffice ham bir xil ko‘rsatadi
const YL = Y.map((y) => (y % 5 === 0 ? String(y) : ''));

/* ---------- taqdimot ---------- */
const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13,333" × 7,5" (1920×1080 sahna: 1 px = 1/144")
pres.title = 'AQSh iqtisodiyotining asosiy tarmoqlari: 2000–2025';
pres.author = '3-guruh';
pres.subject = 'AQSh iqtisodiyoti tarmoqlari tahlili';
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;
const W = 13.333;
const X0 = 0.625, LW = 7.5, RX = 8.61, RW = 4.08;

const road = (extra = []) => [
  { rect: { x: 0, y: 7.29, w: W, h: 0.21, fill: { color: HEX.road } } },
  { line: { x: 0, y: 7.395, w: W, h: 0, line: { color: 'E9E3C8', width: 2, dashType: 'dash', transparency: 45 } } },
  ...extra,
];
pres.defineSlideMaster({
  title: 'MUQOVA',
  background: { color: HEX.paper },
  objects: road(),
});
pres.defineSlideMaster({
  title: 'MAZMUN',
  background: { color: HEX.paper },
  margin: [0.4, 0.625, 0.6, 0.625],
  objects: road([
    { placeholder: { options: { name: 'title', type: 'title', x: X0, y: 0.4, w: 9.2, h: 1.08, align: 'left', fontFace: THEME.headFontFace, fontSize: 30, bold: true, color: C.text1, valign: 'top', margin: 0, lineSpacingMultiple: 0.95 }, text: '' } },
  ]),
});

let slideNo = 0;
const TOTAL = 22;
function newSlide(section, master = 'MAZMUN') {
  slideNo++;
  const s = pres.addSlide({ masterName: master, sectionTitle: section });
  // yo‘l bo‘ylab progress
  if (slideNo > 1) s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 7.375, w: (W * (slideNo - 1)) / (TOTAL - 1), h: 0.045, fill: { color: HEX.yel }, line: { type: 'none' }, objectName: 'progress' });
  return s;
}
const nm = (k, name) => (k ? `k${k}|${name}` : name);

/* ---------- qayta ishlatiladigan bloklar ---------- */
function title(s, text) { s.addText(text, { placeholder: 'title' }); }
function lede(s, text) {
  s.addText(text, { x: X0, y: 1.42, w: 9.2, h: 0.34, fontSize: 14, italic: true, color: C.text2, margin: 0, isTextBox: true, objectName: 'lede' });
}
// AQSh yo‘l belgisi: yuqorida "CHIQISH n" yorlig‘i, pastda tarmoq rangidagi chiziq
function sign(s, name, lane) {
  const w = Math.max(1.9, 0.62 + name.length * 0.13), right = 12.71, x = right - w;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: right - 1.5, y: 0.36, w: 1.32, h: 0.42, rectRadius: 0.08, fill: { color: HEX.hwy }, line: { color: 'FFFFFF', width: 1.5 }, objectName: 'sign-tab' });
  s.addText(`CHIQISH ${slideNo}`, { x: right - 1.5, y: 0.37, w: 1.32, h: 0.3, fontFace: HEAD, fontSize: 11, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0, charSpacing: 1, isTextBox: true, objectName: 'sign-tab-text' });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x - 0.04, y: 0.62, w: w + 0.08, h: 0.66, rectRadius: 0.1, fill: { color: HEX.hwy }, line: { type: 'none' }, objectName: 'sign-outer' });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 0.66, w, h: 0.58, rectRadius: 0.08, fill: { color: HEX.hwy }, line: { color: 'FFFFFF', width: 2 }, objectName: 'sign-panel' });
  s.addText(name, { x, y: 0.66, w, h: 0.58, fontFace: HEAD, fontSize: 17, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0, isTextBox: true, objectName: 'sign-name' });
  s.addShape(pres.shapes.RECTANGLE, { x: x + 0.12, y: 1.34, w: w - 0.24, h: 0.055, fill: { color: lane ? LANE[lane].c : '9A9A9A' }, line: { type: 'none' }, objectName: 'sign-lane' });
}
function speaker(s, who, lane) {
  if (!who) return;
  s.addShape(pres.shapes.OVAL, { x: X0, y: 6.93, w: 0.085, h: 0.085, fill: { color: lane ? LANE[lane].c : HEX.muted }, line: { type: 'none' }, objectName: 'speaker-dot' });
  s.addText(who, { x: X0 + 0.15, y: 6.84, w: 5, h: 0.27, fontFace: HEAD, fontSize: 12, color: C.text2, margin: 0, valign: 'middle', isTextBox: true, objectName: 'speaker' });
}
function notes(s, id) {
  const nt = NOTES[id];
  if (!nt) return;
  const head = nt.who ? `Gapiradi: ${nt.who}, ${nt.time}\n\n` : '';
  s.addNotes(head + nt.text.trim().split(/\n+/).map((p) => (p.startsWith('▶') ? '[▶ bosing] ' + p.slice(1).trim() : p)).join('\n\n'));
}
function src(s, x, y, w, text, k) {
  s.addText(text, { x, y, w, h: 0.24, fontFace: HEAD, fontSize: 11, color: HEX.src, margin: 0, isTextBox: true, objectName: nm(k, 'manba') });
}
// katta raqam + izoh
function big(s, x, y, w, num, cap, color, k, size = 36) {
  s.addText(num, { x, y, w, h: size / 60, fontFace: HEAD, fontSize: size, bold: true, color, margin: 0, valign: 'bottom', isTextBox: true, objectName: nm(k, 'katta-raqam') });
  s.addText(cap, { x, y: y + size / 60 + 0.04, w, h: 0.42, fontFace: HEAD, fontSize: 12, color: C.text2, margin: 0, valign: 'top', isTextBox: true, objectName: nm(k, 'katta-raqam-izoh') });
}
// "Nega?" — sariq romb (ogohlantirish belgisi) bilan
function why(s, x, y, w, h, body, k, heading = 'Nega?', size = 14) {
  s.addShape(pres.shapes.DIAMOND, { x, y: y + 0.01, w: 0.3, h: 0.3, fill: { color: HEX.yel }, line: { color: HEX.ink, width: 1.5 }, objectName: nm(k, 'nega-belgi') });
  s.addText('?', { x, y: y + 0.01, w: 0.3, h: 0.3, fontFace: HEAD, fontSize: 11, bold: true, color: HEX.ink, align: 'center', valign: 'middle', margin: 0, isTextBox: true, objectName: nm(k, 'nega-belgi-matn') });
  s.addText(heading, { x: x + 0.4, y, w: w - 0.4, h: 0.32, fontFace: HEAD, fontSize: 15, bold: true, color: C.text1, margin: 0, valign: 'middle', isTextBox: true, objectName: nm(k, 'nega-sarlavha') });
  let runs;
  if (Array.isArray(body) && body[0] && body[0].options) runs = body; // tayyor matn bo‘laklari
  else if (Array.isArray(body)) {
    runs = [];
    body.forEach((item, i) => {
      const parts = Array.isArray(item) ? item : [item];
      parts.forEach((p, j) => {
        const t = typeof p === 'string' ? { text: p } : p;
        runs.push({ text: t.text, options: { bold: !!t.bold, bullet: { indent: 14 }, breakLine: j === parts.length - 1 && i < body.length - 1, paraSpaceAfter: 6 } });
      });
    });
  } else runs = body;
  s.addText(runs, { x, y: y + 0.42, w, h, fontSize: size, color: C.text1, margin: 0, valign: 'top', lineSpacingMultiple: 1.05, isTextBox: true, objectName: nm(k, 'nega-matn') });
}
// "Bu nimani anglatadi?"
function means(s, x, y, w, h, text, lane, k) {
  s.addShape(pres.shapes.RECTANGLE, { x, y, w: 0.07, h, fill: { color: lane ? LANE[lane].c : HEX.ink }, line: { type: 'none' }, objectName: nm(k, 'anglatadi-chiziq') });
  s.addText('Bu nimani anglatadi?', { x: x + 0.22, y: y + 0.02, w: w - 0.22, h: 0.24, fontFace: HEAD, fontSize: 12, bold: true, color: C.text2, margin: 0, isTextBox: true, objectName: nm(k, 'anglatadi-sarlavha') });
  s.addText(text, { x: x + 0.22, y: y + 0.3, w: w - 0.22, h: h - 0.32, fontFace: HEAD, fontSize: 17, bold: true, color: C.text1, margin: 0, valign: 'top', isTextBox: true, objectName: nm(k, 'anglatadi-matn') });
}

/* ---------- grafik yordamchilari ---------- */
// Ichki chizma maydoni qo‘lda belgilanadi — izoh va yorliqlarni aniq joyga qo‘yish uchun.
function frame(x, y, w, h, o) {
  const L = Object.assign({ l: 0.1, t: 0.04, r: 0.03, b: 0.13 }, o.pad);
  const px = x + L.l * w, py = y + L.t * h, pw = w * (1 - L.l - L.r), ph = h * (1 - L.t - L.b);
  return {
    opts: {
      x, y, w, h,
      layout: { x: L.l, y: L.t, w: 1 - L.l - L.r, h: 1 - L.t - L.b },
      valAxisMinVal: o.min, valAxisMaxVal: o.max, valAxisMajorUnit: o.step,
      valAxisLabelFormatCode: o.fmt || '[>=1000]# ##0;[<=-1000]−# ##0;0;0',
      catAxisLabelFontFace: HEAD, valAxisLabelFontFace: HEAD, catAxisLabelFontSize: 11, valAxisLabelFontSize: 11,
      catAxisLabelColor: HEX.muted, valAxisLabelColor: HEX.muted, catAxisLabelRotate: 0,
      valGridLine: { color: HEX.rule, size: 0.75 }, catGridLine: { style: 'none' },
      catAxisLineShow: true, catAxisLineColor: HEX.ink, catAxisLineSize: 1.5, valAxisLineShow: false,
      catAxisMajorTickMark: 'none', valAxisMajorTickMark: 'none',
      showLegend: false, plotArea: { fill: { color: HEX.paper, transparency: 100 } }, chartArea: { fill: { color: HEX.paper, transparency: 100 } },
      objectName: o.name,
    },
    cx: (i, cnt) => px + ((i + 0.5) * pw) / cnt,
    vy: (v) => py + (ph * (o.max - v)) / (o.max - o.min),
    px, py, pw, ph,
  };
}
const hidden = { valAxisHidden: true, catAxisHidden: true, valGridLine: { style: 'none' }, catAxisLineShow: false };
function unit(s, x, y, text, k) {
  s.addText(text, { x, y: y - 0.3, w: 5, h: 0.24, fontFace: HEAD, fontSize: 11, color: C.text2, margin: 0, isTextBox: true, objectName: nm(k, 'birlik') });
}
function label(s, x, y, text, k, o = {}) {
  const w = o.w || 2.2;
  const ax = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
  s.addText(text, { x: ax, y: y - 0.13, w, h: o.h || 0.26, fontFace: HEAD, fontSize: o.size || 11, bold: o.bold !== false, color: o.color || HEX.ink, align: o.align || 'left', valign: o.valign || 'middle', margin: 0, isTextBox: true, objectName: nm(k, o.name || 'yorliq') });
}
const series = (name, values) => ({ name, labels: YL, values: values.map((v) => (v == null ? null : +v.toFixed(3))) });

/* ---------- jadvallar ---------- */
const TY = [2000, 2005, 2010, 2015, 2020, 2025];
const TB = { fontFace: HEAD, fontSize: 12, color: HEX.ink, margin: [0.04, 0.06, 0.03, 0.06], valign: 'middle' };
const noB = { type: 'none' };
const cell = (text, o = {}) => ({ text, options: Object.assign({}, TB, { align: 'right', border: [noB, noB, { pt: 0.75, color: HEX.rule }, noB] }, o) });
const head = (text, o = {}) => cell(text, Object.assign({ bold: true, border: [noB, noB, { pt: 2, color: HEX.ink }, noB] }, o));
function sectorTable(s, k, x, y, w, step) {
  const rows = [
    ['Qo‘shilgan qiymat, mlrd $', div(D.nominal[k], 1000), k === 'agri' ? 1 : 0],
    ['YaIMdagi ulush, %', D.share[k], k === 'agri' ? 2 : 1],
    ['Real hajm, 2000 = 100', D.realidx[k], 1],
    ['Bandlik, mln kishi', div(D.emp[k], 1000), k === 'serv' ? 1 : 2],
  ];
  const data = [[head('', { align: 'left' }), ...TY.map((t) => head(String(t)))]];
  rows.forEach(([lab, arr, dec]) => data.push([cell(lab, { align: 'left', color: HEX.muted }), ...TY.map((t) => cell(fmt(at(arr, t), dec)))]));
  s.addTable(data, { x, y, w, colW: [2.4, ...TY.map(() => (w - 2.4) / TY.length)], rowH: 0.31, objectName: nm(step, 'jadval') });
}

/* ================= SLAYDLAR ================= */

// 1. MUQOVA
{
  pres.addSection({ title: 'Kirish' });
  const s = newSlide('Kirish', 'MUQOVA');
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.58, y: 0.43, w: 9.53, h: 2.33, rectRadius: 0.16, fill: { color: HEX.hwy }, line: { type: 'none' }, objectName: 'belgi-tashqi' });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.65, y: 0.5, w: 9.39, h: 2.19, rectRadius: 0.13, fill: { color: HEX.hwy }, line: { color: 'FFFFFF', width: 3 }, objectName: 'belgi' });
  s.addText('3-guruh  ·  Iqtisodiyot tarmoqlari tahlili', { x: 1.05, y: 0.78, w: 8.6, h: 0.3, fontFace: HEAD, fontSize: 14, bold: true, color: 'FFFFFF', charSpacing: 1, margin: 0, isTextBox: true, objectName: 'guruh' });
  s.addText('AQSh iqtisodiyotining asosiy tarmoqlari: 2000–2025', { x: 1.05, y: 1.14, w: 8.6, h: 1.3, fontFace: HEAD, fontSize: 40, bold: true, color: 'FFFFFF', margin: 0, valign: 'top', lineSpacingMultiple: 0.95, isTextBox: true, objectName: 'sarlavha' });
  SECT.slice().sort((a, b) => ['serv', 'ind', 'constr', 'agri'].indexOf(a.k) - ['serv', 'ind', 'constr', 'agri'].indexOf(b.k)).forEach((t, i) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 1.05 + i * 1.14, y: 2.92, w: 1.04, h: 0.1, rectRadius: 0.05, fill: { color: t.c }, line: { type: 'none' }, objectName: 'tarmoq-chizigi' });
  });
  // Interstate qalqoni
  s.addShape(pres.shapes.FLOWCHART_OFFPAGE_CONNECTOR, { x: 11.55, y: 0.5, w: 1.18, h: 1.25, fill: { color: HEX.ind }, line: { color: 'FFFFFF', width: 3 }, objectName: 'qalqon' });
  s.addShape(pres.shapes.RECTANGLE, { x: 11.62, y: 0.57, w: 1.04, h: 0.27, fill: { color: HEX.red }, line: { type: 'none' }, objectName: 'qalqon-tepa' });
  s.addText('AQSh', { x: 11.55, y: 0.57, w: 1.18, h: 0.27, fontFace: HEAD, fontSize: 12, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0, isTextBox: true, objectName: 'qalqon-matn' });
  s.addText([{ text: '25', options: { fontSize: 32, bold: true, breakLine: true } }, { text: 'yil', options: { fontSize: 12, bold: true } }], { x: 11.55, y: 0.86, w: 1.18, h: 0.75, fontFace: HEAD, color: 'FFFFFF', align: 'center', valign: 'top', margin: 0, lineSpacingMultiple: 0.85, isTextBox: true, objectName: 'qalqon-25' });
  s.addText('25 YILDA AMERIKA BOYLIGINI QAYSI TARMOQ YARATDI, ODAMLAR QAYERDA ISHLAY BOSHLADI VA BUNDA YO‘L, ENERGIYA, INTERNET QANDAY ROL O‘YNADI?', { x: X0, y: 3.3, w: 10.4, h: 1.2, fontFace: HEAD, fontSize: 20, bold: true, color: C.text1, margin: 0, valign: 'top', lineSpacingMultiple: 1.1, isTextBox: true, objectName: 'k1|markaziy-savol' });
  s.addText('10,3 → 30,9 trln $', { x: X0, y: 5.05, w: 7, h: 0.95, fontFace: HEAD, fontSize: 54, bold: true, color: C.text1, margin: 0, valign: 'bottom', isTextBox: true, objectName: 'k2|yaim' });
  s.addText('AQSh YaIMi, joriy narxda, 2000 → 2025  ·  Manba: BEA [1]', { x: X0, y: 6.06, w: 7, h: 0.28, fontFace: HEAD, fontSize: 12, color: C.text2, margin: 0, isTextBox: true, objectName: 'k2|yaim-izoh' });
  s.addText([
    { text: 'Guruh a’zolari', options: { bold: true, breakLine: true } },
    { text: 'O‘rolov Shahzod  ·  Otamurodov Muhammadali', options: { breakLine: true } },
    { text: 'Qahramonov Zafarbek  ·  Saitmurodova Visola', options: { breakLine: true } },
    { text: 'Qo‘ziboyev Aslbek' },
  ], { x: 7.9, y: 5.2, w: 4.81, h: 1.2, fontFace: HEAD, fontSize: 13, color: C.text1, align: 'right', valign: 'bottom', margin: 0, lineSpacingMultiple: 1.15, isTextBox: true, objectName: 'guruh-azolari' });
  speaker(s, 'O‘rolov Shahzod');
  notes(s, 'cover');
}

// 2. METODIKA
{
  const s = newSlide('Kirish');
  title(s, 'Iqtisodiyotni to‘rt tarmoqqa bo‘lsak, boylik qayerda yaratilayotgani ko‘rinadi');
  sign(s, 'Metodika');
  const defs = [
    ['ind', 'Sanoat', 'Kon qazish (neft, gaz, ko‘mir), elektr va gaz ta’minoti, zavodlar.'],
    ['serv', 'Xizmatlar', 'Mahsulot emas, xizmat sotiladigan soha: savdo, moliya, sog‘liq, ta’lim, IT, davlat.'],
    ['agri', 'Qishloq xo‘jaligi', 'Dehqonchilik, chorvachilik, o‘rmon va baliq xo‘jaligi.'],
    ['constr', 'Qurilish', 'Uy-joy, yo‘l, zavod va boshqa inshootlarni barpo etish.'],
  ];
  defs.forEach(([k, h, t], i) => {
    const x = X0 + (i % 2) * 3.85, y = 1.72 + Math.floor(i / 2) * 1.12;
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 0.07, h: 0.95, fill: { color: LANE[k].c }, line: { type: 'none' }, objectName: 'k1|tarif-chiziq' });
    s.addText([{ text: h, options: { fontFace: HEAD, bold: true, fontSize: 15, color: LANE[k].t, breakLine: true } }, { text: t, options: { fontSize: 13, color: HEX.ink } }], { x: x + 0.2, y, w: 3.4, h: 0.95, margin: 0, valign: 'top', paraSpaceAfter: 2, isTextBox: true, objectName: 'k1|tarif' });
  });
  const steps = [['1. Ma’lumot', 'BEA rasmiy statistikasi, 2000–2025'], ['2. Real o‘sish', 'narxlar o‘sishini olib tashlaymiz'], ['3. Taqqoslash', 'o‘sish, ulush va bandlik bo‘yicha']];
  steps.forEach(([h, t], i) => {
    const x = X0 + i * 2.62;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 4.06, w: 2.2, h: 0.95, rectRadius: 0.07, fill: { color: HEX.paper2 }, line: { type: 'none' }, objectName: 'k2|qadam' });
    s.addText([{ text: h, options: { fontFace: HEAD, bold: true, fontSize: 14, breakLine: true } }, { text: t, options: { fontSize: 12 } }], { x: x + 0.14, y: 4.06, w: 1.95, h: 0.95, color: HEX.ink, margin: 0, valign: 'middle', isTextBox: true, objectName: 'k2|qadam-matn' });
    if (i < 2) s.addText('→', { x: x + 2.2, y: 4.06, w: 0.42, h: 0.95, fontFace: HEAD, fontSize: 18, color: HEX.ink, align: 'center', valign: 'middle', margin: 0, isTextBox: true, objectName: 'k2|strelka' });
  });
  const gl = [['Nominal', 'joriy narxdagi pul hajmi.'], ['Real o‘sish', 'narxlar o‘sishini olib tashlagandagi haqiqiy hajm.'], ['Ulush', 'tarmoq YaIMning qancha qismini beradi.'], ['CAGR', 'o‘rtacha yillik o‘sish sur’ati.']];
  gl.forEach(([h, t], i) => {
    s.addText([{ text: h, options: { fontFace: HEAD, bold: true } }, { text: ' — ' + t }], { x: X0 + (i % 2) * 3.85, y: 5.25 + Math.floor(i / 2) * 0.55, w: 3.6, h: 0.5, fontSize: 12, color: HEX.ink, margin: 0, valign: 'top', isTextBox: true, objectName: 'k2|atama' });
  });
  why(s, RX, 1.72, RW, 1.9, 'YaIM — bitta raqam, u ichidagi o‘zgarishlarni yashiradi. Tarmoqlarga bo‘lsak, qaysi soha tez o‘sgani, qaysi biri ish o‘rni yo‘qotgani va nega shunday bo‘lgani ko‘rinadi.', 3);
  means(s, RX, 4.3, RW, 1.05, 'Pul hisobidagi o‘sishni har doim real o‘sish bilan tekshiramiz.', null, 4);
  speaker(s, 'O‘rolov Shahzod');
  notes(s, 'metod');
}

// 3. KATTA MANZARA
{
  const s = newSlide('Kirish');
  title(s, 'AQSh xizmatlar iqtisodiyotiga aylandi: ularning ulushi 76,6% dan 82,4% ga yetdi');
  sign(s, 'Katta manzara');
  const order = ['serv', 'ind', 'constr', 'agri'];
  [[2000, 1], [2025, 2]].forEach(([yr, k], r) => {
    const y = 1.78 + r * 0.98;
    s.addText(String(yr), { x: X0, y, w: 0.7, h: 0.76, fontFace: HEAD, fontSize: 18, bold: true, color: HEX.ink, margin: 0, valign: 'middle', isTextBox: true, objectName: nm(k, 'yil') });
    s.addChart(pres.charts.BAR, order.map((key) => ({ name: LANE[key].name, labels: [String(yr)], values: [at(D.share[key], yr)] })), {
      x: X0 + 0.7, y, w: LW - 0.7, h: 0.76, barDir: 'bar', barGrouping: 'percentStacked', barGapWidthPct: 0,
      layout: { x: 0, y: 0, w: 1, h: 1 }, ...hidden, showLegend: false,
      chartColors: order.map((key) => LANE[key].c),
      plotArea: { fill: { color: HEX.paper, transparency: 100 } }, chartArea: { fill: { color: HEX.paper, transparency: 100 } },
      objectName: nm(k, `ulush-${yr}`),
    });
    // ulush yorliqlari (o‘nlik vergul bilan) — xizmatlar va sanoat segmentlarida
    const bx = X0 + 0.7, bw = LW - 0.7, sv = at(D.share.serv, yr), iv = at(D.share.ind, yr);
    label(s, bx + 0.12, y + 0.38, fmt(sv, 1) + '%', k, { size: 14, w: 1.2 });
    label(s, bx + (bw * sv) / 100 + 0.1, y + 0.38, fmt(iv, 1) + '%', k, { size: 14, w: 1.1, color: 'FFFFFF' });
  });
  // jadval: 2000 → 2025
  const rows = [[head('YaIMdagi ulush, %', { align: 'left' }), head('2000'), head('2025'), head('o‘zgarish, f.p.')]];
  SECT.forEach((t) => {
    const dec = t.k === 'agri' ? 2 : 1, a = D.share[t.k][0], b = last(D.share[t.k]);
    rows.push([cell([{ text: '■ ', options: { color: t.c } }, { text: t.name, options: { bold: true } }], { align: 'left' }), cell(fmt(a, dec)), cell(fmt(b, dec)), cell(fmt(b - a, dec, true))]);
  });
  s.addTable(rows, { x: X0, y: 3.9, w: LW, colW: [3.3, 1.2, 1.2, 1.8], rowH: 0.32, objectName: 'k2|ulush-jadvali' });
  src(s, X0, 5.62, 3, 'Manba: BEA [1]', 2);
  s.addText([{ text: '76,6% → ', options: {} }, { text: '82,4%' }], { x: RX, y: 1.62, w: RW, h: 0.66, fontFace: HEAD, fontSize: 36, bold: true, color: HEX.servT, margin: 0, valign: 'bottom', isTextBox: true, objectName: 'k2|katta-raqam' });
  s.addText('xizmatlarning YaIMdagi ulushi', { x: RX, y: 2.31, w: RW, h: 0.26, fontFace: HEAD, fontSize: 12, color: C.text2, margin: 0, isTextBox: true, objectName: 'k2|katta-raqam-izoh' });
  big(s, RX, 2.7, RW, '+69,9%', 'real YaIM o‘sishi, 25 yilda', HEX.ink, 2, 28);
  why(s, RX, 3.55, RW, 1.95, [
    'Daromad oshgani sari odamlar pulni ko‘proq sog‘liq, ta’lim, moliya, dam olish va raqamli xizmatlarga sarflaydi.',
    'Sanoatda texnologiya kamroq odam bilan ko‘proq mahsulot beradi.',
    'Bu — strukturaviy o‘zgarish: umumiy qonuniyat, AQSh uning yorqin misoli.',
  ], 3, 'Nega?', 13);
  means(s, RX, 5.92, RW, 0.78, 'Sanoat qisqarmadi — xizmatlar undan ancha tez o‘sdi.', null, 4);
  speaker(s, 'O‘rolov Shahzod');
  notes(s, 'manzara');
}

// sektor slaydi uchun umumiy: chiziqli grafik
function lineChart(s, x, y, w, h, o) {
  const f = frame(x, y, w, h, o);
  const groups = [];
  o.series.forEach((sr) => groups.push({ type: pres.charts.LINE, data: [series(sr.name, sr.v)], options: { chartColors: [sr.color], lineSize: sr.w || 2.5, lineDataSymbol: 'none', lineDash: sr.dash || 'solid' } }));
  if (o.base100) groups.push({ type: pres.charts.LINE, data: [series('_100', Y.map(() => 100))], options: { chartColors: [HEX.ink], lineSize: 1, lineDataSymbol: 'none', lineDash: 'sysDot' } });
  s.addChart(groups, f.opts);
  return f;
}

// 4. SANOAT: O‘SISH
{
  pres.addSection({ title: 'Sanoat' });
  const s = newSlide('Sanoat');
  title(s, 'Sanoat ikki barobar o‘sdi, lekin YaIMdagi ulushi 17,9% dan 12,4% ga tushdi');
  lede(s, 'Sanoat — kon qazish (neft, gaz, ko‘mir), elektr va gaz ta’minoti hamda zavodlar.');
  sign(s, 'Sanoat', 'ind');
  const v = div(D.nominal.ind, 1000), g = yoy(D.realidx.ind);
  const o = { min: 0, max: 4000, step: 1000, name: 'k1|grafik' };
  const f = frame(X0, 2.2, LW, 2.45, o);
  unit(s, X0, 2.2, 'mlrd $, joriy narxda', 1);
  s.addChart(pres.charts.BAR, [series('Sanoat QQ', v)], { ...f.opts, barDir: 'col', barGapWidthPct: 40, chartColors: Y.map((yr) => (yr === 2009 || yr === 2020 ? HEX.ind2 : HEX.ind)) });
  label(s, f.cx(0, 26) - 0.12, f.vy(v[0]) - 0.18, fmt(v[0], 0), 1);
  label(s, f.cx(25, 26) + 0.14, f.vy(last(v)) - 0.18, fmt(last(v), 0), 1, { align: 'right' });
  [[2009, 3050], [2020, 3450]].forEach(([yr, ay]) => {
    const i = Y.indexOf(yr);
    s.addShape(pres.shapes.LINE, { x: f.cx(i, 26), y: f.vy(ay) + 0.1, w: 0, h: f.vy(v[i]) - f.vy(ay) - 0.16, line: { color: HEX.red, width: 1.25 }, objectName: 'k1|izoh-chiziq' });
    label(s, f.cx(i, 26) + (yr === 2020 ? 0.12 : 0), f.vy(ay), `${yr}: real ${fmt(at(g, yr), 1)}%`, 1, { color: HEX.red, align: yr === 2020 ? 'right' : 'center' });
  });
  src(s, X0, 4.7, 3, 'Manba: BEA [1]', 1);
  sectorTable(s, 'ind', X0, 5.03, LW, 2);
  src(s, X0, 6.6, 3, 'Manba: BEA [1], [2]', 2);
  big(s, RX, 1.9, 2.3, '+108,5%', 'qo‘shilgan qiymat, joriy narxda', HEX.ind, 1, 32);
  big(s, RX + 2.4, 1.9, 1.68, '1,89%', 'real o‘sish, yiliga o‘rtacha (CAGR)', HEX.ind, 1);
  why(s, RX, 3.2, RW, 1.8, 'Ikki barobar o‘sishning bir qismi — narxlar o‘sishi, real hajm sekinroq o‘sgan. Xizmatlar esa sanoatdan ancha tez o‘sdi, shuning uchun sanoat ulushi kamaydi. 2009 va 2020-yillardagi chuqurlar — moliyaviy inqiroz va pandemiya izi.', 3);
  means(s, RX, 5.6, RW, 0.95, 'Ulush kamayishi — tarmoq kichraydi degani emas.', 'ind', 4);
  speaker(s, 'Otamurodov Muhammadali', 'ind');
  notes(s, 'sanoat1');
}

// 5. SANOAT PARADOKSI — "qaychi"
{
  const s = newSlide('Sanoat');
  title(s, 'Sanoat 60% ko‘p mahsulot berdi, lekin 4,6 mln ish o‘rni yo‘qoldi');
  sign(s, 'Sanoat', 'ind');
  const real = D.realidx.ind, emp = toIdx(D.emp.ind), ex = D.realidx.manuf_excomp;
  const o = { min: 60, max: 180, step: 20, name: 'k1|qaychi', pad: { l: 0.08, r: 0.22, t: 0.04, b: 0.09 } };
  const box = [X0, 2.05, LW, 4.25];
  const f = frame(...box, o);
  unit(s, X0, 2.05, 'indeks, 2000 = 100', 1);
  // qaychi maydoni: pastki (bandlik) qatlam shaffof, ustki qatlam = real − bandlik
  s.addChart([
    { type: pres.charts.AREA, data: [series('_asos', emp), series('Qaychi', real.map((r, i) => r - emp[i]))], options: { barGrouping: 'stacked', chartColors: [HEX.paper, HEX.ind], chartColorsOpacity: 12 } },
    { type: pres.charts.LINE, data: [series('Real hajm', real)], options: { chartColors: [HEX.ind], lineSize: 3, lineDataSymbol: 'none' } },
    { type: pres.charts.LINE, data: [series('Bandlik', emp)], options: { chartColors: [HEX.red], lineSize: 3, lineDataSymbol: 'none' } },
    { type: pres.charts.LINE, data: [series('_100', Y.map(() => 100))], options: { chartColors: [HEX.ink], lineSize: 1, lineDataSymbol: 'none', lineDash: 'sysDot' } },
  ], f.opts);
  label(s, f.px + f.pw + 0.1, f.vy(last(real)), `Real hajm\n${fmt(change(real), 1, true)}%`, 1, { color: HEX.ind, h: 0.46 });
  label(s, f.px + f.pw + 0.1, f.vy(last(emp)), `Bandlik\n${fmt(change(D.emp.ind), 1, true)}%`, 1, { color: HEX.red, h: 0.46 });
  label(s, f.cx(15, 26), f.vy(88), `${fmt((D.emp.ind[0] - last(D.emp.ind)) / 1000, 1)} mln ish o‘rni yo‘qoldi`, 1, { align: 'center', w: 3 });
  // 2-qadam: kompyutersiz ishlab chiqarish — xuddi shu o‘qlardagi ustma-ust grafik
  s.addChart([{ type: pres.charts.LINE, data: [series('Kompyuter va elektronikasiz', ex)], options: { chartColors: [HEX.ind2], lineSize: 2.5, lineDataSymbol: 'none', lineDash: 'dash' } }], { ...frame(...box, { ...o, name: 'k2|kompyutersiz' }).opts, ...hidden });
  label(s, f.px + f.pw + 0.1, f.vy(last(ex)) + 0.12, `Kompyuter va\nelektronikasiz\n${fmt(change(ex), 0, true)}%`, 2, { color: HEX.ind, h: 0.66 });
  src(s, X0, 6.36, 3, 'Manba: BEA [1], [2]', 1);
  big(s, RX, 1.62, 1.95, '+59,8%', 'real hajm', HEX.ind, 1, 32);
  big(s, RX + 2.05, 1.62, 2.0, '−25,5%', 'bandlik: 18,05 → 13,45 mln', HEX.red, 1, 32);
  why(s, RX, 2.75, RW, 2.65, [
    'Xitoy importi qisqarishning kamida 1/4 qismini tushuntiradi [4].',
    'Avtomatlashtirish: o‘sishning katta qismi kompyuter va elektronikada — real hajm ×5,3 [5].',
    'Energiya: slanets inqilobi — 2023-yilda 12,9 mln barrel/kun, rekord; arzon gaz zavodlarni jalb qildi [8].',
  ], 3, 'Nega?', 13);
  means(s, RX, 5.72, RW, 0.95, 'Sanoat o‘sishi har doim ham yangi ish o‘rni yaratmaydi.', 'ind', 4);
  speaker(s, 'Otamurodov Muhammadali', 'ind');
  notes(s, 'sanoat2');
}

// 6. XIZMATLAR: O‘SISH
{
  pres.addSection({ title: 'Xizmatlar' });
  const s = newSlide('Xizmatlar');
  title(s, 'Xizmatlar eng tez o‘sgan tarmoq: real o‘sish yiliga o‘rtacha 2,32%');
  lede(s, 'Xizmatlar — savdo, transport, moliya, ko‘chmas mulk, sog‘liq, ta’lim, IT, mehmonxona va davlat sektori.');
  sign(s, 'Xizmatlar', 'serv');
  const emp = D.emp.serv.map((v, i) => (v / D.emp.total[i]) * 100);
  const o = { min: 74, max: 86, step: 4, name: 'k1|grafik', pad: { l: 0.07, r: 0.25, t: 0.04, b: 0.13 } };
  const f = lineChart(s, X0, 2.2, LW, 2.45, { ...o, series: [
    { name: 'YaIMdagi ulush', v: D.share.serv, color: HEX.serv, w: 3 },
    { name: 'Bandlikdagi ulush', v: emp, color: HEX.servT, w: 2.25, dash: 'dash' },
  ] });
  unit(s, X0, 2.2, '%', 1);
  label(s, f.px + f.pw + 0.1, f.vy(last(emp)) - 0.12, `Bandlikdagi ulush\n${fmt(last(emp), 1)}%`, 1, { color: HEX.servT, h: 0.46 });
  label(s, f.px + f.pw + 0.1, f.vy(last(D.share.serv)) + 0.16, `YaIMdagi ulush\n${fmt(last(D.share.serv), 1)}%`, 1, { color: HEX.servT, h: 0.46 });
  label(s, f.cx(0, 26) - 0.05, f.vy(D.share.serv[0]) + 0.22, fmt(D.share.serv[0], 1), 1, { color: HEX.servT });
  src(s, X0, 4.7, 3, 'Manba: BEA [1], [2]', 1);
  sectorTable(s, 'serv', X0, 5.03, LW, 2);
  src(s, X0, 6.6, 3, 'Manba: BEA [1], [2]', 2);
  big(s, RX, 1.9, RW, '+223,9%', 'qo‘shilgan qiymat: 7 850 → 25 429 mlrd $', HEX.servT, 1);
  big(s, RX, 3.0, RW, '84,6%', 'bandlikdagi ulush, 2025', HEX.servT, 1, 30);
  why(s, RX, 3.95, RW, 1.6, 'Odamlar boyigan sari pulni ko‘proq xizmatlarga sarflaydi. Shifokor, o‘qituvchi yoki sotuvchini mashina bilan almashtirish qiyin, shuning uchun o‘sish ish o‘rni bilan birga keladi: real o‘sgan 23 yilning 22 tasida bandlik ham oshdi.', 3, 'Nega?', 13);
  means(s, RX, 5.95, RW, 0.75, 'AQSh mehnat bozori endi asosan xizmatlar bozori.', 'serv', 4);
  speaker(s, 'Qahramonov Zafarbek', 'serv');
  notes(s, 'xizmat1');
}

// 7. XIZMATLAR VA INTERNET
{
  const s = newSlide('Xizmatlar');
  title(s, 'Internet xizmatlarni o‘stirdi, pandemiya esa ularni bir oyda keskin qisqartirdi');
  sign(s, 'Xizmatlar', 'serv');
  const v = div(D.emp.serv, 1000), g = yoy(D.realidx.serv);
  const o = { min: 80, max: 130, step: 10, name: 'k1|grafik', pad: { l: 0.07, r: 0.02, t: 0.04, b: 0.09 } };
  const box = [X0, 2.05, LW, 4.25];
  const f = frame(...box, o);
  unit(s, X0, 2.05, 'bandlik, mln kishi (o‘q 80 dan boshlanadi)', 1);
  s.addChart(pres.charts.BAR, [series('Xizmatlar bandligi', v)], { ...f.opts, barDir: 'col', barGapWidthPct: 40, chartColors: [HEX.serv] });
  // 2-qadam: 2020-yil ustuni qizil bo‘lib ajraladi
  s.addChart(pres.charts.BAR, [series('2020', v.map((x, i) => (Y[i] === 2020 ? x : null)))], { ...frame(...box, { ...o, name: 'k2|2020' }).opts, ...hidden, barDir: 'col', barGapWidthPct: 40, chartColors: [HEX.red] });
  label(s, f.cx(0, 26) - 0.12, f.vy(v[0]) - 0.18, fmt(v[0], 1), 1);
  const i20 = Y.indexOf(2020), i21 = Y.indexOf(2021);
  s.addShape(pres.shapes.LINE, { x: f.cx(i20, 26), y: f.vy(124) + 0.1, w: 0, h: f.vy(v[i20]) - f.vy(124) - 0.16, line: { color: HEX.red, width: 1.25 }, objectName: 'k2|izoh-chiziq' });
  label(s, f.cx(i20, 26) + 0.12, f.vy(124), '2020: pandemiya', 2, { color: HEX.red, align: 'right' });
  s.addShape(pres.shapes.LINE, { x: f.cx(i21, 26), y: f.vy(128.6) + 0.1, w: 0, h: f.vy(v[i21]) - f.vy(128.6) - 0.16, line: { color: HEX.ink, width: 1.25 }, objectName: 'k2|izoh-chiziq' });
  label(s, f.cx(i21, 26) - 0.12, f.vy(128.6), `2021: real ${fmt(at(g, 2021), 1, true)}%`, 2, { w: 1.9 });
  src(s, X0, 6.36, 3, 'Manba: BEA [2]', 1);
  big(s, RX, 1.62, RW, '−20,5 mln', 'ish o‘rni, faqat 2020-yil aprelida [7]', HEX.red, 2);
  why(s, RX, 2.85, RW, 2.6, [
    'Keng polosali internet: kattalarning 1% → 78% ida [11].',
    'Elektron savdo: chakana savdodagi ulushi 0,7% → 16,4% [10].',
    'Axborot sohasi 471 → 1 766 mlrd $; yetkazib beruvchi transport ×3,3 [1].',
    'Tiklanish ham tez bo‘ldi: 2021-yilda real o‘sish +6,7%.',
  ], 3, 'Nega?', 13);
  means(s, RX, 5.72, RW, 0.95, 'Xizmatlar eng ko‘p ish o‘rni beradi, lekin inqirozga eng sezgir.', 'serv', 4);
  speaker(s, 'Qahramonov Zafarbek', 'serv');
  notes(s, 'xizmat2');
}

// 8. QISHLOQ XO‘JALIGI
{
  pres.addSection({ title: 'Qishloq xo‘jaligi' });
  const s = newSlide('Qishloq xo‘jaligi');
  title(s, 'Qishloq xo‘jaligi YaIMning atigi 0,83% ini beradi, lekin butun mamlakatni boqadi');
  lede(s, 'Qishloq xo‘jaligi — dehqonchilik, chorvachilik, o‘rmon va baliq xo‘jaligi.');
  sign(s, 'Qishloq xo‘jaligi', 'agri');
  const nom = toIdx(D.nominal.agri), real = D.realidx.agri;
  const f = lineChart(s, X0, 2.2, LW, 2.45, { min: 80, max: 320, step: 60, name: 'k1|grafik', base100: true, pad: { l: 0.07, r: 0.22, t: 0.04, b: 0.13 }, series: [
    { name: 'Joriy narxda', v: nom, color: HEX.agri2, w: 2.5 },
    { name: 'Real hajm', v: real, color: HEX.agri, w: 3 },
  ] });
  unit(s, X0, 2.2, 'indeks, 2000 = 100', 1);
  label(s, f.px + f.pw + 0.1, f.vy(last(nom)) - 0.1, `Joriy narxda\n${fmt(change(D.nominal.agri), 1, true)}%`, 1, { color: HEX.agriT, h: 0.46 });
  label(s, f.px + f.pw + 0.1, f.vy(last(real)) + 0.2, `Real hajm\n${fmt(change(real), 0, true)}%`, 1, { color: HEX.agriT, h: 0.46 });
  src(s, X0, 4.7, 3, 'Manba: BEA [1]', 1);
  sectorTable(s, 'agri', X0, 5.03, LW, 2);
  src(s, X0, 6.6, 3, 'Manba: BEA [1], [2]', 2);
  big(s, RX, 1.9, 2.2, '+158,7%', 'qo‘shilgan qiymat, joriy narxda', HEX.agriT, 1);
  big(s, RX + 2.35, 1.9, 1.7, '+43%', 'real hajm', HEX.agriT, 1);
  why(s, RX, 3.2, RW, 2.2, [
    { text: 'Unumdorlik juda yuqori: oz odam butun mamlakatni boqadi va eksport ham qiladi. Oziq-ovqatga talab esa daromad bilan birga tez o‘smaydi.', options: { breakLine: true, paraSpaceAfter: 8 } },
    { text: 'Bandlik: FTE ~1,2 mln — o‘zini o‘zi band qilgan fermerlarsiz. Ular bilan birga Jahon banki bahosi: 2,4% → 1,5% [3].', options: { fontSize: 12, color: HEX.muted } },
  ], 3, 'Nega ulushi kichik?', 13);
  means(s, RX, 5.85, RW, 0.8, 'Kichik ulush — kichik ahamiyat degani emas.', 'agri', 4);
  speaker(s, 'Saitmurodova Visola', 'agri');
  notes(s, 'qishloq1');
}

// 9. QISHLOQ: BEQARORLIK
{
  const s = newSlide('Qishloq xo‘jaligi');
  title(s, 'Qishloq xo‘jaligi — eng beqaror tarmoq: ob\u2011havo, narx va siyosatga bog‘liq');
  sign(s, 'Qishloq xo‘jaligi', 'agri');
  const g = yoy(D.realidx.agri), yrs = Y;
  const o = { min: -16, max: 12, step: 4, name: 'k1|grafik', fmt: '[<0]−0;0', freq: 5, pad: { l: 0.06, r: 0.02, t: 0.04, b: 0.11 } };
  const f = frame(X0, 2.05, LW, 3.0, o);
  unit(s, X0, 2.05, 'real o‘sish, oldingi yilga nisbatan, %', 1);
  s.addChart(pres.charts.BAR, [{ name: 'Real o‘sish', labels: YL, values: g.map((x) => (x == null ? null : +x.toFixed(2))) }], { ...f.opts, barDir: 'col', barGapWidthPct: 40, catAxisLabelPos: 'low', catAxisLabelRotate: 0, chartColors: g.map((x) => (x != null && x < 0 ? HEX.red : HEX.agri)) });
  [[2007, ''], [2009, ''], [2012, 'qurg‘oqchilik '], [2013, ''], [2019, 'toshqin ']].forEach(([yr, pre]) => {
    const i = yrs.indexOf(yr), val = g[i];
    label(s, f.cx(i, yrs.length), val >= 0 ? f.vy(val) - 0.16 : f.vy(val) + 0.18, pre + fmt(val, 1, true), 1, { align: 'center', w: 2 });
  });
  src(s, X0, 5.12, 3, 'Manba: BEA [1]', 1);
  [['<17% → >50%', 'sug‘oriladigan yer hosil maydonining 17% idan kam, lekin ekin sotuvi qiymatining yarmidan ko‘pini beradi [9]'], ['~60%', 'don eksporti Missisipi daryosida barjalarda tashiladi [9]']].forEach(([b, t], i) => {
    const x = X0 + i * 3.85;
    s.addShape(pres.shapes.RECTANGLE, { x, y: 5.5, w: 3.6, h: 0.05, fill: { color: HEX.agri }, line: { type: 'none' }, objectName: 'k3|infra-chiziq' });
    s.addText(b, { x, y: 5.6, w: 3.6, h: 0.42, fontFace: HEAD, fontSize: 22, bold: true, color: HEX.agriT, margin: 0, isTextBox: true, objectName: 'k3|infra-raqam' });
    s.addText(t, { x, y: 6.04, w: 3.6, h: 0.65, fontSize: 12, color: HEX.ink, margin: 0, valign: 'top', isTextBox: true, objectName: 'k3|infra-matn' });
  });
  why(s, RX, 1.75, RW, 3.2, [
    { text: 'Qo‘shilgan qiymat = mahsulot − xarajatlar (yem, yoqilg‘i, o‘g‘it). Shuning uchun kichik o‘zgarish katta sakrash beradi.', options: { breakLine: true, paraSpaceAfter: 8 } },
    { text: '2012 — qurg‘oqchilik: makkajo‘xori hosildorligi 1995-yildan beri eng past.', options: { bullet: { indent: 14 }, breakLine: true, paraSpaceAfter: 6 } },
    { text: '2019 — toshqin: rekord 18,8 mln akr yer ekilmay qoldi.', options: { bullet: { indent: 14 }, breakLine: true, paraSpaceAfter: 6 } },
    { text: 'Savdo urushi: fermerlarga 23 mlrd $ kompensatsiya [9].', options: { bullet: { indent: 14 } } },
  ], 2, 'Nega?', 13);
  means(s, RX, 5.6, RW, 1.05, 'Suv va ishonchli transport — fermerning ob-havoga qarshi sug‘urtasi.', 'agri', 4);
  speaker(s, 'Saitmurodova Visola', 'agri');
  notes(s, 'qishloq2');
}

// 10. QURILISH: PUL VA HAJM
{
  pres.addSection({ title: 'Qurilish' });
  const s = newSlide('Qurilish');
  title(s, 'Qurilishda pul ko‘paydi, hajm emas: real hajm 2000-yildagidan past');
  lede(s, 'Qurilish — uy-joy, yo‘l, zavod va boshqa inshootlarni barpo etish.');
  sign(s, 'Qurilish', 'constr');
  const nom = toIdx(D.nominal.constr), real = D.realidx.constr;
  const o = { min: 60, max: 300, step: 60, name: 'k1|grafik', base100: true, pad: { l: 0.07, r: 0.22, t: 0.04, b: 0.13 } };
  const box = [X0, 2.2, LW, 2.45];
  // 2-qadam: narx maydoni (chiziqlar ostida turishi uchun avval qo‘shiladi)
  s.addChart([{ type: pres.charts.AREA, data: [series('_asos', real), series('Narx o‘sishi', nom.map((x, i) => x - real[i]))], options: { barGrouping: 'stacked', chartColors: [HEX.paper, HEX.constr], chartColorsOpacity: 22 } }], { ...frame(...box, { ...o, name: 'k2|narx-maydoni' }).opts, ...hidden });
  const f = lineChart(s, ...box, { ...o, series: [
    { name: 'Joriy narxda', v: nom, color: HEX.constr2, w: 2.5 },
    { name: 'Real hajm', v: real, color: HEX.constr, w: 3 },
  ] });
  unit(s, X0, 2.2, 'indeks, 2000 = 100', 1);
  label(s, f.cx(19, 26), f.vy(150), 'narx o‘sishi', 2, { color: HEX.constr, align: 'center' });
  label(s, f.px + f.pw + 0.1, f.vy(last(nom)) + 0.05, `Joriy narxda\n${fmt(change(D.nominal.constr), 1, true)}%`, 1, { color: HEX.constr, h: 0.46 });
  label(s, f.px + f.pw + 0.1, f.vy(last(real)) + 0.18, `Real hajm\n${fmt(change(real), 1, true)}%`, 1, { color: HEX.constr, h: 0.46 });
  src(s, X0, 4.7, 3, 'Manba: BEA [1]', 1);
  sectorTable(s, 'constr', X0, 5.03, LW, 3);
  src(s, X0, 6.6, 3, 'Manba: BEA [1], [2]', 3);
  big(s, RX, 1.9, 2.2, '+190,5%', 'qo‘shilgan qiymat, joriy narxda', HEX.constr, 1);
  big(s, RX + 2.35, 1.9, 1.7, '−6,7%', 'real hajm', HEX.red, 1);
  big(s, RX, 2.95, RW, '×3,1', 'qurilish narxlari, 25 yilda', HEX.constr, 2, 32);
  why(s, RX, 3.95, RW, 1.5, 'Qurilish narxlari tez oshdi, unumdorlik esa o‘nlab yillar davomida pasaydi. Goolsbee va Syverson buni faqat o‘lchash xatosi bilan tushuntirib bo‘lmasligini ko‘rsatgan [6].', 4, 'Nega?', 13);
  means(s, RX, 5.85, RW, 0.8, 'Pul hisobidagi o‘sish har doim ham real o‘sish emas.', 'constr', 5);
  speaker(s, 'Qo‘ziboyev Aslbek', 'constr');
  notes(s, 'qurilish1');
}

// 11. QURILISH: UCH TO‘LQIN
{
  const s = newSlide('Qurilish');
  title(s, 'Qurilish — foiz stavkalari va davlat siyosatining barometri');
  sign(s, 'Qurilish', 'constr');
  const v = div(D.emp.constr, 1000);
  const o = { min: 0, max: 12, step: 3, name: 'k1|grafik', pad: { l: 0.05, r: 0.02, t: 0.04, b: 0.13 } };
  const f = frame(X0, 1.95, LW, 2.75, o);
  unit(s, X0, 1.95, 'bandlik, mln kishi', 1);
  // soyali zonalar grafik ostida
  [[2006, 2009, 'uy-joy pufagi', 2, HEX.red, 'center'], [2022, 2022, 'foiz shoki', 3, HEX.red, 'right'], [2023, 2024, 'zavodlar', 4, HEX.agri, 'center']].forEach(([a, b, t, k, col, al]) => {
    const i0 = Y.indexOf(a), i1 = Y.indexOf(b), bw = f.pw / 26;
    s.addShape(pres.shapes.RECTANGLE, { x: f.px + i0 * bw, y: f.py, w: (i1 - i0 + 1) * bw, h: f.ph, fill: { color: col, transparency: 86 }, line: { type: 'none' }, objectName: `k${k}|zona` });
    label(s, al === 'right' ? f.px + i0 * bw - 0.06 : f.px + (i0 + (i1 - i0 + 1) / 2) * bw, f.vy(10.6), t, k, { align: al, w: 1.6 });
  });
  s.addChart(pres.charts.BAR, [series('Qurilish bandligi', v)], { ...f.opts, barDir: 'col', barGapWidthPct: 40, chartColors: [HEX.constr] });
  label(s, f.cx(0, 26) - 0.12, f.vy(v[0]) - 0.18, fmt(v[0], 2), 1);
  label(s, f.cx(25, 26) + 0.14, f.vy(last(v)) - 0.18, fmt(last(v), 2), 1, { align: 'right' });
  src(s, X0, 4.75, 3, 'Manba: BEA [2]', 1);
  [['2006–2009', 'Uy-joy pufagi yorildi', 'Qurilishda 1,9 mln ish o‘rni yo‘qoldi [7].'],
    ['2022', 'Foiz shoki', 'Fed stavkasi 5,25–5,50% gacha, ipoteka 7,79% [11]. Real hajm −6,3%.'],
    ['2023–2024', 'Zavodlar bumi', 'CHIPS qonuni: 52,7 mlrd $. Zavod qurilishi 233,2 mlrd $ (+20,4%) [10].']].forEach(([w, h, t], i) => {
    const x = X0 + i * 2.55, k = i + 2;
    s.addShape(pres.shapes.RECTANGLE, { x, y: 5.15, w: 2.35, h: 0.05, fill: { color: HEX.constr }, line: { type: 'none' }, objectName: `k${k}|voqea-chiziq` });
    s.addText([{ text: w, options: { fontFace: HEAD, bold: true, fontSize: 15, color: HEX.constr, breakLine: true } }, { text: h, options: { fontFace: HEAD, bold: true, fontSize: 13, breakLine: true } }, { text: t, options: { fontSize: 12 } }], { x, y: 5.25, w: 2.35, h: 1.45, color: HEX.ink, margin: 0, valign: 'top', paraSpaceAfter: 2, isTextBox: true, objectName: `k${k}|voqea` });
  });
  big(s, RX, 1.62, RW, '−14,3%', 'real hajm, 2009', HEX.red, 2);
  big(s, RX, 2.62, RW, '−17,6%', 'bandlik, 2009 — 25 yildagi eng katta pasayish', HEX.red, 2);
  why(s, RX, 3.65, RW, 1.75, 'Qurilish qarzga quriladi: foiz arzon bo‘lsa — bum, qimmat bo‘lsa — to‘xtash. Davlat dasturlari yangi buyurtma beradi. Hajm va bandlik birga harakat qiladi: real o‘sgan 13 yilning 12 tasida.', 5, 'Nega?', 13);
  means(s, RX, 5.72, RW, 0.95, 'Qurilishga qarab iqtisodiyotning keyingi qadamini oldindan ko‘rish mumkin.', 'constr', 6);
  speaker(s, 'Qo‘ziboyev Aslbek', 'constr');
  notes(s, 'qurilish2');
}

// 12. TAQQOSLASH
{
  pres.addSection({ title: 'Taqqoslash va xulosa' });
  const s = newSlide('Taqqoslash va xulosa');
  title(s, 'Javob: xizmatlar o‘sdi va ish berdi, sanoat kamroq odam bilan o‘sdi');
  sign(s, 'Taqqoslash');
  const rows = [
    ['Real o‘sish, yiliga o‘rtacha (CAGR), %', (k) => cagr(D.realidx[k]), 2, true],
    ['Nominal o‘sish, 2000–2025, %', (k) => change(D.nominal[k]), 1, true],
    ['YaIMdagi ulush o‘zgarishi, f.p.', (k) => last(D.share[k]) - D.share[k][0], 1, true],
    ['Bandlik o‘zgarishi, %', (k) => change(D.emp[k]), 1, true],
    ['QQ / 1 xodim, ming $, 2025', (k) => last(D.nominal[k]) / last(D.emp[k]), 0, false],
  ];
  const data = [[head('', { align: 'left' }), ...SECT.map((t) => head(t.name, { color: t.t }))]];
  rows.forEach(([lab, fn, dec, plus]) => {
    const vals = SECT.map((t) => fn(t.k)), best = Math.max(...vals);
    data.push([cell(lab, { align: 'left', color: HEX.muted }), ...vals.map((x) => cell(fmt(x, dec, plus), { bold: x === best }))]);
  });
  data.push([cell('Real o‘sish yillarida bandlik ham o‘sgan', { align: 'left', color: HEX.muted }), ...SECT.map((t) => { const [a, b] = coMove(t.k); return cell(`${a}/${b}`, { bold: a / b > 0.8 }); })]);
  s.addTable(data, { x: X0, y: 1.72, w: LW, colW: [3.1, 1.0, 1.1, 1.3, 1.0], rowH: 0.36, objectName: 'k1|taqqoslash-jadvali' });
  src(s, X0, 4.33, 3, 'Manba: BEA [1], [2]', 1);
  why(s, X0, 4.75, LW, 1.4, 'Xizmatlar va qurilish odam mehnatiga tayanadi. Sanoat va qishloq xo‘jaligi texnika va texnologiyaga tayanadi: bir xodim sanoatda 285 ming $, qurilishda 165 ming $ qiymat yaratadi.', 5);
  [['Eng tez — xizmatlar', 'Real o‘sish yiliga 2,32%, nominal +223,9%, ulush +5,8 f.p. Eng sekini — qurilish (−0,28%).'],
    ['Ulushi faqat xizmatlarda oshdi', 'Sanoat −5,5 f.p.; qishloq xo‘jaligi va qurilish deyarli o‘zgarmadi.'],
    ['Bandlik har doim ham o‘smagan', 'Xizmatlar (22/23) va qurilishda (12/13) — ha; sanoat (10/19) va qishloq xo‘jaligida (6/14) — ko‘pincha yo‘q.']].forEach(([h, t], i) => {
    const y = 1.72 + i * 1.3, k = i + 2;
    s.addShape(pres.shapes.OVAL, { x: RX, y, w: 0.42, h: 0.42, fill: { color: HEX.ink }, line: { type: 'none' }, objectName: `k${k}|javob-raqam` });
    s.addText(String(i + 1), { x: RX, y, w: 0.42, h: 0.42, fontFace: HEAD, fontSize: 15, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0, isTextBox: true, objectName: `k${k}|javob-raqam-matn` });
    s.addText([{ text: h, options: { fontFace: HEAD, bold: true, fontSize: 16, breakLine: true } }, { text: t, options: { fontSize: 12 } }], { x: RX + 0.55, y: y - 0.04, w: RW - 0.55, h: 1.2, color: HEX.ink, margin: 0, valign: 'top', paraSpaceAfter: 3, isTextBox: true, objectName: `k${k}|javob` });
  });
  means(s, RX, 5.7, RW, 1.0, 'Tarmoq o‘sayotganini bilish yetarli emas — qanday o‘sayotganini ham bilish kerak.', null, 6);
  speaker(s, 'Saitmurodova Visola');
  notes(s, 'taqqoslash');
}

// 13. INQIROZLAR
{
  const s = newSlide('Taqqoslash va xulosa');
  title(s, 'Har inqirozning sababi boshqa, shuning uchun zarba ham boshqa tarmoqqa tushdi');
  sign(s, 'Inqirozlar');
  const G = [2009, 2020, 2022];
  const o = { min: -16, max: 12, step: 4, name: 'k1|grafik', fmt: '[<0]−0;0', pad: { l: 0.06, r: 0.02, t: 0.08, b: 0.1 } };
  const f = frame(X0, 2.0, LW, 2.7, o);
  unit(s, X0, 1.95, 'real o‘sish, %', 1);
  const gap = 0.6;
  s.addChart(pres.charts.BAR, SECT.map((t) => ({ name: t.name, labels: G.map(String), values: G.map((yr) => +at(yoy(D.realidx[t.k]), yr).toFixed(2)) })), {
    ...f.opts, barDir: 'col', barGrouping: 'clustered', barGapWidthPct: gap * 100, chartColors: SECT.map((t) => t.c),
  });
  let lx = X0 + LW;
  [...SECT].reverse().forEach((t) => {
    const w = 0.3 + t.name.length * 0.085;
    lx -= w + 0.15;
    s.addShape(pres.shapes.RECTANGLE, { x: lx, y: 1.73, w: 0.14, h: 0.14, fill: { color: t.c }, line: { type: 'none' }, objectName: 'k1|legenda-belgi' });
    s.addText(t.name, { x: lx + 0.2, y: 1.66, w: w - 0.2, h: 0.28, fontFace: HEAD, fontSize: 11, bold: true, color: t.t, margin: 0, valign: 'middle', isTextBox: true, objectName: 'k1|legenda' });
  });
  // ustun qiymatlari (o‘nlik vergul bilan)
  const band = f.pw / G.length, bw = band / (SECT.length + gap);
  G.forEach((yr, gi) => SECT.forEach((t, si) => {
    const val = at(yoy(D.realidx[t.k]), yr);
    const cx = f.px + gi * band + (gap * bw) / 2 + (si + 0.5) * bw;
    label(s, cx, val >= 0 ? f.vy(val) - 0.14 : f.vy(val) + 0.15, fmt(val, 1, true), 1, { align: 'center', w: 0.9, color: t.t });
  }));
  src(s, X0, 4.75, 3, 'Manba: BEA [1]', 1);
  [['2009 · Moliyaviy inqiroz', 'Eng ko‘p zarar: qurilish (−14,3%), sanoat (−5,5%)', 'Inqiroz uy-joy bozori va ipotekadan boshlandi.'],
    ['2020 · Pandemiya', 'Mart–aprelda 22 mln ish o‘rni yo‘qoldi [7]', 'Faqat qishloq xo‘jaligi o‘sdi — ovqat har doim kerak. 2021: xizmatlar +6,7%.'],
    ['2022 · Energiya shoki', 'Brent 100 $, gaz 6,45 $ [8]; CPI 9,1% [7]', 'Kon qazish QQ +38,5% (pul hisobida); Fed stavkani oshirgach qurilish −6,3%.']].forEach(([w, h, t], i) => {
    const x = X0 + i * 2.55, k = i + 2;
    s.addShape(pres.shapes.RECTANGLE, { x, y: 5.15, w: 2.35, h: 0.05, fill: { color: HEX.red }, line: { type: 'none' }, objectName: `k${k}|inqiroz-chiziq` });
    s.addText([{ text: w, options: { fontFace: HEAD, bold: true, fontSize: 14, breakLine: true } }, { text: h, options: { fontFace: HEAD, bold: true, fontSize: 12, breakLine: true } }, { text: t, options: { fontSize: 12 } }], { x, y: 5.25, w: 2.35, h: 1.45, color: HEX.ink, margin: 0, valign: 'top', paraSpaceAfter: 3, isTextBox: true, objectName: `k${k}|inqiroz` });
  });
  why(s, RX, 1.72, RW, 1.6, 'Inqirozning manbai har safar boshqa: 2009-da kredit, 2020-da karantin, 2022-da energiya narxi. Zarba shu manbaga eng yaqin tarmoqqa tushadi.', 5);
  means(s, RX, 3.75, RW, 1.05, 'Inqirozga tayyorlanish uchun bitta tarmoqqa emas, butun tuzilmaga qarash kerak.', null, 6);
  speaker(s, 'O‘rolov Shahzod');
  notes(s, 'shoklar');
}

// 14. INFRATUZILMA
{
  const s = newSlide('Taqqoslash va xulosa');
  title(s, 'Infratuzilma — o‘sishning ko‘rinmas poydevori: uchta haqiqiy misol');
  sign(s, 'Infratuzilma');
  const rowsY = [1.72, 3.38, 5.04], RH = 1.45, CW = 1.85, MX = X0 + CW + 0.35, MW = LW - 2 * CW - 0.7, EX = X0 + LW - CW;
  const flow = (i, lane, cause, causeSub, effect, effectSub) => {
    const y = rowsY[i], k = i + 1;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: X0, y, w: CW, h: RH, rectRadius: 0.08, fill: { color: HEX.hwy }, line: { type: 'none' }, objectName: `k${k}|sabab` });
    s.addText([{ text: cause, options: { fontFace: HEAD, bold: true, fontSize: 15, breakLine: true } }, { text: causeSub, options: { fontFace: HEAD, fontSize: 12 } }], { x: X0 + 0.14, y, w: CW - 0.24, h: RH, color: 'FFFFFF', margin: 0, valign: 'middle', paraSpaceAfter: 3, isTextBox: true, objectName: `k${k}|sabab-matn` });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: EX, y, w: CW, h: RH, rectRadius: 0.08, fill: { color: HEX.paper2 }, line: { type: 'none' }, objectName: `k${k}|natija` });
    s.addText([{ text: effect, options: { fontFace: HEAD, bold: true, fontSize: 14, color: LANE[lane].t, breakLine: true } }, { text: effectSub, options: { fontSize: 12, color: HEX.ink } }], { x: EX + 0.14, y, w: CW - 0.24, h: RH, margin: 0, valign: 'middle', paraSpaceAfter: 3, isTextBox: true, objectName: `k${k}|natija-matn` });
    [X0 + CW + 0.04, EX - 0.31].forEach((ax) => s.addShape(pres.shapes.RIGHT_ARROW, { x: ax, y: y + RH / 2 - 0.1, w: 0.27, h: 0.2, fill: { color: HEX.ink }, line: { type: 'none' }, objectName: `k${k}|strelka` }));
    return { y, k };
  };
  // 1) energiya → sanoat
  {
    const { y, k } = flow(0, 'ind', 'Energiya', 'slanets inqilobi: arzon gaz', 'Sanoat', 'yangi zavodlar: etilen +40% kutilgan; 2023 — SPG eksportida 1-o‘rin [8]');
    s.addChart(pres.charts.BAR, [{ name: 'Gaz narxi', labels: ['AQSh', 'Yevropa', 'Osiyo'], values: [2.21, 10.37, 11.47] }], {
      x: MX, y: y + 0.02, w: MW, h: RH - 0.3, barDir: 'bar', barGapWidthPct: 35, catAxisOrientation: 'maxMin',
      layout: { x: 0.24, y: 0, w: 0.5, h: 1 }, valAxisHidden: true, valGridLine: { style: 'none' }, catAxisLineShow: false, catAxisMajorTickMark: 'none',
      catAxisLabelFontFace: HEAD, catAxisLabelFontSize: 12, catAxisLabelColor: HEX.ink, valAxisMinVal: 0, valAxisMaxVal: 11.47,
      chartColors: [HEX.hwy, HEX.gray, HEX.gray], showLegend: false,
      plotArea: { fill: { color: HEX.paper, transparency: 100 } }, chartArea: { fill: { color: HEX.paper, transparency: 100 } }, objectName: `k${k}|gaz-grafik`,
    });
    const pw = MW * 0.5, bandH = (RH - 0.3) / 3;
    [2.21, 10.37, 11.47].forEach((val, i) => label(s, MX + MW * 0.24 + (pw * val) / 11.47 + 0.06, y + 0.02 + (i + 0.5) * bandH, fmt(val, 2) + ' $', k, { w: 0.9 }));
    s.addText('gaz narxi, $/MMBtu, 2024 [8]', { x: MX, y: y + RH - 0.26, w: MW, h: 0.24, fontFace: HEAD, fontSize: 11, color: C.text2, margin: 0, isTextBox: true, objectName: `k${k}|gaz-izoh` });
  }
  // 2) IIJA → qurilish
  {
    const { y, k } = flow(1, 'constr', 'IIJA qonuni, 2021', '1,2 trln $, shundan 550 mlrd $ yangi', 'Qurilish', 'yo‘l, ko‘prik, temir yo‘l va suv loyihalari — qurilishga buyurtma');
    const cats = ['Yo‘l', 'Temir', 'Internet', 'Elektr', 'Suv', 'Aero', 'Port'], vals = [110, 66, 65, 65, 55, 25, 17];
    s.addChart(pres.charts.BAR, [{ name: 'IIJA', labels: cats, values: vals }], {
      x: MX, y: y + 0.02, w: MW, h: RH - 0.28, barDir: 'col', barGapWidthPct: 30, layout: { x: 0, y: 0.18, w: 1, h: 0.64 },
      valAxisHidden: true, valGridLine: { style: 'none' }, catAxisLineShow: false, catAxisMajorTickMark: 'none', valAxisMinVal: 0, valAxisMaxVal: 110,
      catAxisLabelFontFace: HEAD, catAxisLabelFontSize: 10, catAxisLabelColor: HEX.muted, chartColors: [HEX.constr], showLegend: false,
      showValue: true, dataLabelPosition: 'outEnd', dataLabelFormatCode: '0', dataLabelFontFace: HEAD, dataLabelFontSize: 11, dataLabelFontBold: true, dataLabelColor: HEX.ink,
      plotArea: { fill: { color: HEX.paper, transparency: 100 } }, chartArea: { fill: { color: HEX.paper, transparency: 100 } }, objectName: `k${k}|iija-grafik`,
    });
    s.addText('mlrd $ [11]', { x: MX, y: y + RH - 0.24, w: MW, h: 0.22, fontFace: HEAD, fontSize: 11, color: C.text2, margin: 0, isTextBox: true, objectName: `k${k}|iija-izoh` });
  }
  // 3) avtomagistral → logistika
  {
    const { y, k } = flow(2, 'serv', 'Interstate avtomagistrali', '79 045 km — yo‘llarning 1%', 'Logistika va savdo', '2023: 20,2 mlrd t yuk, 18,7 trln $ [11]');
    s.addText('26%', { x: MX + 0.15, y: y + 0.2, w: MW - 0.3, h: 0.7, fontFace: HEAD, fontSize: 40, bold: true, color: HEX.servT, margin: 0, valign: 'bottom', isTextBox: true, objectName: `k${k}|katta-raqam` });
    s.addText('butun harakat shu yo‘llarda [11]', { x: MX + 0.15, y: y + 0.95, w: MW - 0.3, h: 0.3, fontFace: HEAD, fontSize: 12, color: C.text2, margin: 0, isTextBox: true, objectName: `k${k}|katta-raqam-izoh` });
  }
  why(s, RX, 1.72, RW, 1.6, 'Arzon energiya zavod xarajatini, yaxshi yo‘l yetkazish xarajatini, internet esa savdo xarajatini kamaytiradi. Bu tejamlar har bir tarmoq narxiga kiradi.', 4);
  means(s, RX, 3.75, RW, 1.05, 'Infratuzilma o‘zi kam pul ishlaydi, lekin boshqa tarmoqlarga ishlash imkonini beradi.', null, 5);
  speaker(s, 'Qahramonov Zafarbek');
  notes(s, 'infra');
}

// 15. XULOSA VA TAKLIFLAR
{
  const s = newSlide('Taqqoslash va xulosa');
  title(s, 'AQSh tajribasidan O‘zbekiston uchun uchta amaliy taklif');
  sign(s, 'Xulosa');
  [['serv', 'Xizmatlar', 'YaIMning 82,4% va bandlikning 84,6% ini beradi.'], ['ind', 'Sanoat', 'ikki barobar o‘sdi, lekin 4,6 mln kam odam bilan.'], ['agri', 'Qishloq xo‘jaligi', 'kichik, lekin eng beqaror tarmoq.'], ['constr', 'Qurilish', 'pul hisobida o‘sdi, real hajmi 2000-yil darajasidan past.']].forEach(([k, h, t], i) => {
    const x = X0 + i * 3.06;
    s.addShape(pres.shapes.RECTANGLE, { x, y: 1.55, w: 2.85, h: 0.06, fill: { color: LANE[k].c }, line: { type: 'none' }, objectName: 'k1|xulosa-chiziq' });
    s.addText([{ text: h, options: { fontFace: HEAD, bold: true, fontSize: 13, color: LANE[k].t, breakLine: true } }, { text: t, options: { fontSize: 12, color: HEX.ink } }], { x, y: 1.66, w: 2.85, h: 0.75, margin: 0, valign: 'top', isTextBox: true, objectName: 'k1|xulosa' });
  });
  const props = [
    ['Sug‘orish kanallarini modernizatsiya qilish', '36%', 'suv tuproq kanallarda yo‘qoladi — yiliga 14 mlrd m³ [12]', 'sug‘oriladigan <17% yer ekin qiymatining >50% ini beradi [9]', 'Foyda', 'hosil oshadi, nasoslar kamroq elektr sarflaydi'],
    ['Elektr tarmog‘ini yangilash', '~13%', 'taqsimotda yo‘qoladi; tarmoqning yarmidan ko‘pi 30 yoshdan katta, talab 2030-yilgacha 2 barobar oshadi [12]', 'arzon va barqaror energiya sanoatni jalb qildi [8]', 'Foyda', 'uzilishlar kamayadi, investorlar uchun ishonchli baza'],
    ['Logistika koridorlari va omborlar', '88-o‘rin', 'logistika indeksida, 2023 [12]', 'yo‘llarning 1% i harakatning 26% ini tashiydi [11]', 'Foyda va shart', 'eksport arzonlashadi, hosil isrofi kamayadi. DXSh portfeli YaIMning ~27% — majburiyatlarga limit [12]'],
  ];
  props.forEach(([h, num, prob, usa, fh, fb], i) => {
    const x = X0 + i * 4.1, k = i + 2, w = 3.8;
    s.addShape(pres.shapes.OVAL, { x, y: 2.62, w: 0.38, h: 0.38, fill: { color: HEX.hwy }, line: { type: 'none' }, objectName: `k${k}|taklif-raqam` });
    s.addText(String(i + 1), { x, y: 2.62, w: 0.38, h: 0.38, fontFace: HEAD, fontSize: 14, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0, isTextBox: true, objectName: `k${k}|taklif-raqam-matn` });
    s.addText(h, { x: x + 0.5, y: 2.56, w: w - 0.5, h: 0.6, fontFace: HEAD, fontSize: 15, bold: true, color: HEX.ink, margin: 0, valign: 'top', isTextBox: true, objectName: `k${k}|taklif-sarlavha` });
    s.addText([
      { text: 'Muammo', options: { fontFace: HEAD, bold: true, fontSize: 11, color: HEX.muted, breakLine: true } },
      { text: num, options: { fontFace: HEAD, bold: true, fontSize: 28, color: HEX.red, breakLine: true } },
      { text: prob, options: { fontSize: 12, breakLine: true, paraSpaceAfter: 6 } },
      { text: 'AQSh tajribasi', options: { fontFace: HEAD, bold: true, fontSize: 11, color: HEX.muted, breakLine: true } },
      { text: usa, options: { fontSize: 12, breakLine: true, paraSpaceAfter: 6 } },
      { text: fh, options: { fontFace: HEAD, bold: true, fontSize: 11, color: HEX.muted, breakLine: true } },
      { text: fb, options: { fontSize: 12 } },
    ], { x, y: 3.22, w, h: 2.45, color: HEX.ink, margin: 0, valign: 'top', isTextBox: true, objectName: `k${k}|taklif` });
  });
  why(s, X0, 5.85, 6.1, 0.85, 'Uchala taklif ham AQShda o‘sishni qo‘llab-quvvatlagan infratuzilmaga — suv, energiya va yo‘lga tayanadi.', 5, 'Nega aynan shu uchtasi?', 13);
  means(s, 7.3, 5.85, 5.4, 0.85, 'Infratuzilmaga sarmoya — barcha tarmoqlarga birdaniga sarmoya.', null, 6);
  speaker(s, 'Qo‘ziboyev Aslbek');
  notes(s, 'xulosa');
}

// 16–17. MANBALAR
const REFS = [
  ['BEA, GDP by Industry: Value Added by Industry, TVA105-A, TVA106-A (nashr 30.09.2026)', ['https://apps.bea.gov/industry/Release/XLS/GDPxInd/ValueAdded.xlsx']],
  ['BEA, NIPA 6.5D: Full-Time Equivalent Employees by Industry', ['https://apps.bea.gov/national/Release/TXT/NipaDataA.txt']],
  ['Jahon banki, WDI: SL.AGR.EMPL.ZS, SL.IND.EMPL.ZS, SL.SRV.EMPL.ZS', ['https://data.worldbank.org/country/united-states']],
  ['Autor, Dorn, Hanson (2013). The China Syndrome. American Economic Review', ['https://www.nber.org/papers/w18054']],
  ['Houseman (2018). Understanding the Decline of U.S. Manufacturing Employment. Upjohn WP 18-287', ['https://research.upjohn.org/up_workingpapers/287/']],
  ['Goolsbee, Syverson (2023). The Strange and Awful Path of Productivity in the U.S. Construction Sector. NBER w30845', ['https://www.nber.org/papers/w30845']],
  ['BLS (AQSh Mehnat statistikasi byurosi)', ['https://www.bls.gov/news.release/archives/empsit_05082020.htm', 'https://www.bls.gov/osmr/research-papers/2021/st210060.htm', 'https://www.bls.gov/opub/mlr/2010/12/art1full.pdf', 'https://www.bls.gov/opub/ted/2022/consumer-prices-up-9-1-percent-over-the-year-ended-june-2022-largest-increase-in-40-years.htm']],
  ['EIA (AQSh Energetika axborot boshqarmasi)', ['https://www.eia.gov/todayinenergy/detail.php?id=61545 (neft rekordi)', 'https://www.eia.gov/todayinenergy/detail.php?id=55079 (Brent)', 'https://www.eia.gov/todayinenergy/detail.php?id=55119 (Henry Hub 2022)', 'https://www.eia.gov/todayinenergy/detail.php?id=64184 (Henry Hub 2024)', 'https://www.eia.gov/todayinenergy/detail.php?id=63804 (Osiyo/Yevropa gaz narxlari)', 'https://www.eia.gov/todayinenergy/detail.php?id=61683 (SPG eksporti)', 'https://www.eia.gov/todayinenergy/detail.php?id=19771 (etilen)']],
  ['USDA, GAO, CRS', ['https://www.ers.usda.gov/data-products/charts-of-note/76883', 'https://www.ers.usda.gov/topics/farm-practices-management/irrigation-water-use', 'https://www.ams.usda.gov/sites/default/files/media/GTR10052023.pdf', 'https://gao.gov/products/gao-22-468', 'CRS R46180', 'CRS R47523 — https://www.congress.gov/crs-product/R47523']],
  ['Census', ['https://www.census.gov/retail/ecommerce.html', 'https://www.census.gov/construction/c30/pdf/pr202412.pdf']],
  ['Boshqa rasmiy manbalar', ['Federal Reserve: https://www.federalreserve.gov/newsevents/pressreleases/monetary20230726a.htm', 'Freddie Mac: 26.10.2023 press-relizi', 'Pew: https://www.pewresearch.org/internet/fact-sheet/internet-broadband/', 'DOT: https://www.transportation.gov/rural/grant-toolkit/funding-and-financing/grants-overview', 'FHWA: https://www.fhwa.dot.gov/policyinformation/pubs/our_nations_highways_2026/roads.cfm', 'BTS: https://data.bts.gov/stories/s/Moving-Goods-in-the-United-States/bcyt-rqmu/']],
  ['O‘zbekiston', ['Jahon banki press-relizlari (21.05.2025, 15.05.2025, 25.06.2025) — worldbank.org', 'LPI — https://lpi.worldbank.org/international/global', 'XVF (kun.uz, 02.07.2025)', 'https://centralasiaclimateportal.org/36-of-water-in-uzbekistans-agriculture-is-lost-in-earthen-canals/']],
];
function refRuns(list, startNo) {
  const runs = [];
  list.forEach(([t, urls], i) => {
    runs.push({ text: `${startNo + i}. ${t}`, options: { fontFace: HEAD, fontSize: 11, bold: true, color: HEX.ink, breakLine: true, paraSpaceAfter: 1 } });
    urls.forEach((u, j) => {
      const m = u.match(/https?:\/\/\S+/);
      const last1 = i === list.length - 1 && j === urls.length - 1;
      runs.push({ text: '      ' + u, options: { fontFace: HEAD, fontSize: 10, color: HEX.muted, breakLine: !last1, paraSpaceAfter: j === urls.length - 1 ? 6 : 1, hyperlink: m ? { url: m[0] } : undefined } });
    });
  });
  return runs;
}
[[0, 4, 4, 8, 'Manbalar'], [8, 10, 10, 12, 'Manbalar (davomi)']].forEach(([a, b, c, d, t], p) => {
  if (p === 0) pres.addSection({ title: 'Manbalar' });
  const s = newSlide('Manbalar');
  title(s, t);
  sign(s, 'Manbalar');
  s.addText(refRuns(REFS.slice(a, b), a + 1), { x: X0, y: 1.6, w: 5.85, h: p === 0 ? 5.3 : 4.3, margin: 0, valign: 'top', isTextBox: true, objectName: 'manbalar-1' });
  s.addText(refRuns(REFS.slice(c, d), c + 1), { x: 6.85, y: 1.6, w: 5.86, h: p === 0 ? 5.3 : 4.3, margin: 0, valign: 'top', isTextBox: true, objectName: 'manbalar-2' });
  if (p === 1) s.addText('Rahmat, savollaringizga tayyormiz!', { x: X0, y: 6.05, w: 12, h: 0.75, fontFace: HEAD, fontSize: 36, bold: true, color: HEX.hwy, margin: 0, valign: 'middle', isTextBox: true, objectName: 'k1|rahmat' });
  notes(s, p === 0 ? 'manbalar' : 'manbalar2');
});

// 18–22. ILOVA: har bir ko‘rsatkich alohida slaydda
const APX = [
  ['Qo‘shilgan qiymat, mlrd $', (k) => div(D.nominal[k], 1000), (k) => (k === 'agri' ? 1 : 0), true, false],
  ['YaIMdagi ulush, %', (k) => D.share[k], (k) => (k === 'agri' ? 2 : 1), false, false],
  ['Real hajm, 2000 = 100', (k) => D.realidx[k], () => 1, true, false],
  ['Real o‘sish, %', (k) => yoy(D.realidx[k]), () => 1, true, true],
  ['Bandlik, ming kishi', (k) => D.emp[k === 'gdp' ? 'total' : k], () => 0, true, false],
];
APX.forEach(([lab, row, dec, gdp, plus], ai) => {
  if (ai === 0) pres.addSection({ title: 'Ilova' });
  const s = newSlide('Ilova');
  title(s, `Ilova: ${lab}, 2000–2025`);
  sign(s, 'Ilova');
  const keys = (gdp ? [{ k: 'gdp', name: lab.startsWith('Bandlik') ? 'Jami' : 'YaIM' }] : []).concat(SECT);
  [Y.slice(0, 13), Y.slice(13)].forEach((ys, h) => {
    const data = [[head('', { align: 'left', fontSize: 11 }), ...ys.map((y) => head(String(y), { fontSize: 11 }))]];
    keys.forEach((t) => {
      const arr = row(t.k);
      data.push([cell(t.name, { align: 'left', color: HEX.muted, fontSize: 11 }), ...ys.map((y) => { const v = at(arr, y); return cell(v == null ? '—' : fmt(v, dec(t.k), plus), { fontSize: 11 }); })]);
    });
    s.addTable(data, { x: X0, y: 1.7 + h * 2.45, w: 12.08, colW: [1.84, ...ys.map(() => (12.08 - 1.84) / 13)], rowH: 0.3, objectName: 'ilova-jadval' });
  });
  src(s, X0, 6.62, 6, 'Manba: BEA [1], [2]; mualliflar hisobi');
  notes(s, 'ilova');
});

if (slideNo !== TOTAL) throw new Error(`TOTAL=${TOTAL}, lekin ${slideNo} ta slayd yaratildi`);

(async () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await pres.writeFile({ fileName: OUT });
  if (SKILL_THEME) await require(SKILL_THEME).applyTheme(OUT, THEME);
  console.log(`PPTX: ${OUT} (${slideNo} slayd)`);
})();
