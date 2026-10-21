/* Taqdimot boshqaruvi: slaydlar, qadam-baqadam ochilish, ssenariy paneli, PDF rejimi. */
(function () {
  const stage = document.getElementById('stage');
  const slides = [...document.querySelectorAll('.slide')];
  const notesEl = document.getElementById('notes');
  const params = new URLSearchParams(location.search);
  const PRINT = params.has('print');
  window.REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const d = (s, inst) => (inst || window.REDUCED ? 0 : s);
  const N = slides.length;
  let cur = -1, step = 0, startedAt = null;

  /* ---------- sahna o‘lchami ---------- */
  function fit() {
    if (PRINT) return;
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = `scale(${s})`;
  }

  /* ---------- tipografiya: → (shriftda yo‘q) SVG strelka, · oralig‘i, defisli so‘z uzilmasin ---------- */
  const ARROW = '<svg viewBox="0 0 44 24" style="width:.95em;height:.55em;vertical-align:.08em;overflow:visible"><path d="M2 12H38M28 3l11 9-11 9" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const HYPH = /([0-9A-Za-z‘’]+(?:-[0-9A-Za-z‘’]+)+)/g;
  function typo(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const hits = [];
    while (walker.nextNode()) {
      const t = walker.currentNode;
      if (t.parentNode.closest('svg, script')) continue;
      if (/→| · /.test(t.nodeValue) || (HYPH.test(t.nodeValue) && !t.parentNode.closest('.refs'))) hits.push(t);
      HYPH.lastIndex = 0;
    }
    hits.forEach((t) => {
      const inRefs = !!t.parentNode.closest('.refs');
      let h = t.nodeValue.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      if (!inRefs) h = h.replace(HYPH, '<span class="nw">$1</span>');
      h = h.replace(/ · /g, '<span class="dot" role="separator"></span>').replace(/→/g, `<span class="arr">${ARROW}</span>`);
      const span = document.createElement('span');
      span.innerHTML = h;
      t.replaceWith(...span.childNodes);
    });
  }

  /* ---------- bezaklar: CHIQISH belgisi, ma’ruzachi, video ---------- */
  slides.forEach((s, i) => {
    s.dataset.n = i + 1;
    if (s.dataset.exit) {
      const hd = s.querySelector('.hd');
      const sign = document.createElement('div');
      sign.className = 'sign';
      sign.innerHTML = `<span class="tab">CHIQISH ${i + 1}</span><span class="panel">${s.dataset.exit}</span>`;
      hd.appendChild(sign);
    }
    if (s.dataset.speaker) {
      const sp = document.createElement('div');
      sp.className = 'speaker';
      sp.textContent = s.dataset.speaker;
      s.appendChild(sp);
    }
    const rp = document.createElement('div');
    rp.className = 'road-print';
    rp.innerHTML = `<i style="width:${(i / (N - 1)) * 100}%"></i>`;
    s.appendChild(rp);
    // ixtiyoriy fon videosi: assets/video/<nom>.mp4 bo‘lsa ko‘rinadi, bo‘lmasa jimgina olib tashlanadi
    if (s.dataset.video && !PRINT && location.protocol !== 'about:') {
      const v = document.createElement('video');
      v.className = 'bg-video'; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
      const src = document.createElement('source');
      src.src = `assets/video/${s.dataset.video}.mp4`; src.type = 'video/mp4';
      src.addEventListener('error', () => v.remove());
      v.appendChild(src);
      s.prepend(v);
    }
    s.querySelectorAll('[data-table]').forEach((t) => CHARTS.table(t));
    typo(s);
    if (s.dataset.id === 'ilova') CHARTS.appendix(s);
  });

  // yo‘ldagi milya belgilari
  const road = document.getElementById('road');
  slides.forEach((_, i) => {
    const m = document.createElement('i');
    m.className = 'mile';
    m.style.left = `calc(${(i / (N - 1)) * 100}% - 1px)`;
    road.appendChild(m);
  });

  /* ---------- hisoblagich: 0 dan sanab ko‘tariladi ---------- */
  function countUp(el, inst) {
    const final = el.dataset.final || (el.dataset.final = el.textContent);
    const m = final.match(/^([^\d]*)([\d  ]*\d(?:,\d+)?)(.*)$/);
    if (!m) return;
    const dec = (m[2].split(',')[1] || '').length;
    const target = parseFloat(m[2].replace(/[\s ]/g, '').replace(',', '.'));
    const o = { v: 0 };
    const show = (v) => { el.textContent = m[1] + CHARTS.fmt(v, dec) + m[3]; };
    if (d(1.2, inst) === 0) { el.textContent = final; return; }
    show(0);
    gsap.to(o, { v: target, duration: 1.2, ease: 'power2.out', onUpdate: () => show(o.v), onComplete: () => { el.textContent = final; } });
  }

  /* ---------- slaydni tayyorlash va qadamlar ---------- */
  function prepare(s) {
    s._charts = {};
    s.querySelectorAll('.chart[data-chart]').forEach((h) => { s._charts[h.dataset.chart] = CHARTS.build(h.dataset.chart, h); });
    s._steps = Math.max(0, ...[...s.querySelectorAll('[data-step]')].map((e) => +e.dataset.step));
    s.querySelectorAll('[data-step]:not(.marker)').forEach((e) => gsap.set(e, { autoAlpha: 0, y: 0 }));
    s.querySelectorAll('.count').forEach((c) => { if (c.dataset.final) c.textContent = c.dataset.final; });
  }

  function reveal(s, n, inst) {
    s.querySelectorAll(`[data-step="${n}"]`).forEach((e) => {
      if (e.dataset.act) {
        const [cid, name] = e.dataset.act.split(':');
        if (s._charts[cid]) s._charts[cid].act(name, inst);
        return;
      }
      gsap.fromTo(e, { autoAlpha: 0, y: d(22, inst) }, { autoAlpha: 1, y: 0, duration: d(0.5, inst), ease: 'power2.out' });
      const hosts = e.matches('.chart[data-chart]') ? [e] : [...e.querySelectorAll('.chart[data-chart]')];
      hosts.forEach((h) => s._charts[h.dataset.chart].enter(inst));
      e.querySelectorAll('.count').forEach((c) => countUp(c, inst));
    });
  }

  // qadam 0: sarlavha va qadamsiz elementlar
  function intro(s, inst) {
    const head = s.querySelectorAll('.hd .title, .hd .lede, .hd .sign, .hd .gantry, .hd .shield');
    gsap.fromTo(head, { autoAlpha: 0, y: d(18, inst) }, { autoAlpha: 1, y: 0, duration: d(0.5, inst), stagger: d(0.08, inst), ease: 'power2.out' });
    s.querySelectorAll('.chart[data-chart]').forEach((h) => { if (!h.closest('[data-step]')) s._charts[h.dataset.chart].enter(inst); });
  }

  function go(i, { final = false } = {}) {
    i = Math.max(0, Math.min(N - 1, i));
    const prev = slides[cur];
    const next = slides[i];
    if (prev && prev !== next) {
      gsap.to(prev, { autoAlpha: 0, duration: d(0.3), onComplete: () => { prev.classList.remove('active'); prev.querySelector('video')?.pause(); } });
    }
    cur = i; step = 0;
    prepare(next);
    next.classList.add('active');
    gsap.fromTo(next, { autoAlpha: 0 }, { autoAlpha: 1, duration: d(0.45) });
    next.querySelector('video')?.play().catch(() => {});
    intro(next, final);
    if (final) { while (step < next._steps) reveal(next, ++step, true); }
    if (!PRINT) history.replaceState(null, '', '#' + (i + 1));
    ui();
  }

  function forward() {
    if (startedAt == null) startedAt = Date.now();
    const s = slides[cur];
    if (step < s._steps) { reveal(s, ++step); ui(); }
    else if (cur < N - 1) go(cur + 1);
  }
  function back() { if (cur > 0) go(cur - 1, { final: true }); else go(0); }

  /* ---------- progress va ssenariy ---------- */
  function ui() {
    const s = slides[cur];
    document.querySelector('#road .fill').style.width = `${(cur / (N - 1)) * 100}%`;
    const dots = s._steps ? '\u2003' + '●'.repeat(step) + '○'.repeat(s._steps - step) : '';
    document.getElementById('clicks').textContent = `${cur + 1} / ${N}${dots}`;
    renderNotes();
  }
  function renderNotes() {
    const s = slides[cur];
    const n = (window.NOTES || {})[s.dataset.id] || {};
    const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const paras = (n.text || '').trim().split(/\n+/).map((p) => {
      const cue = p.startsWith('▶');
      return `<p>${cue ? '<span class="cue">▶ bosing.</span> ' + esc(p.slice(1).trim()) : esc(p)}</p>`;
    }).join('');
    const nx = slides[cur + 1];
    notesEl.innerHTML = `<header><b>${cur + 1}. ${s.dataset.short || ''}</b><span class="timer" id="timer"></span></header>` +
      (n.who ? `<div class="who">Gapiradi: ${n.who}, ${n.time}</div>` : '') + paras +
      `<div class="next">Qadam: ${step} / ${s._steps}${nx ? ' · Keyingi slayd: ' + (nx.dataset.short || '') : ''}</div>`;
    tick();
  }
  function tick() {
    const t = document.getElementById('timer');
    if (!t) return;
    if (startedAt == null) { t.textContent = '00:00'; return; }
    const sec = Math.floor((Date.now() - startedAt) / 1000);
    t.textContent = String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
  }
  setInterval(tick, 1000);

  /* ---------- boshqaruv ---------- */
  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  }
  addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    const k = e.key;
    if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(k)) { e.preventDefault(); forward(); }
    else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); back(); }
    else if (k === 'Home') go(0);
    else if (k === 'End') go(N - 1, { final: true });
    else if (k === 's' || k === 'S' || k === 'ы' || k === 'Ы') notesEl.classList.toggle('open');
    else if (k === 'f' || k === 'F' || k === 'а' || k === 'А') toggleFull();
    else if (k === 'h' || k === 'H' || k === '?') document.getElementById('help').classList.toggle('show');
  });
  document.getElementById('viewport').addEventListener('click', (e) => {
    if (e.target.closest('button, a, #notes')) return;
    forward();
  });
  let tx = null, ty = null;
  addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  addEventListener('touchend', (e) => {
    if (tx == null) return;
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { e.preventDefault(); dx < 0 ? forward() : back(); }
    tx = null;
  });
  addEventListener('resize', fit);

  /* ---------- ishga tushirish ---------- */
  function start() {
    if (PRINT) {
      // PDF: har bir slayd yakuniy holatda, animatsiyasiz
      document.body.classList.add('print');
      slides.forEach((s) => {
        prepare(s);
        s.classList.add('active');
        intro(s, true);
        for (let k = 1; k <= s._steps; k++) reveal(s, k, true);
      });
      gsap.ticker.tick();
      window.__ready = true;
      return;
    }
    fit();
    const h = parseInt(location.hash.slice(1), 10);
    go(Number.isFinite(h) ? h - 1 : 0, { final: Number.isFinite(h) && h > 1 });
    window.__ready = true;
  }
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(start);

  window.TAQDIMOT = { go, forward, back, slides };
})();
