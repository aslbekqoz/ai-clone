// Tashqi fayllarni taqdimot/ ichiga lokal nusxalaydi (internetsiz ishlashi uchun).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'taqdimot');
const mk = (p) => fs.mkdirSync(p, { recursive: true });
mk(path.join(out, 'css'));
// eski shrift fayllari qolib ketmasin
fs.rmSync(path.join(out, 'assets/fonts'), { recursive: true, force: true });
const cp = (from, to) => { mk(path.dirname(to)); fs.copyFileSync(from, to); };

cp(path.join(root, 'node_modules/gsap/dist/gsap.min.js'), path.join(out, 'js/vendor/gsap.min.js'));

const fonts = [
  ['@fontsource/ibm-plex-sans', 'ibm-plex-sans-latin-400-normal.woff2'],
  ['@fontsource/ibm-plex-sans', 'ibm-plex-sans-latin-ext-400-normal.woff2'],
  ['@fontsource/ibm-plex-sans', 'ibm-plex-sans-latin-600-normal.woff2'],
  ['@fontsource/ibm-plex-sans', 'ibm-plex-sans-latin-ext-600-normal.woff2'],
  ['@fontsource/ibm-plex-sans', 'ibm-plex-sans-latin-700-normal.woff2'],
  ['@fontsource/ibm-plex-sans', 'ibm-plex-sans-latin-ext-700-normal.woff2'],
  ['@fontsource/source-serif-4', 'source-serif-4-latin-400-normal.woff2'],
  ['@fontsource/source-serif-4', 'source-serif-4-latin-400-italic.woff2'],
  ['@fontsource/source-serif-4', 'source-serif-4-latin-600-normal.woff2'],
];
for (const [pkg, file] of fonts) {
  cp(path.join(root, 'node_modules', pkg, 'files', file), path.join(out, 'assets/fonts', file));
}

// @font-face qoidalari fontsource CSS'idan olinadi (unicode-range bilan), yo'llar lokal fayllarga almashtiriladi.
const faces = [];
for (const pkg of new Set(fonts.map(([p]) => p))) {
  const dir = path.join(root, 'node_modules', pkg);
  for (const css of fs.readdirSync(dir).filter((f) => /^\d{3}(-italic)?\.css$/.test(f))) {
    for (const block of fs.readFileSync(path.join(dir, css), 'utf8').split('/*').slice(1)) {
      const name = block.slice(0, block.indexOf('*/')).trim();
      if (!fonts.some(([, f]) => f === name + '.woff2')) continue;
      const rule = block.slice(block.indexOf('@font-face'))
        .replace(/src:[^;]+;/, `src: url(../assets/fonts/${name}.woff2) format('woff2');`)
        .replace('font-display: swap', 'font-display: block').trim();
      faces.push(`/* ${name} */\n${rule}`);
    }
  }
}
fs.writeFileSync(path.join(out, 'css/fonts.css'), '/* Avtomatik yaratilgan: tools/build.js */\n' + [...new Set(faces)].join('\n\n') + '\n');

// data.json — grafiklar uchun yagona manba. file:// orqali fetch ishlamagani uchun JS o'rami ham yoziladi.
const json = fs.readFileSync(path.join(root, 'data/data.json'), 'utf8');
JSON.parse(json);
cp(path.join(root, 'data/data.json'), path.join(out, 'assets/data/data.json'));
fs.writeFileSync(path.join(out, 'js/data.js'),
  '// Avtomatik yaratilgan: data/data.json nusxasi. Qo\'lda tahrirlamang — `npm run build`.\nwindow.DATA = ' + json.trim() + ';\n');

console.log('build: tayyor');
