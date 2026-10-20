// Saytga bitta qator bilan qo'yiladigan chat vidjeti va ommaviy klon sahifasi (aiclone.uz/c/<slug>).
// Uslub — "Ink & Bone": krem fon, qora tipografiya, bitta aksent.
//
//   <script src="https://api.aiclone.uz/widget.js" data-clone="dilnoza" async></script>

const STYLES = `
.acw-root{--ink:#16130f;--bone:#f6f1e7;--line:#d9d0bf;--accent:#b4441c;--muted:#6f675b;font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink)}
.acw-panel{display:flex;flex-direction:column;min-width:0;background:var(--bone);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.acw-head{padding:14px 16px;border-bottom:1px solid var(--line);font:600 16px/1.2 Georgia,"Times New Roman",serif}
.acw-head small{display:block;font:12px/1.4 system-ui,sans-serif;color:var(--muted);margin-top:2px}
.acw-log{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:10px}
.acw-msg{max-width:85%;padding:9px 12px;border-radius:12px;white-space:pre-wrap;word-wrap:break-word}
.acw-bot{align-self:flex-start;background:#fff;border:1px solid var(--line)}
.acw-owner{align-self:flex-start;background:#fff;border:1px solid var(--accent)}
.acw-user{align-self:flex-end;background:var(--brand,var(--ink));color:var(--bone)}
.acw-src{display:block;margin-top:6px;font-size:12px;color:var(--muted)}
.acw-src a{color:var(--accent)}
.acw-offers{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.acw-offers a{display:block;text-align:center;padding:8px 10px;border-radius:9px;background:var(--brand,var(--ink));color:var(--bone);text-decoration:none;font-size:14px}
.acw-form{display:flex;gap:8px;padding:10px;border-top:1px solid var(--line)}
.acw-form input{flex:1;min-width:0;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font:inherit;background:#fff;color:var(--ink)}
.acw-form button{border:0;border-radius:10px;padding:0 16px;background:var(--brand,var(--ink));color:var(--bone);font:inherit;cursor:pointer}
.acw-form button:disabled{opacity:.5;cursor:default}
.acw-fab{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;border:0;background:var(--brand,var(--ink));color:var(--bone);font-size:24px;cursor:pointer;box-shadow:0 6px 24px rgba(0,0,0,.18);z-index:2147483000}
.acw-float{position:fixed;right:20px;bottom:88px;width:min(380px,calc(100vw - 32px));height:min(560px,calc(100vh - 120px));z-index:2147483000;box-shadow:0 12px 40px rgba(0,0,0,.18)}
.acw-hidden{display:none}
.acw-logo{width:28px;height:28px;border-radius:7px;object-fit:cover;float:left;margin-right:10px}
.acw-rate{display:flex;gap:4px;margin-top:6px}
.acw-rate button{border:1px solid var(--line);background:transparent;border-radius:8px;padding:1px 8px;font-size:13px;cursor:pointer}
.acw-rate button[aria-pressed=true]{background:var(--ink);border-color:var(--ink)}
`;

