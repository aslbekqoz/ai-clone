/* Grafiklar va jadvallar. Barcha qiymatlar window.DATA (data/data.json) dan hisoblanadi —
   hech bir raqam qo‘lda kiritilmaydi. Har bir grafik { enter(inst), act(name, inst) } qaytaradi. */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const D = window.DATA;
  const Y = D.years;
  const C = {
    ind: '#1C3F94', ind2: '#7F9BD6', serv: '#F59F00', servText: '#B86E00',
    agri: '#2F9E44', agri2: '#9CD3A6', agriText: '#237A34', constr: '#9C36B5', constr2: '#D7A6E3',
    red: '#C92A2A', ink: '#141414', muted: '#55524B', rule: '#D6D0C2', gray: '#8B887F',
  };
  const SECT = [
    { k: 'ind', name: 'Sanoat', color: C.ind, text: C.ind },
    { k: 'serv', name: 'Xizmatlar', color: C.serv, text: C.servText },
    { k: 'agri', name: 'Qishloq xo‘jaligi', color: C.agri, text: C.agriText },
    { k: 'constr', name: 'Qurilish', color: C.constr, text: C.constr },
  ];

  /* ---------- yordamchilar ---------- */
  // 12,4 · 1 840 · −5,5  (vergul, bo‘sh joy, haqiqiy minus)
  // Aynan yarimta qiymatlar pastga yaxlitlanadi (3 836,5 → 3 836), faktlar_va_manbalar.md bilan bir xil bo‘lishi uchun.
  function fmt(v, dec = 1, plus = false) {
    const s = Math.max(0, Math.abs(v) - 1e-9 * 10 ** -dec).toFixed(dec);
    const [i, f] = s.split('.');
    let out = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (f ? ',' + f : '');
    if (Number(s) !== 0) {
      if (v < 0) out = '−' + out;
      else if (plus) out = '+' + out;
    }
    return out;
  }
  const at = (arr, year) => arr[Y.indexOf(year)];
  const last = (arr) => arr[arr.length - 1];
  const toIdx = (arr) => arr.map((v) => (v / arr[0]) * 100);
  const yoy = (arr) => arr.map((v, i) => (i ? (v / arr[i - 1] - 1) * 100 : null));
  const div = (arr, k) => arr.map((v) => v / k);
  const ratio = (a, b) => a.map((v, i) => (v / b[i]) * 100);
  const cagr = (arr) => ((last(arr) / arr[0]) ** (1 / (arr.length - 1)) - 1) * 100;
  const change = (arr) => (last(arr) / arr[0] - 1) * 100;
  // real o‘sgan yillar soni va ulardan bandlik ham o‘sganlari
  function coMove(k) {
    const g = yoy(D.realidx[k]), e = yoy(D.emp[k]);
    let up = 0, both = 0;
    for (let i = 1; i < g.length; i++) if (g[i] > 0) { up++; if (e[i] > 0) both++; }
    return [both, up];
  }

  function el(tag, attrs, parent, text) {
    const n = document.createElementNS(NS, tag);
    for (const a in attrs || {}) n.setAttribute(a, attrs[a]);
    if (text != null) {
      String(text).split('\n').forEach((line, i, all) => {
        if (all.length === 1) { n.textContent = line; return; }
        const t = document.createElementNS(NS, 'tspan');
        t.setAttribute('x', attrs.x); t.setAttribute('dy', i ? '1.15em' : 0);
        t.textContent = line; n.appendChild(t);
      });
    }
    if (parent) parent.appendChild(n);
    return n;
  }

  // animatsiya navbati: enter va nomlangan harakatlar
  function queue() {
    const q = {};
    return {
      add(when, fn) { (q[when] = q[when] || []).push(fn); },
      run(when, inst) { (q[when] || []).forEach((fn) => fn(inst)); },
    };
  }
  const d = (inst, s) => (inst || window.REDUCED ? 0 : s);
  function fadeIn(node, inst, delay = 0) {
    gsap.set(node, { opacity: 0 });
    return gsap.to(node, { opacity: 1, duration: d(inst, 0.4), delay: d(inst, delay) });
  }

  /* ---------- karkas: o‘qlar va panjara ---------- */
  function frame(host, o) {
    const W = o.w || 1080, H = o.h || 520;
    const m = Object.assign({ l: 96, r: 40, t: 52, b: 50 }, o.m);
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img' }, host);
    const x0 = m.l, x1 = W - m.r, y0 = H - m.b, y1 = m.t;
    const sy = (v) => y0 - ((v - o.yMin) / (o.yMax - o.yMin)) * (y0 - y1);
    const g = el('g', { class: 'grid' }, svg);
    for (let v = o.yMin; v <= o.yMax + 1e-9; v += o.yStep) {
      el('line', { x1: x0, x2: x1, y1: sy(v), y2: sy(v) }, g);
      el('text', { x: x0 - 14, y: sy(v) + 8, 'text-anchor': 'end' }, g, (o.yFmt || ((x) => fmt(x, 0)))(v));
    }
    if (o.unit) el('text', { x: 0, y: 22, class: 'unit' }, svg, o.unit);
    return { svg, W, H, x0, x1, y0, y1, sy };
  }
  function xYears(f, sx, years) {
    const g = el('g', { class: 'axis' }, f.svg);
    years.forEach((yr) => el('text', { x: sx(yr), y: f.y0 + 38, 'text-anchor': 'middle' }, g, yr));
  }

  /* ---------- chiziqli grafik ---------- */
  function lineChart(host, o) {
    const f = frame(host, o);
    const q = queue();
    const sx = (yr) => f.x0 + ((yr - Y[0]) / (last(Y) - Y[0])) * (f.x1 - f.x0);
    xYears(f, sx, [2000, 2005, 2010, 2015, 2020, 2025]);
    if (o.base100) el('line', { x1: f.x0, x2: f.x1, y1: f.sy(100), y2: f.sy(100), stroke: C.ink, 'stroke-width': 2, 'stroke-dasharray': '2 6' }, f.svg);
    const pts = (v) => v.map((val, i) => [sx(Y[i]), f.sy(val)]);
    const dur = o.dur || 1.6;

    // ikki chiziq orasidagi maydon (qaychi / narx maydoni)
    (o.areas || []).forEach((a) => {
      const hi = pts(o.series[a.hi].v), lo = pts(o.series[a.lo].v).reverse();
      const id = 'clip' + Math.random().toString(36).slice(2);
      const cp = el('clipPath', { id }, el('defs', {}, f.svg));
      const r = el('rect', { x: f.x0 - 2, y: 0, width: 0, height: f.H }, cp);
      el('path', { d: 'M' + hi.concat(lo).map((p) => p.join(',')).join('L') + 'Z', fill: a.fill, opacity: a.opacity || 0.16, 'clip-path': `url(#${id})` }, f.svg);
      const lbl = a.label ? el('text', { x: sx(a.lx), y: f.sy(a.lv), 'text-anchor': 'middle', class: 'ann', fill: a.labelColor || C.ink, opacity: 0 }, f.svg, a.label) : null;
      q.add(a.when || 'enter', (inst) => {
        gsap.to(r, { attr: { width: f.x1 - f.x0 + 4 }, duration: d(inst, a.dur || dur), ease: 'power1.inOut' });
        if (lbl) fadeIn(lbl, inst, (a.dur || dur) * 0.8);
      });
    });

    o.series.forEach((s) => {
      const p = pts(s.v);
      const path = el('path', {
        d: 'M' + p.map((xy) => xy.join(',')).join('L'), fill: 'none', stroke: s.color,
        'stroke-width': s.w || 5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      }, f.svg);
      const len = path.getTotalLength();
      // uzuq chiziqni ham "chizish" uchun niqob ishlatamiz
      let mask = null;
      if (s.dash) {
        path.setAttribute('stroke-dasharray', s.dash);
        const id = 'm' + Math.random().toString(36).slice(2);
        const mk = el('mask', { id }, el('defs', {}, f.svg));
        mask = el('path', { d: path.getAttribute('d'), fill: 'none', stroke: '#fff', 'stroke-width': (s.w || 5) + 8, 'stroke-dasharray': len, 'stroke-dashoffset': len }, mk);
        path.setAttribute('mask', `url(#${id})`);
      } else {
        path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
      }
      const dot = el('circle', { cx: last(p)[0], cy: last(p)[1], r: (s.w || 5) + 3, fill: s.color, opacity: 0 }, f.svg);
      const lbls = [];
      if (s.label) lbls.push(el('text', { x: last(p)[0] + 18, y: last(p)[1] + 8 + (s.dy || 0), class: 'lbl', fill: s.text || s.color, opacity: 0 }, f.svg, s.label));
      if (s.startLabel) lbls.push(el('text', { x: p[0][0] - 10, y: p[0][1] + (s.sdy || -16), 'text-anchor': 'start', class: 'lbl', fill: s.text || s.color, opacity: 0 }, f.svg, s.startLabel));
      (s.notes || []).forEach((n) => lbls.push(el('text', { x: sx(n.year) + (n.dx || 0), y: f.sy(at(s.v, n.year)) + (n.dy || -18), 'text-anchor': n.anchor || 'middle', class: 'ann', fill: n.color || C.ink, opacity: 0 }, f.svg, n.text)));
      q.add(s.when || 'enter', (inst) => {
        if (mask) gsap.to(mask, { attr: { 'stroke-dashoffset': 0 }, duration: d(inst, dur), ease: 'power1.inOut' });
        else gsap.to(path, { strokeDashoffset: 0, duration: d(inst, dur), ease: 'power1.inOut' });
        fadeIn(dot, inst, dur * 0.9);
        lbls.forEach((l) => fadeIn(l, inst, dur * 0.9));
      });
    });
    return { enter: (inst) => q.run('enter', inst), act: (n, inst) => q.run(n, inst) };
  }

  /* ---------- ustunli grafik ---------- */
  function barChart(host, o) {
    const f = frame(host, o);
    const q = queue();
    const years = o.years || Y;
    const n = years.length;
    const bw = (f.x1 - f.x0) / n;
    const cx = (i) => f.x0 + i * bw + bw / 2;
    xYears(f, (yr) => cx(years.indexOf(yr)), (o.ticks || [2000, 2005, 2010, 2015, 2020, 2025]).filter((t) => years.includes(t)));
    const zeroY = f.sy(Math.max(0, o.yMin));

    // soyali zonalar (vaqt chizig‘idagi voqealar)
    (o.zones || []).forEach((z) => {
      const i0 = years.indexOf(z.from), i1 = years.indexOf(z.to);
      const r = el('rect', { x: f.x0 + i0 * bw, y: f.y1, width: (i1 - i0 + 1) * bw, height: f.y0 - f.y1, fill: z.fill || C.red, opacity: 0 }, f.svg);
      f.svg.insertBefore(r, f.svg.children[1]);
      const tx = z.anchor === 'end' ? f.x0 + i0 * bw - 8 : f.x0 + (i0 + (i1 - i0 + 1) / 2) * bw;
      const t = el('text', { x: tx, y: f.sy(z.lv), 'text-anchor': z.anchor || 'middle', class: 'ann', opacity: 0 }, f.svg, z.label);
      q.add(z.when, (inst) => {
        gsap.to(r, { opacity: 0.12, duration: d(inst, 0.4) });
        fadeIn(t, inst, 0.1);
      });
    });

    const bars = years.map((yr, i) => {
      const v = o.v[i];
      if (v == null) return null;
      const color = o.color(yr, v, i);
      const r = el('rect', { x: cx(i) - bw * 0.36, width: bw * 0.72, y: zeroY, height: 0, fill: color, rx: 2 }, f.svg);
      return { r, v, yr, i };
    }).filter(Boolean);
    el('line', { x1: f.x0, x2: f.x1, y1: zeroY, y2: zeroY, class: 'base', stroke: C.ink, 'stroke-width': 2 }, f.svg);

    const geo = (v) => (v >= 0 ? { y: f.sy(v), height: zeroY - f.sy(v) } : { y: zeroY, height: f.sy(v) - zeroY });
    const drop = o.drop; // { year, from }: avval "from" balandligigacha o‘sadi, keyin qulab tushadi
    q.add('enter', (inst) => {
      bars.forEach((b, k) => {
        const target = drop && b.yr === drop.year ? geo(drop.from) : geo(b.v);
        gsap.to(b.r, { attr: target, duration: d(inst, 0.7), delay: d(inst, k * 0.035), ease: 'power2.out' });
      });
    });
    (o.labels || []).forEach((lb) => {
      const i = years.indexOf(lb.year);
      const v = o.v[i];
      const y = lb.at != null ? f.sy(lb.at) : v >= 0 ? f.sy(v) - 14 + (lb.dy || 0) : f.sy(v) + 32 + (lb.dy || 0);
      const g = el('g', { opacity: 0 }, f.svg);
      if (lb.at != null) el('line', { x1: cx(i), x2: cx(i), y1: y + 8, y2: f.sy(lb.to != null ? lb.to : v) - 8, stroke: lb.color || C.ink, 'stroke-width': 2 }, g);
      el('text', { x: cx(i) + (lb.dx || 0), y, 'text-anchor': lb.anchor || 'middle', class: 'ann', fill: lb.color || C.ink }, g, lb.text);
      q.add(lb.when || 'enter', (inst) => fadeIn(g, inst, lb.when ? 0.5 : 1));
    });
    if (drop) {
      const b = bars.find((x) => x.yr === drop.year);
      q.add('drop', (inst) => {
        gsap.to(b.r, { attr: geo(b.v), duration: d(inst, 0.6), ease: 'bounce.out' });
        gsap.to(b.r, { attr: { fill: C.red }, duration: d(inst, 0.3) });
      });
    }
    return { enter: (inst) => q.run('enter', inst), act: (n, inst) => q.run(n, inst) };
  }

  /* ---------- guruhlangan ustunlar ---------- */
  function groupChart(host, o) {
    const f = frame(host, o);
    const q = queue();
    const G = o.groups, S = o.series;
    const gw = (f.x1 - f.x0) / G.length;
    const bw = (gw * 0.8) / S.length;
    const zeroY = f.sy(0);
    G.forEach((g, gi) => {
      el('text', { x: f.x0 + gi * gw + gw / 2, y: f.y0 + 38, 'text-anchor': 'middle', class: 'lbl', fill: C.ink }, f.svg, g.label);
      S.forEach((s, si) => {
        const v = s.v(g.year);
        const x = f.x0 + gi * gw + gw * 0.1 + si * bw;
        const r = el('rect', { x: x + 4, width: bw - 8, y: zeroY, height: 0, fill: s.color, rx: 2 }, f.svg);
        const ty = v >= 0 ? f.sy(v) - 12 : f.sy(v) + 30;
        const t = el('text', { x: x + bw / 2, y: ty, 'text-anchor': 'middle', class: 'lbl', fill: s.text, opacity: 0 }, f.svg, fmt(v, 1, true));
        q.add('enter', (inst) => {
          const geo = v >= 0 ? { y: f.sy(v), height: zeroY - f.sy(v) } : { y: zeroY, height: f.sy(v) - zeroY };
          gsap.to(r, { attr: geo, duration: d(inst, 0.7), delay: d(inst, gi * 0.25 + si * 0.06), ease: 'power2.out' });
          fadeIn(t, inst, gi * 0.25 + 0.7);
        });
      });
    });
    el('line', { x1: f.x0, x2: f.x1, y1: zeroY, y2: zeroY, stroke: C.ink, 'stroke-width': 2 }, f.svg);
    // legenda
    const lg = el('g', {}, f.svg);
    let lx = f.x1;
    [...S].reverse().forEach((s) => {
      const t = el('text', { x: lx, y: 22, 'text-anchor': 'end', fill: s.text, class: 'lbl' }, lg, s.name);
      const w = t.getComputedTextLength();
      el('rect', { x: lx - w - 30, y: 4, width: 20, height: 20, rx: 3, fill: s.color }, lg);
      lx -= w + 56;
    });
    return { enter: (inst) => q.run('enter', inst), act: () => {} };
  }

  /* ---------- ulushlar (HTML, kengligi o‘zgaradi) ---------- */
  function shareChart(host) {
    const keys = ['serv', 'ind', 'constr', 'agri'];
    host.innerHTML = '<div class="sharebars">' + [2000, 2025].map((yr) =>
      `<div class="sharerow" data-yr="${yr}"><span class="yr">${yr}</span><div class="sharebar">` +
      keys.map((k) => `<div class="${k}"></div>`).join('') + '</div></div>').join('') + '</div>';
    const rows = host.querySelectorAll('.sharerow');
    const set = (row, yr, inst, dur, delay = 0) => keys.forEach((k) => {
      const seg = row.querySelector('.' + k);
      const v = at(D.share[k], yr);
      gsap.to(seg, { width: v + '%', duration: d(inst, dur), delay: d(inst, delay), ease: 'power2.inOut' });
      const obj = { v: parseFloat(seg.dataset.v || 0) };
      if (k === 'serv' || k === 'ind') {
        gsap.to(obj, { v, duration: d(inst, dur), delay: d(inst, delay), onUpdate: () => { seg.textContent = fmt(obj.v, 1) + '%'; }, onComplete: () => { seg.textContent = fmt(v, 1) + '%'; } });
      }
      seg.dataset.v = v;
    });
    gsap.set(rows[1], { opacity: 0 });
    rows.forEach((r) => r.querySelectorAll('.sharebar div').forEach((s) => gsap.set(s, { width: 0 })));
    return {
      enter(inst) { set(rows[0], 2000, inst, 1.0); },
      act(name, inst) {
        if (name !== 'flow') return;
        gsap.to(rows[1], { opacity: 1, duration: d(inst, 0.2) });
        rows[1].querySelectorAll('.sharebar div').forEach((s, i) => { gsap.set(s, { width: at(D.share[keys[i]], 2000) + '%' }); s.dataset.v = at(D.share[keys[i]], 2000); });
        set(rows[1], 2025, inst, 1.8, 0.25); // ulushlar 2000 dan 2025 ga "oqadi"
      },
    };
  }

  /* ---------- grafik ta’riflari ---------- */
  const CHARTS = {
    share: shareChart,

    'ind-nominal': (host) => {
      const g = yoy(D.realidx.ind);
      return barChart(host, {
        h: 380, v: div(D.nominal.ind, 1000), yMin: 0, yMax: 4000, yStep: 1000,
        unit: 'mlrd $, joriy narxda', color: (yr) => (yr === 2009 || yr === 2020 ? C.ind2 : C.ind),
        labels: [
          { year: 2000, text: fmt(D.nominal.ind[0] / 1000, 0), anchor: 'start', dx: -14 },
          { year: 2025, text: fmt(last(D.nominal.ind) / 1000, 0), anchor: 'end', dx: 14 },
          { year: 2009, text: `2009: real ${fmt(at(g, 2009), 1)}%`, color: C.red, at: 3050 },
          { year: 2020, text: `2020: real ${fmt(at(g, 2020), 1)}%`, color: C.red, at: 3450, anchor: 'end', dx: 14 },
        ],
      });
    },

    'ind-scissors': (host) => {
      const real = D.realidx.ind, emp = toIdx(D.emp.ind), ex = D.realidx.manuf_excomp;
      const lost = (D.emp.ind[0] - last(D.emp.ind)) / 1000;
      return lineChart(host, {
        h: 600, yMin: 60, yMax: 180, yStep: 20, base100: true, m: { r: 250 },
        unit: 'indeks, 2000 = 100', dur: 2,
        series: [
          { v: real, color: C.ind, w: 6, label: `Real hajm\n${fmt(change(real), 1, true)}%`, dy: -10 },
          { v: emp, color: C.red, w: 6, label: `Bandlik\n${fmt(change(D.emp.ind), 1, true)}%` },
          { v: ex, color: C.ind2, w: 5, dash: '14 10', when: 'excomp', text: C.ind,
            label: `Kompyuter va\nelektronikasiz\n${fmt(change(ex), 0, true)}%`, dy: 36 },
        ],
        areas: [{ hi: 0, lo: 1, fill: C.ind, opacity: 0.1, dur: 2, label: `${fmt(lost, 1)} mln ish o‘rni yo‘qoldi`, lx: 2015, lv: 88, labelColor: C.ink }],
      });
    },

    'serv-share': (host) => {
      const emp = ratio(D.emp.serv, D.emp.total);
      return lineChart(host, {
        h: 380, yMin: 74, yMax: 86, yStep: 4, m: { r: 250 }, unit: '%',
        series: [
          { v: D.share.serv, color: C.serv, w: 6, text: C.servText, label: `YaIMdagi ulush\n${fmt(last(D.share.serv), 1)}%`, dy: 10, startLabel: fmt(D.share.serv[0], 1), sdy: 34 },
          { v: emp, color: C.servText, w: 4, dash: '12 8', label: `Bandlikdagi ulush\n${fmt(last(emp), 1)}%`, dy: -40 },
        ],
      });
    },

    'serv-emp': (host) => {
      const v = div(D.emp.serv, 1000);
      const g = yoy(D.realidx.serv);
      return barChart(host, {
        h: 600, v, yMin: 80, yMax: 130, yStep: 10, unit: 'bandlik, mln kishi (o‘q 80 dan boshlanadi)',
        color: () => C.serv, drop: { year: 2020, from: at(v, 2019) },
        labels: [
          { year: 2000, text: fmt(v[0], 1), anchor: 'start', dx: -14 },
          { year: 2025, text: fmt(last(v), 1), anchor: 'end', dx: 14 },
          { year: 2020, text: '2020: pandemiya', color: C.red, when: 'drop', at: 124, anchor: 'end', dx: 14 },
          { year: 2021, text: `2021: real ${fmt(at(g, 2021), 1, true)}%`, when: 'drop', at: 129, anchor: 'start', dx: -14 },
        ],
      });
    },

    'agri-idx': (host) => lineChart(host, {
      h: 380, yMin: 80, yMax: 320, yStep: 60, base100: true, m: { r: 230 }, unit: 'indeks, 2000 = 100',
      series: [
        { v: toIdx(D.nominal.agri), color: C.agri2, w: 5, text: C.agriText, label: `Joriy narxda\n${fmt(change(D.nominal.agri), 1, true)}%`, dy: -14 },
        { v: D.realidx.agri, color: C.agri, w: 6, text: C.agriText, label: `Real hajm\n${fmt(change(D.realidx.agri), 0, true)}%`, dy: 24 },
      ],
    }),

    'agri-yoy': (host) => {
      const g = yoy(D.realidx.agri);
      const lab = (yr, extra, dy) => ({ year: yr, text: (extra ? extra + ' ' : '') + fmt(at(g, yr), 1, true), dy });
      return barChart(host, {
        h: 440, v: g, yMin: -12, yMax: 12, yStep: 4, unit: 'real o‘sish, oldingi yilga nisbatan, %',
        color: (yr, val) => (val >= 0 ? C.agri : C.red),
        labels: [lab(2007), lab(2009), lab(2012, 'qurg‘oqchilik'), lab(2013), lab(2019, 'toshqin')],
      });
    },

    'constr-idx': (host) => {
      const nom = toIdx(D.nominal.constr), real = D.realidx.constr;
      return lineChart(host, {
        h: 380, yMin: 60, yMax: 300, yStep: 60, base100: true, m: { r: 230 }, unit: 'indeks, 2000 = 100',
        series: [
          { v: nom, color: C.constr2, w: 5, text: C.constr, label: `Joriy narxda\n${fmt(change(D.nominal.constr), 1, true)}%`, dy: -10 },
          { v: real, color: C.constr, w: 6, label: `Real hajm\n${fmt(change(real), 1, true)}%`, dy: 18 },
        ],
        areas: [{ hi: 0, lo: 1, fill: C.constr, opacity: 0.22, when: 'price', dur: 1.6, label: 'narx o‘sishi', lx: 2019, lv: 150, labelColor: C.constr }],
      });
    },

    'constr-emp': (host) => {
      const v = div(D.emp.constr, 1000);
      return barChart(host, {
        h: 380, v, yMin: 0, yMax: 12, yStep: 3, unit: 'bandlik, mln kishi', yFmt: (x) => fmt(x, 0),
        color: () => C.constr,
        zones: [
          { from: 2006, to: 2009, label: 'uy-joy pufagi', when: 'z1', lv: 10.4 },
          { from: 2022, to: 2022, label: 'foiz shoki', when: 'z2', lv: 10.4, anchor: 'end' },
          { from: 2023, to: 2024, label: 'zavodlar', when: 'z3', fill: C.agri, lv: 10.4 },
        ],
        labels: [
          { year: 2000, text: fmt(v[0], 2), anchor: 'start', dx: -14 },
          { year: 2025, text: fmt(last(v), 2), anchor: 'end', dx: 14 },
        ],
      });
    },

    crisis: (host) => groupChart(host, {
      h: 400, yMin: -16, yMax: 12, yStep: 4, unit: 'real o‘sish, %', m: { t: 60 },
      groups: [{ year: 2009, label: '2009' }, { year: 2020, label: '2020' }, { year: 2022, label: '2022' }],
      series: SECT.map((s) => ({ name: s.name, color: s.color, text: s.text, v: (yr) => at(yoy(D.realidx[s.k]), yr) })),
    }),
  };

  /* ---------- jadvallar ---------- */
  const TY = [2000, 2005, 2010, 2015, 2020, 2025];
  function sectorTable(t, k) {
    const rows = [
      ['Qo‘shilgan qiymat, mlrd $', div(D.nominal[k], 1000), k === 'agri' ? 1 : 0],
      ['YaIMdagi ulush, %', D.share[k], k === 'agri' ? 2 : 1],
      ['Real hajm, 2000 = 100', D.realidx[k], 1],
      ['Bandlik, mln kishi', div(D.emp[k], 1000), k === 'serv' ? 1 : 2],
    ];
    t.innerHTML = '<thead><tr><th></th>' + TY.map((y) => `<th>${y}</th>`).join('') + '</tr></thead><tbody>' +
      rows.map(([lab, arr, dec]) => `<tr><td>${lab}</td>` + TY.map((y) => `<td>${fmt(at(arr, y), dec)}</td>`).join('') + '</tr>').join('') + '</tbody>';
  }
  function shareTable(t) {
    t.innerHTML = '<thead><tr><th>YaIMdagi ulush, %</th><th>2000</th><th>2025</th><th>o‘zgarish, f.p.</th></tr></thead><tbody>' +
      SECT.map((s) => {
        const dec = s.k === 'agri' ? 2 : 1;
        const a = D.share[s.k][0], b = last(D.share[s.k]);
        return `<tr><td><span class="sw" style="background:${s.color}"></span>${s.name}</td><td>${fmt(a, dec)}</td><td>${fmt(b, dec)}</td><td>${fmt(b - a, dec, true)}</td></tr>`;
      }).join('') + '</tbody>';
  }
  function compareTable(t) {
    const rows = [
      ['Real o‘sish, yiliga o‘rtacha (CAGR), %', (k) => cagr(D.realidx[k]), 2, true],
      ['Nominal o‘sish, 2000–2025, %', (k) => change(D.nominal[k]), 1, true],
      ['YaIMdagi ulush o‘zgarishi, f.p.', (k) => last(D.share[k]) - D.share[k][0], 1, true],
      ['Bandlik o‘zgarishi, %', (k) => change(D.emp[k]), 1, true],
      ['QQ / 1 xodim, ming $, 2025', (k) => last(D.nominal[k]) / last(D.emp[k]), 0, false],
    ];
    let h = '<thead><tr><th></th>' + SECT.map((s) => `<th style="color:${s.text}">${s.name}</th>`).join('') + '</tr></thead><tbody>';
    rows.forEach(([lab, fn, dec, plus]) => {
      const vals = SECT.map((s) => fn(s.k));
      const best = Math.max(...vals);
      h += `<tr><td>${lab}</td>` + vals.map((v) => `<td class="${v === best ? 'hi' : ''}">${fmt(v, dec, plus)}</td>`).join('') + '</tr>';
    });
    h += '<tr><td>Real o‘sish yillarida bandlik ham o‘sgan</td>' + SECT.map((s) => { const [a, b] = coMove(s.k); return `<td class="${a / b > 0.8 ? 'hi' : ''}">${a}/${b}</td>`; }).join('') + '</tr>';
    t.innerHTML = h + '</tbody>';
  }

  /* ---------- ilova: yillik jadval ---------- */
  const APX = [
    { id: 'nom', label: 'Qo‘shilgan qiymat, mlrd $', row: (k) => div(D.nominal[k], 1000), dec: (k) => (k === 'agri' ? 1 : 0), gdp: true },
    { id: 'share', label: 'YaIMdagi ulush, %', row: (k) => D.share[k], dec: (k) => (k === 'agri' ? 2 : 1), gdp: false },
    { id: 'real', label: 'Real hajm, 2000 = 100', row: (k) => D.realidx[k], dec: () => 1, gdp: true },
    { id: 'yoy', label: 'Real o‘sish, %', row: (k) => yoy(D.realidx[k]), dec: () => 1, gdp: true, plus: true },
    { id: 'emp', label: 'Bandlik, ming kishi', row: (k) => D.emp[k === 'gdp' ? 'total' : k], dec: () => 0, gdp: true },
  ];
  function appendix(slide) {
    const tabs = slide.querySelector('.tabs'), wrap = slide.querySelector('.apx-wrap');
    tabs.innerHTML = APX.map((a, i) => `<button type="button" data-apx="${a.id}" aria-pressed="${i === 0}">${a.label}</button>`).join('');
    const render = (id) => {
      const a = APX.find((x) => x.id === id);
      const keys = (a.gdp ? [{ k: 'gdp', name: id === 'emp' ? 'Jami' : 'YaIM' }] : []).concat(SECT);
      const half = [Y.slice(0, 13), Y.slice(13)];
      wrap.innerHTML = half.map((ys) => '<table class="tbl apx"><thead><tr><th></th>' + ys.map((y) => `<th>${y}</th>`).join('') + '</tr></thead><tbody>' +
        keys.map((s) => {
          const arr = a.row(s.k);
          return `<tr><td>${s.name}</td>` + ys.map((y) => { const v = at(arr, y); return `<td>${v == null ? '—' : fmt(v, a.dec(s.k), a.plus)}</td>`; }).join('') + '</tr>';
        }).join('') + '</tbody></table>').join('');
      tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.apx === id));
    };
    tabs.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { e.stopPropagation(); render(b.dataset.apx); } });
    render('nom');
  }

  window.CHARTS = {
    build(id, host) { host.innerHTML = ''; return CHARTS[id](host); },
    table(t) {
      const k = t.dataset.table;
      if (k === 'share') shareTable(t); else if (k === 'compare') compareTable(t); else sectorTable(t, k);
    },
    appendix, fmt,
  };
})();
