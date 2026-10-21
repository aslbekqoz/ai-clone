// Playwright: har bir slaydning yakuniy holatini skrinshot qiladi (shots/) va taqdimot.pdf yaratadi.
// Qo'shimcha: slayd chegarasidan chiqqan yoki kesilgan elementlarni topadi.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const root = path.join(__dirname, '..');
  const url = 'file://' + path.join(root, 'taqdimot/index.html') + '?print';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true);
  await page.waitForTimeout(800);

  const problems = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.slide').forEach((s, i) => {
      const sb = s.getBoundingClientRect();
      s.querySelectorAll('h1,h2,h3,h4,p,li,td,th,small,.n,.big,.why,.means,.chart,table,.flow,.prop,.event,.crisis,.answer,.def,.concl > div,dd,.speaker,.sign').forEach((e) => {
        const r = e.getBoundingClientRect();
        if (!r.width) return;
        const name = e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).split(' ')[0] : '');
        if (r.right > sb.right - 40 || r.bottom > sb.bottom - 32 || r.left < sb.left + 40) out.push(`${i + 1}: chegaradan chiqdi ${name} "${e.textContent.trim().slice(0, 40)}" (${Math.round(r.right - sb.left)}, ${Math.round(r.bottom - sb.top)})`);
        if (e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow === 'hidden') out.push(`${i + 1}: kesildi ${name}`);
      });
      // asosiy maydon pastki chegarasi: ma'ruzachi qatoriga tegmasin
      const main = s.querySelector('.main, .refs');
      if (main) {
        let bottom = 0;
        main.querySelectorAll('*').forEach((c) => { const r = c.getBoundingClientRect(); if (r.height) bottom = Math.max(bottom, r.bottom - sb.top); });
        if (bottom > 1000) out.push(`${i + 1}: kontent juda past tushdi (${Math.round(bottom)}px)`);
      }
      // matn kamida 24px
      s.querySelectorAll('*').forEach((e) => {
        if (!e.childNodes.length || ![...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim())) return;
        const fs = parseFloat(getComputedStyle(e).fontSize);
        if (fs < 24 && !e.closest('#notes')) out.push(`${i + 1}: kichik shrift ${fs}px "${e.textContent.trim().slice(0, 30)}"`);
      });
    });
    return out;
  });

  fs.mkdirSync(path.join(root, 'shots'), { recursive: true });
  const slides = await page.$$('.slide');
  for (let i = 0; i < slides.length; i++) {
    await slides[i].screenshot({ path: path.join(root, 'shots', String(i + 1).padStart(2, '0') + '.png') });
  }
  await page.pdf({ path: path.join(root, 'taqdimot.pdf'), width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true });
  await browser.close();
  console.log(`slaydlar: ${slides.length}, PDF: taqdimot.pdf`);
  if (errors.length) console.log('JS xatolari:\n' + errors.join('\n'));
  console.log(problems.length ? 'Muammolar:\n' + [...new Set(problems)].join('\n') : 'Joylashuv: muammo topilmadi');
})();