/** Vidjet skripti. `base` — API manzili. Hech qanday tashqi kutubxona yo'q. */
export function widgetJs(base: string): string {
  return `(()=>{
const BASE=${JSON.stringify(base)};
const script=document.currentScript;
const slug=(script&&script.dataset.clone)||(window.AICLONE&&window.AICLONE.clone);
const mount=(script&&script.dataset.mount)||(window.AICLONE&&window.AICLONE.mount);
if(!slug){console.warn("AI Clone: data-clone ko'rsatilmagan");return;}
const css=document.createElement("style");css.textContent=${JSON.stringify(STYLES)};document.head.appendChild(css);
const key="aiclone:"+slug;let vid;
try{vid=localStorage.getItem(key);if(!vid){vid=crypto.randomUUID();localStorage.setItem(key,vid);}}catch{vid=crypto.randomUUID();}
const root=document.createElement("div");root.className="acw-root";
root.innerHTML='<div class="acw-panel"><div class="acw-head"></div><div class="acw-log" aria-live="polite"></div><form class="acw-form"><input placeholder="Savolingizni yozing…" maxlength="2000" aria-label="Xabar"><button type="submit">Yuborish</button></form></div>';
const panel=root.firstChild,head=root.querySelector(".acw-head"),log=root.querySelector(".acw-log"),form=root.querySelector("form"),input=form.querySelector("input"),btn=form.querySelector("button");
head.textContent=(script&&script.dataset.title)||"AI-klon bilan suhbat";
const small=document.createElement("small");small.textContent="Javoblar AI tomonidan beriladi";head.appendChild(small);
fetch(BASE+"/public/"+encodeURIComponent(slug)+"/config").then(r=>r.ok?r.json():null).then(b=>{if(!b)return;
  if(b.accent&&/^#[0-9a-f]{6}$/i.test(b.accent))root.style.setProperty("--brand",b.accent);
  if(b.logoUrl&&/^https:/.test(b.logoUrl)){const i=document.createElement("img");i.className="acw-logo";i.src=b.logoUrl;i.alt="";head.prepend(i);}}).catch(()=>{});
const target=mount&&document.querySelector(mount);
if(target){panel.style.height="100%";target.appendChild(root);}else{
  panel.classList.add("acw-float","acw-hidden");const fab=document.createElement("button");fab.className="acw-fab";fab.setAttribute("aria-label","Chatni ochish");fab.textContent="💬";
  fab.onclick=()=>{panel.classList.toggle("acw-hidden");if(!panel.classList.contains("acw-hidden"))input.focus();};root.appendChild(fab);document.body.appendChild(root);}
function rate(m,id){const r=document.createElement("div");r.className="acw-rate";[[1,"👍"],[-1,"👎"]].forEach(([v,l])=>{const b=document.createElement("button");b.type="button";b.textContent=l;b.setAttribute("aria-label",v>0?"Foydali":"Foydasiz");b.setAttribute("aria-pressed","false");
  b.onclick=async()=>{try{const x=await fetch(BASE+"/public/"+encodeURIComponent(slug)+"/feedback",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({visitorId:vid,messageId:id,rating:v})});if(x.ok)r.querySelectorAll("button").forEach(o=>o.setAttribute("aria-pressed",String(o===b)));}catch{}};r.appendChild(b);});m.appendChild(r);}
function add(text,cls,citations,offers,messageId){if(offers&&offers.length)text=text.split("\\n").filter(l=>!/^• .*https?:\\/\\//.test(l)).join("\\n");const m=document.createElement("div");m.className="acw-msg "+cls;m.textContent=text.replace(/\\s*\\[S\\d+(?:,\\s*S\\d+)*\\]/g,"");
  if(citations&&citations.length){const s=document.createElement("span");s.className="acw-src";s.append("Manba: ");
    citations.forEach((c,i)=>{if(i)s.append(", ");if(c.url&&/^https?:/.test(c.url)){const a=document.createElement("a");a.href=c.url;a.target="_blank";a.rel="noopener";a.textContent=c.title;s.append(a);}else s.append(c.title);});m.appendChild(s);}
  if(offers&&offers.length){const o=document.createElement("div");o.className="acw-offers";
    offers.forEach(x=>{if(!/^https?:/.test(x.url))return;const a=document.createElement("a");a.href=x.url;a.target="_blank";a.rel="noopener";a.textContent=x.title+" — "+Number(x.priceUzs).toLocaleString("ru-RU")+" so'm";o.appendChild(a);});m.appendChild(o);}
  if(messageId&&!(offers&&offers.length))rate(m,messageId);
  log.appendChild(m);log.scrollTop=log.scrollHeight;}
let since=new Date().toISOString(),poll=null;
function startPolling(){if(poll)return;poll=setInterval(async()=>{try{const r=await fetch(BASE+"/public/"+encodeURIComponent(slug)+"/updates?visitorId="+vid+"&after="+encodeURIComponent(since));
  if(!r.ok)return;for(const m of await r.json()){add(m.text,"acw-owner");since=m.at;}}catch{}},5000);}
form.addEventListener("submit",async(e)=>{e.preventDefault();const text=input.value.trim();if(!text)return;input.value="";add(text,"acw-user");btn.disabled=true;
  try{const r=await fetch(BASE+"/public/"+encodeURIComponent(slug)+"/chat",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({visitorId:vid,message:text})});
    const d=await r.json();if(!r.ok)add(d.error||"Xatolik yuz berdi","acw-bot");else if(d.reply)add(d.reply,"acw-bot",d.citations,d.offers,d.messageId);else{add("Xabaringiz egasiga yetkazildi — u shu yerda javob beradi.","acw-bot");}
    if(d.humanMode)startPolling();}
  catch{add("Tarmoq xatosi, qayta urinib ko'ring.","acw-bot");}finally{btn.disabled=false;input.focus();}});
})();`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const REPORT_FORM = `<details><summary>Shikoyat qilish</summary><form id="report"><select name="reason" aria-label="Sabab"><option value="impersonation">Boshqa shaxs nomidan</option><option value="harmful">Zararli maslahat</option><option value="spam">Spam yoki aldov</option><option value="other">Boshqa</option></select><input name="details" maxlength="500" placeholder="Izoh (ixtiyoriy)"><button type="submit">Yuborish</button></form></details>`;

/** Shikoyat: vidjet bilan bir xil tashrifchi ID'si (localStorage) — bitta tashrifchi bitta shikoyat. */
function reportScript(slug: string): string {
  return `(()=>{const f=document.getElementById("report");if(!f)return;f.addEventListener("submit",async(e)=>{e.preventDefault();let vid;try{vid=localStorage.getItem("aiclone:"+${JSON.stringify(slug)});}catch{}
if(!vid){vid=crypto.randomUUID();try{localStorage.setItem("aiclone:"+${JSON.stringify(slug)},vid);}catch{}}
const r=await fetch("/public/"+encodeURIComponent(${JSON.stringify(slug)})+"/report",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({visitorId:vid,reason:f.reason.value,details:f.details.value})}).catch(()=>null);
f.replaceWith(document.createTextNode(r&&r.ok?"Rahmat, shikoyat moderatorga yuborildi.":"Yuborib bo'lmadi, keyinroq urinib ko'ring."));});})();`.replace(/<\//g, "<\\/");
}

/** Ommaviy klon sahifasi — blogerlar Telegram/Instagram bio'siga qo'yadigan havola. */
export interface PageBrand {
  accent: string | null;
  logoUrl: string | null;
  hidePoweredBy: boolean;
}

export function clonePageHtml(slug: string, name: string, bio: string, base: string, opts: { listed?: boolean; brand?: PageBrand } = {}): string {
  const accent = opts.brand?.accent && /^#[0-9a-f]{6}$/i.test(opts.brand.accent) ? opts.brand.accent : null;
  const logo = opts.brand?.logoUrl && /^https:\/\//.test(opts.brand.logoUrl) ? opts.brand.logoUrl : null;
  const powered = opts.brand?.hidePoweredBy ? "" : ` <a href="https://aiclone.uz">O'z kloningizni yarating →</a>`;
  return `<!doctype html>
<html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name)} — AI-klon</title><meta name="description" content="${esc(bio.slice(0, 160))}">
<style>
:root{--ink:#16130f;--bone:#f6f1e7;--muted:#6f675b${accent ? `;--brand:${accent}` : ""}}
*{box-sizing:border-box}body{margin:0;background:var(--bone);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
header img{width:56px;height:56px;border-radius:14px;object-fit:cover;margin-bottom:12px}
main{max-width:720px;margin:0 auto;padding:32px 16px;display:flex;flex-direction:column;gap:20px;min-height:100vh}
h1{font:700 clamp(28px,6vw,44px)/1.05 Georgia,"Times New Roman",serif;margin:0}
p{margin:0;color:var(--muted)}
#chat{flex:1;min-height:420px;display:flex}
#chat>.acw-root{flex:1;display:flex;min-width:0}#chat .acw-panel{flex:1}
footer{font-size:13px;color:var(--muted)}footer a{color:inherit}
.back{font-size:14px;color:var(--muted)}
details{font-size:13px;color:var(--muted)}details form{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}details select,details input,details button{font:inherit;padding:6px 8px;border:1px solid #d9d0bf;border-radius:8px;background:#fff;color:var(--ink)}details input{flex:1;min-width:0}
</style></head>
<body><main>
${opts.listed ? `<a class="back" href="/explore">← Katalog</a>` : ""}
<header>${logo ? `<img src="${esc(logo)}" alt="">` : ""}<h1>${esc(name)}</h1><p>${esc(bio)}</p></header>
<div id="chat"></div>
<footer>🤖 Bu ${esc(name)}ning AI-kloni: javoblar uning materiallari asosida AI tomonidan yaratiladi.${powered}</footer>
${opts.listed ? REPORT_FORM : ""}
</main>
<script src="${esc(base)}/widget.js" data-clone="${esc(slug)}" data-mount="#chat" data-title="${esc(name)} bilan suhbat"></script>
${opts.listed ? `<script>${reportScript(slug)}</script>` : ""}
</body></html>`;
}

/** Obunachi to'lov sahifasi (bir nechta to'lov tizimi sozlanganda tanlash uchun). */
export function payPageHtml(info: { title: string; priceUzs: number; cloneName: string; providers: string[] } | null, token: string): string {
  const body = info
    ? `<h1>${esc(info.cloneName)}</h1><p>${esc(info.title)}</p><p class="price">${info.priceUzs.toLocaleString("ru-RU").replace(/,/g, " ")} so'm</p>
       ${info.providers.map((p) => `<a class="btn" href="/pay/${esc(token)}/${esc(p)}">${p === "payme" ? "Payme" : "Click"} orqali to'lash</a>`).join("")}
       <p class="note">To'lovdan keyin chatga qayting — klon savollaringizga javob berishda davom etadi.</p>`
    : `<h1>Havola eskirgan</h1><p>To'lov havolasi noto'g'ri yoki muddati o'tgan. Chatdan yangi havola so'rang.</p>`;
  return `<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>To'lov — AI Clone</title>
<style>body{margin:0;background:#f6f1e7;color:#16130f;font:16px/1.5 system-ui,sans-serif}main{max-width:420px;margin:12vh auto;padding:0 16px;display:flex;flex-direction:column;gap:12px}
h1{font:700 30px Georgia,serif;margin:0}.price{font:700 26px Georgia,serif;margin:0}.btn{display:block;text-align:center;padding:12px;border-radius:10px;background:#16130f;color:#f6f1e7;text-decoration:none}.note{color:#6f675b;font-size:14px}</style>
</head><body><main>${body}</main></body></html>`;
}
