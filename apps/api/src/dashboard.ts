// Klon egasining dashboardi (/app). Build bosqichisiz bitta sahifa: /v1 API'ni API kalit bilan chaqiradi.
// Barcha dinamik matn textContent orqali qo'yiladi (XSS'dan himoya).

export function dashboardHtml(): string {
  return `<!doctype html>
<html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI Clone — boshqaruv</title>
<style>
:root{--ink:#16130f;--bone:#f6f1e7;--paper:#fffdf8;--line:#ddd4c3;--muted:#6f675b;--accent:#b4441c;--ok:#2f6b3a;--warn:#a26a00}
*{box-sizing:border-box}
body{margin:0;background:var(--bone);color:var(--ink);font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
h1,h2,h3{font-family:Georgia,"Times New Roman",serif;margin:0 0 12px}h2{font-size:22px}h3{font-size:17px}
button,input,select,textarea{font:inherit;color:inherit}
button{border:1px solid var(--ink);background:var(--ink);color:var(--bone);border-radius:9px;padding:8px 14px;cursor:pointer}
button.ghost{background:transparent;color:var(--ink);border-color:var(--line)}
button.small{padding:4px 10px;font-size:13px}
button:disabled{opacity:.5;cursor:default}
input,select,textarea{width:100%;border:1px solid var(--line);border-radius:9px;padding:9px 11px;background:var(--paper)}
textarea{min-height:110px;resize:vertical}
label{display:block;font-size:13px;color:var(--muted);margin:10px 0 4px}
.wrap{max-width:1180px;margin:0 auto;padding:0 16px}
header{border-bottom:1px solid var(--line);background:var(--paper)}
header .wrap{display:flex;align-items:center;gap:12px;min-height:60px;flex-wrap:wrap;padding-top:8px;padding-bottom:8px}
.logo{font:700 20px Georgia,serif;margin-right:auto}
header select{width:auto;max-width:220px}
nav{display:flex;gap:4px;overflow-x:auto;border-bottom:1px solid var(--line);margin-bottom:20px}
nav button{background:none;border:0;border-bottom:2px solid transparent;border-radius:0;color:var(--muted);padding:12px 12px;white-space:nowrap}
nav button.on{color:var(--ink);border-bottom-color:var(--accent)}
main{padding:20px 0 60px}
.card{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
.stats{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}
.stat b{display:block;font:700 30px Georgia,serif}.stat span{color:var(--muted);font-size:13px}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.muted{color:var(--muted)}.small{font-size:13px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:13px;color:var(--muted);font-weight:500}
.tablewrap{overflow-x:auto}
.inbox{display:grid;grid-template-columns:320px 1fr;gap:16px;min-height:520px}.inbox>*{min-width:0}
.convs{display:flex;flex-direction:column;gap:6px;max-height:70vh;overflow-y:auto}
.conv{text-align:left;background:var(--paper);color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.conv.on{border-color:var(--ink)}.conv .t{display:flex;justify-content:space-between;gap:8px;font-weight:600}
.conv p{margin:4px 0 0;color:var(--muted);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.badge{display:inline-block;font-size:12px;padding:1px 8px;border-radius:99px;border:1px solid var(--line);color:var(--muted);font-weight:500}
.badge.alert{border-color:var(--accent);color:var(--accent)}.badge.human{border-color:var(--warn);color:var(--warn)}
.thread{display:flex;flex-direction:column;min-width:0}
.msgs{flex:1;display:flex;flex-direction:column;gap:10px;max-height:60vh;overflow-y:auto;padding:4px 2px 12px}
.msg{max-width:80%;padding:9px 12px;border-radius:12px;white-space:pre-wrap;word-wrap:break-word}
.msg.user{align-self:flex-end;background:var(--ink);color:var(--bone)}
.msg.assistant{align-self:flex-start;background:var(--paper);border:1px solid var(--line)}
.msg.owner{align-self:flex-start;background:var(--paper);border:1px solid var(--warn)}
.msg .meta{display:block;margin-top:6px;font-size:12px;color:var(--muted)}
.msg .acts{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
.empty{color:var(--muted);text-align:center;padding:40px 10px}
pre.code{background:var(--ink);color:var(--bone);padding:12px;border-radius:10px;overflow-x:auto;white-space:pre-wrap;word-break:break-all;font-size:13px}
#toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:var(--ink);color:var(--bone);padding:10px 16px;border-radius:10px;opacity:0;transition:opacity .2s;pointer-events:none;max-width:calc(100vw - 32px)}
#toast.show{opacity:1}#toast.err{background:var(--accent)}
.login{max-width:420px;margin:12vh auto;padding:0 16px}
@media (max-width:760px){.inbox{grid-template-columns:1fr}.convs{max-height:none}.msg{max-width:92%}}
</style></head>
<body>
<div id="app"></div><div id="toast" role="status"></div>
<script>
(()=>{
const $=(s,r=document)=>r.querySelector(s);
const KEY="aiclone:apikey",CLONE="aiclone:clone";
const store={get:(k)=>{try{return localStorage.getItem(k)}catch{return null}},set:(k,v)=>{try{v==null?localStorage.removeItem(k):localStorage.setItem(k,v)}catch{}}};
let apiKey=store.get(KEY),clones=[],clone=null,tab="inbox",timer=null;

function h(tag,attrs,...kids){const el=document.createElement(tag);for(const [k,v] of Object.entries(attrs||{})){if(v==null||v===false)continue;
  if(k.startsWith("on"))el.addEventListener(k.slice(2),v);else if(k==="class")el.className=v;else if(k==="value")el.value=v;else el.setAttribute(k,v===true?"":v);}
  for(const c of kids.flat()){if(c==null||c===false)continue;el.append(c instanceof Node?c:String(c));}return el;}
function toast(msg,err){const t=$("#toast");t.textContent=msg;t.className="show"+(err?" err":"");clearTimeout(toast.t);toast.t=setTimeout(()=>t.className="",2800);}
async function api(path,opts={}){const res=await fetch(path,{...opts,headers:{"authorization":"Bearer "+apiKey,...(opts.body&&!(opts.body instanceof FormData)?{"content-type":"application/json"}:{}),...opts.headers}});
  if(res.status===401){logout();throw new Error("Kirish kerak");}
  const ct=res.headers.get("content-type")||"";const data=ct.includes("json")?await res.json():await res.text();
  if(!res.ok)throw new Error((data&&data.error)||("Xato "+res.status));return data;}
const post=(p,b)=>api(p,{method:"POST",body:JSON.stringify(b)});
const patch=(p,b)=>api(p,{method:"PATCH",body:JSON.stringify(b)});
function fmt(d){const x=new Date(d);return x.toLocaleString("uz-UZ",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});}
function guard(fn){return async(e)=>{e&&e.preventDefault&&e.preventDefault();const b=e&&e.submitter||e&&e.currentTarget;if(b&&b.tagName==="BUTTON")b.disabled=true;
  try{await fn(e);}catch(err){toast(err.message,true);}finally{if(b&&b.tagName==="BUTTON")b.disabled=false;}};}
function logout(){store.set(KEY,null);apiKey=null;render();}

function renderLogin(){const input=h("input",{type:"password",placeholder:"ac_…",autocomplete:"off","aria-label":"API kalit"});
  return h("div",{class:"login"},h("h1",{},"AI Clone"),h("p",{class:"muted"},"Klon egasi paneli. Tenant API kalitingiz bilan kiring."),
    h("form",{class:"card",onsubmit:guard(async()=>{apiKey=input.value.trim();await api("/v1/clones");store.set(KEY,apiKey);await boot();})},
      h("label",{},"API kalit"),input,h("div",{style:"margin-top:14px"},h("button",{type:"submit"},"Kirish"))));}

function cloneForm(){const f={slug:h("input",{placeholder:"dilnoza",required:true}),name:h("input",{placeholder:"Dilnoza",required:true}),bio:h("textarea",{placeholder:"Kim siz, nima bilan shug'ullanasiz"})};
  return h("form",{class:"card",onsubmit:guard(async()=>{const c=await post("/v1/clones",{slug:f.slug.value.trim(),name:f.name.value.trim(),bio:f.bio.value.trim()});
      clones.push(c);selectClone(c.id);toast("Klon yaratildi");})},
    h("h3",{},"Yangi klon"),h("label",{},"Manzil (slug) — aiclone.uz/c/…"),f.slug,h("label",{},"Ism"),f.name,h("label",{},"Bio"),f.bio,
    h("div",{style:"margin-top:14px"},h("button",{type:"submit"},"Yaratish")));}

function selectClone(id){clone=clones.find(c=>c.id===id)||clones[0]||null;store.set(CLONE,clone&&clone.id);render();}

const TABS=[["inbox","Inbox"],["knowledge","Bilim"],["style","Uslub"],["leads","Lidlar"],["stats","Statistika"],["connect","Ulash"],["voice","Ovoz"],["earn","Daromad"],["billing","Tarif"],["settings","Sozlamalar"]];
function render(){clearInterval(timer);const app=$("#app");app.replaceChildren();
  if(!apiKey){app.append(renderLogin());return;}
  const sel=h("select",{"aria-label":"Klon",onchange:(e)=>e.target.value==="__new"?(clone=null,render()):selectClone(e.target.value)},
    clones.map(c=>h("option",{value:c.id,selected:clone&&c.id===clone.id},c.persona.name+" · "+c.slug)),h("option",{value:"__new",selected:!clone},"+ Yangi klon"));
  app.append(h("header",{},h("div",{class:"wrap"},h("span",{class:"logo"},"AI Clone"),sel,h("button",{class:"ghost small",onclick:logout},"Chiqish"))));
  const main=h("main",{class:"wrap"});app.append(main);
  if(!clone){main.append(h("div",{style:"max-width:520px"},cloneForm()));return;}
  main.append(h("nav",{},TABS.map(([id,label])=>h("button",{class:tab===id?"on":"",onclick:()=>{tab=id;render();}},label))));
  const view=h("div");main.append(view);
  ({inbox:viewInbox,knowledge:viewKnowledge,style:viewStyle,leads:viewLeads,stats:viewStats,connect:viewConnect,voice:viewVoice,earn:viewEarn,billing:viewBilling,settings:viewSettings})[tab](view).catch(e=>toast(e.message,true));}

// --- Inbox ---
let openConv=null,onlyAlerts=false;
async function viewInbox(view){const list=h("div",{class:"convs"}),thread=h("div",{class:"thread card"});
  const filter=h("label",{class:"row small",style:"margin:0 0 10px;color:var(--ink)"},h("input",{type:"checkbox",style:"width:auto",checked:onlyAlerts,onchange:(e)=>{onlyAlerts=e.target.checked;loadList();}}),"Faqat e'tibor talab qiladiganlar");
  view.append(h("div",{class:"inbox"},h("div",{},filter,list),thread));
  async function loadList(){const rows=await api("/v1/clones/"+clone.id+"/conversations"+(onlyAlerts?"?filter=escalated":""));list.replaceChildren();
    if(!rows.length){list.append(h("div",{class:"empty"},"Hali suhbatlar yo'q. Klonni ulang va sinab ko'ring (Ulash bo'limi)."));return;}
    for(const c of rows)list.append(h("button",{class:"conv"+(openConv===c.id?" on":""),onclick:()=>{openConv=c.id;loadList();loadThread();}},
      h("div",{class:"t"},h("span",{},c.name||c.phone||"Mehmon"),h("span",{class:"row"},c.needs_attention&&h("span",{class:"badge alert"},"e'tibor"),c.mode!=="bot"&&h("span",{class:"badge human"},"siz"),h("span",{class:"badge"},c.channel))),
      h("p",{},(c.last_message||"").replace(/\\s*\\[S\\d+(?:,\\s*S\\d+)*\\]/g,"")),h("p",{},fmt(c.last_msg_at))));}
  async function loadThread(){if(!openConv){thread.replaceChildren(h("div",{class:"empty"},"Suhbatni tanlang"));return;}
    const [msgs,convs]=await Promise.all([api("/v1/conversations/"+openConv+"/messages"),api("/v1/clones/"+clone.id+"/conversations")]);
    const conv=convs.find(c=>c.id===openConv)||{mode:"bot"};const box=h("div",{class:"msgs"});
    for(const m of msgs)box.append(message(m));
    const human=conv.mode!=="bot";
    const modeBtn=h("button",{class:human?"":"ghost",onclick:guard(async()=>{await post("/v1/conversations/"+openConv+"/mode",{mode:human?"bot":"human"});toast(human?"Suhbat klonga qaytarildi":"Suhbat sizda — klon jim turadi");loadThread();loadList();})},human?"Klonga qaytarish":"Qo'lga olish");
    const text=h("textarea",{placeholder:human?"Javobingiz…":"Javob yozsangiz, suhbat avtomatik sizga o'tadi",style:"min-height:70px"});
    const form=h("form",{onsubmit:guard(async()=>{const v=text.value.trim();if(!v)return;if(!human)await post("/v1/conversations/"+openConv+"/mode",{mode:"human"});
      const r=await post("/v1/conversations/"+openConv+"/reply",{text:v});text.value="";toast(r.delivered||r.channel==="web"?"Yuborildi":"Saqlandi (kanalga yetkazish sozlanmagan)");loadThread();loadList();})},
      text,h("div",{class:"row",style:"margin-top:8px;justify-content:flex-end"},h("button",{type:"submit"},"Yuborish")));
    thread.replaceChildren(h("div",{class:"row",style:"justify-content:space-between;margin-bottom:10px"},h("h3",{style:"margin:0"},conv.name||conv.phone||"Mehmon"),modeBtn),box,form);
    box.scrollTop=box.scrollHeight;}
  function message(m){const el=h("div",{class:"msg "+m.role},m.content);
    if(m.role==="assistant"){const cits=(m.citations||[]).map(c=>c.title).join(", ");
      el.append(h("span",{class:"meta"},[m.answer_source==="unanswerable"?"javob topilmadi":m.model||"",cits&&("· manba: "+cits),Number(m.cost_usd)>0&&("· $"+Number(m.cost_usd).toFixed(4))].filter(Boolean).join(" ")));
      const fix=h("div",{style:"display:none;margin-top:8px"});
      el.append(h("div",{class:"acts"},h("button",{class:"ghost small",onclick:guard(async()=>{await post("/v1/messages/"+m.id+"/feedback",{rating:1});toast("Rahmat 👍");})},"👍"),
        h("button",{class:"ghost small",onclick:()=>{fix.style.display=fix.style.display==="none"?"block":"none";}},"👎 Tuzatish")),fix);
      const ta=h("textarea",{placeholder:"To'g'ri javob — klon keyingi safar shuni ishlatadi",style:"min-height:70px"});
      fix.append(ta,h("div",{class:"row",style:"margin-top:6px"},h("button",{class:"small",onclick:guard(async()=>{const r=await post("/v1/messages/"+m.id+"/feedback",{rating:-1,correction:ta.value.trim()||undefined});
        toast(r.verifiedAnswerCreated?"Tuzatish saqlandi — klon endi shunday javob beradi":"Baho saqlandi");fix.style.display="none";})},"Saqlash")));}
    if(m.role==="owner")el.append(h("span",{class:"meta"},"siz · "+fmt(m.created_at)));
    return el;}
  await loadList();await loadThread();
  timer=setInterval(()=>{loadList().catch(()=>{});if(openConv)loadThread().catch(()=>{});},10000);}

// --- Bilim ---
async function viewKnowledge(view){const table=h("tbody");
  async function load(){const rows=await api("/v1/clones/"+clone.id+"/sources");table.replaceChildren();
    if(!rows.length)table.append(h("tr",{},h("td",{colspan:5,class:"muted"},"Hali bilim yuklanmagan — klon hech narsa bilmaydi.")));
    for(const s of rows)table.append(h("tr",{},h("td",{},s.uri?h("a",{href:s.uri,target:"_blank",rel:"noopener"},s.title):s.title),h("td",{},h("span",{class:"badge"},s.type)),h("td",{},s.chunks),h("td",{class:"small muted"},fmt(s.created_at)),
      h("td",{},h("button",{class:"ghost small",onclick:guard(async()=>{if(!confirm("O'chirilsinmi: "+s.title+"?"))return;await api("/v1/sources/"+s.id,{method:"DELETE"});toast("O'chirildi");load();})},"O'chirish"))));}
  const added=(r)=>{toast(r.duplicate?"Bu manba allaqachon bor":"Qo'shildi: "+(r.chunks??r.posts??0)+" bo'lak");load();};
  const t={title:h("input",{required:true,placeholder:"Kurs narxlari"}),text:h("textarea",{required:true,placeholder:"Matnni shu yerga qo'ying"})};
  const u={url:h("input",{type:"url",required:true,placeholder:"https://…"})};
  const fl={file:h("input",{type:"file",accept:".pdf,.docx,.txt,.md",required:true})};
  const yt={url:h("input",{type:"url",required:true,placeholder:"https://youtu.be/…"})};
  const tg={file:h("input",{type:"file",accept:".json,application/json",required:true}),owners:h("input",{placeholder:"user123456 (ixtiyoriy)"})};
  const ex={q:h("input",{required:true,placeholder:"Kurs qachon boshlanadi?"}),a:h("textarea",{required:true,placeholder:"O'zingizning uslubingizdagi javob",style:"min-height:70px"})};
  view.append(h("div",{class:"grid"},
    h("form",{class:"card",onsubmit:guard(async()=>{added(await post("/v1/clones/"+clone.id+"/sources",{title:t.title.value,text:t.text.value}));t.title.value="";t.text.value="";})},h("h3",{},"Matn"),h("label",{},"Sarlavha"),t.title,h("label",{},"Matn"),t.text,h("div",{style:"margin-top:12px"},h("button",{type:"submit"},"Qo'shish"))),
    h("div",{style:"display:flex;flex-direction:column;gap:16px"},
      h("form",{class:"card",onsubmit:guard(async()=>{const fd=new FormData();fd.append("file",fl.file.files[0]);const r=await api("/v1/clones/"+clone.id+"/sources/file",{method:"POST",body:fd});fl.file.value="";
          toast(r.duplicate?"Bu fayl allaqachon bor":"Qo'shildi: "+r.chunks+" bo'lak");load();})},h("h3",{},"Fayl"),h("p",{class:"small muted"},"PDF, DOCX, TXT yoki MD — 20 MB gacha. PDF'da iqtibos sahifa raqami bilan."),fl.file,h("div",{style:"margin-top:12px"},h("button",{type:"submit"},"Yuklash"))),
      h("form",{class:"card",onsubmit:guard(async()=>{toast("Video transkripti olinmoqda…");const r=await post("/v1/clones/"+clone.id+"/sources/youtube",{url:yt.url.value});yt.url.value="";
          toast(r.duplicate?"Bu video allaqachon bor":"Qo'shildi: "+r.chunks+" bo'lak ("+(r.method==="captions"?"subtitrlardan":"audio orqali")+")");load();})},h("h3",{},"YouTube video"),h("p",{class:"small muted"},"Subtitrlardan olinadi; iqtibos videoning aniq daqiqasiga olib boradi."),yt.url,h("div",{style:"margin-top:12px"},h("button",{type:"submit"},"Yuklash"))),
      h("form",{class:"card",onsubmit:guard(async()=>{added(await post("/v1/clones/"+clone.id+"/sources/url",{url:u.url.value}));u.url.value="";})},h("h3",{},"Sayt sahifasi"),h("label",{},"Havola"),u.url,h("div",{style:"margin-top:12px"},h("button",{type:"submit"},"Yuklash"))),
      h("form",{class:"card",onsubmit:guard(async()=>{const json=JSON.parse(await tg.file.files[0].text());const ownerIds=tg.owners.value.split(",").map(s=>s.trim()).filter(Boolean);
          const r=await post("/v1/clones/"+clone.id+"/sources/telegram",{export:json,ownerIds});toast(r.posts+" post, "+r.exemplars+" namuna qo'shildi");load();})},
        h("h3",{},"Telegram eksporti"),h("p",{class:"small muted"},"Telegram Desktop → kanal → Eksport → JSON (result.json)."),h("label",{},"result.json"),tg.file,h("label",{},"Egasining from_id'lari (guruh javoblari uchun)"),tg.owners,h("div",{style:"margin-top:12px"},h("button",{type:"submit"},"Import")))),
    h("form",{class:"card",onsubmit:guard(async()=>{await post("/v1/clones/"+clone.id+"/exemplars",{question:ex.q.value,answer:ex.a.value});ex.q.value="";ex.a.value="";toast("Uslub namunasi qo'shildi");})},
      h("h3",{},"Uslub namunasi"),h("p",{class:"small muted"},"Siz qanday javob berishingizga misol — klon ohangingizni o'rganadi."),h("label",{},"Savol"),ex.q,h("label",{},"Sizning javobingiz"),ex.a,h("div",{style:"margin-top:12px"},h("button",{type:"submit"},"Qo'shish")))),
    h("div",{class:"card",style:"margin-top:16px"},h("h3",{},"Manbalar"),h("div",{class:"tablewrap"},h("table",{},h("thead",{},h("tr",{},["Sarlavha","Turi","Bo'laklar","Qo'shilgan",""].map(x=>h("th",{},x)))),table))));
  await load();}

// --- Uslub ---
async function viewStyle(view){const s=clone.persona.style;
  const f={tone:h("input",{value:s.tone}),address:h("select",{},[["siz","siz — hurmat bilan"],["sen","sen — do'stona"]].map(([v,l])=>h("option",{value:v,selected:s.address===v},l))),
    emoji:h("select",{},[["none","ishlatmaydi"],["rare","kam"],["often","ko'p"]].map(([v,l])=>h("option",{value:v,selected:s.emoji===v},l))),
    length:h("select",{},[["short","qisqa (1–3 gap)"],["medium","o'rta"],["long","batafsil"]].map(([v,l])=>h("option",{value:v,selected:s.length===v},l))),
    phrases:h("input",{value:(s.signaturePhrases||[]).join(", "),placeholder:"Siz uddalaysiz!, Keling, boshladik"}),
    avoid:h("input",{value:(s.avoidTopics||[]).join(", "),placeholder:"siyosat, din"}),cta:h("input",{value:s.callToAction||"",placeholder:"kursga yozilish: t.me/…"})};
  const list=(v)=>v.split(",").map(x=>x.trim()).filter(Boolean);
  view.append(h("form",{class:"card",style:"max-width:640px",onsubmit:guard(async()=>{const c=await patch("/v1/clones/"+clone.id+"/style",{tone:f.tone.value,address:f.address.value,emoji:f.emoji.value,length:f.length.value,signaturePhrases:list(f.phrases.value),avoidTopics:list(f.avoid.value),callToAction:f.cta.value});
      Object.assign(clone,c);toast("Uslub saqlandi");})},
    h("h3",{},"Klon qanday gapiradi"),h("label",{},"Ohang"),f.tone,h("div",{class:"grid",style:"gap:12px"},h("div",{},h("label",{},"Murojaat"),f.address),h("div",{},h("label",{},"Emoji"),f.emoji),h("div",{},h("label",{},"Javob uzunligi"),f.length)),
    h("label",{},"Sevimli iboralar (vergul bilan)"),f.phrases,h("label",{},"Gapirmaydigan mavzular"),f.avoid,h("label",{},"Taklif (CTA)"),f.cta,h("div",{style:"margin-top:14px"},h("button",{type:"submit"},"Saqlash"))));}

// --- Lidlar ---
async function viewLeads(view){const rows=await api("/v1/clones/"+clone.id+"/leads");
  const dl=h("button",{class:"ghost",onclick:guard(async()=>{const csv=await api("/v1/clones/"+clone.id+"/leads?format=csv");const a=h("a",{href:URL.createObjectURL(new Blob([csv],{type:"text/csv"})),download:"leads-"+clone.slug+".csv"});a.click();URL.revokeObjectURL(a.href);})},"CSV yuklab olish");
  view.append(h("div",{class:"card"},h("div",{class:"row",style:"justify-content:space-between"},h("h3",{style:"margin:0"},"Lidlar ("+rows.length+")"),dl),
    rows.length?h("div",{class:"tablewrap",style:"margin-top:12px"},h("table",{},h("thead",{},h("tr",{},["Ism","Telefon","Kanal","Xabar","Sana"].map(x=>h("th",{},x)))),
      h("tbody",{},rows.map(l=>h("tr",{},h("td",{},l.name||"—"),h("td",{},l.phone?h("a",{href:"tel:"+l.phone},l.phone):"—"),h("td",{},h("span",{class:"badge"},l.channel)),h("td",{class:"small"},l.note||""),h("td",{class:"small muted"},fmt(l.created_at)))))))
    :h("div",{class:"empty"},"Hali lid yo'q. Klon telefon raqami yoki sotib olish niyatini sezganda shu yerda paydo bo'ladi.")));}

// --- Statistika ---
async function viewStats(view){const s=await api("/v1/clones/"+clone.id+"/stats");
  const answered=s.answers?Math.round(100*(s.answers-s.unanswered)/s.answers):0;
  const cards=[["Suhbatlar",s.conversations],["Klon javoblari",s.answers],["Javob topilgan",answered+"%"],["Lidlar",s.leads],["O'rtacha baho",s.avg_rating?(s.avg_rating>0?"+":"")+s.avg_rating.toFixed(2):"—"],["AI xarajati","$"+Number(s.cost_usd).toFixed(3)]];
  view.append(h("div",{class:"stats"},cards.map(([l,v])=>h("div",{class:"card stat"},h("b",{},v),h("span",{},l)))),
    h("p",{class:"muted small",style:"margin-top:14px"},"Javob topilmagan savollar — bilim bazasidagi bo'shliqlar. Ularni Inbox'da \\"e'tibor\\" filtri bilan ko'ring va Bilim bo'limiga qo'shing."));}

// --- Ulash ---
async function viewConnect(view){const tgCard=h("div",{class:"card"}),igCard=h("div",{class:"card"}),waCard=h("div",{class:"card"}),base=location.origin,page=base+"/c/"+clone.slug,snippet='<script src="'+base+'/widget.js" data-clone="'+clone.slug+'" async><\\/script>';
  const copy=(text)=>guard(async()=>{await navigator.clipboard.writeText(text);toast("Nusxalandi");});
  view.append(h("div",{class:"grid"},
    h("div",{class:"card"},h("h3",{},"Ommaviy sahifa"),h("p",{class:"small muted"},"Telegram/Instagram bio'ga qo'ying."),h("pre",{class:"code"},page),h("div",{class:"row"},h("button",{class:"small",onclick:copy(page)},"Nusxalash"),h("a",{href:page,target:"_blank",rel:"noopener"},"Ochish →"))),
    h("div",{class:"card"},h("h3",{},"Sayt vidjeti"),h("p",{class:"small muted"},"Saytingiz </body> tegidan oldin qo'ying."),h("pre",{class:"code"},snippet),h("button",{class:"small",onclick:copy(snippet)},"Nusxalash")),
    tgCard,igCard,waCard));
  async function loadTg(){const st=await api("/v1/clones/"+clone.id+"/telegram");tgCard.replaceChildren(h("h3",{},"Telegram bot"));
    if(!st.available){tgCard.append(h("p",{class:"small muted"},"Serverda ko'p klonli Telegram yoqilmagan (CHANNEL_SECRET_KEY, PUBLIC_BASE_URL). Muqobil: TELEGRAM_BOT_TOKEN va CLONE_SLUG="+clone.slug+" bilan alohida bot jarayoni."));return;}
    if(st.connected){tgCard.append(h("p",{},"Ulangan: ",h("a",{href:"https://t.me/"+st.botUsername,target:"_blank",rel:"noopener"},"@"+st.botUsername)),
      h("p",{class:"small muted"},"Eskalatsiya xabarlari uchun Sozlamalar'da Telegram chat ID'ingizni kiriting."),
      h("button",{class:"ghost small",onclick:guard(async()=>{if(!confirm("Bot uzilsinmi? Foydalanuvchilar javob olmay qoladi."))return;await api("/v1/clones/"+clone.id+"/telegram",{method:"DELETE"});toast("Bot uzildi");loadTg();})},"Uzish"));return;}
    const tok=h("input",{type:"password",placeholder:"123456789:AA…",autocomplete:"off"});
    tgCard.append(h("p",{class:"small muted"},"@BotFather → /newbot → tokenni shu yerga qo'ying. Token shifrlangan holda saqlanadi."),
      h("form",{onsubmit:guard(async()=>{const r=await post("/v1/clones/"+clone.id+"/telegram",{token:tok.value.trim()});toast("@"+r.botUsername+" ulandi");loadTg();})},tok,h("div",{style:"margin-top:10px"},h("button",{type:"submit"},"Ulash"))));}
  async function loadMeta(){const st=await api("/v1/clones/"+clone.id+"/channels");
    const render=(card,kind,title,hint,fields)=>{card.replaceChildren(h("h3",{},title));
      if(!st.available){card.append(h("p",{class:"small muted"},"Serverda Meta kanallari yoqilmagan (CHANNEL_SECRET_KEY, META_APP_SECRET)."));return;}
      const ch=st.channels.find(x=>x.kind===kind);
      if(ch){card.append(h("p",{},"Ulangan: "+ch.label),h("button",{class:"ghost small",onclick:guard(async()=>{if(!confirm(title+" uzilsinmi?"))return;await api("/v1/clones/"+clone.id+"/channels/"+kind,{method:"DELETE"});toast("Uzildi");loadMeta();})},"Uzish"));return;}
      const inputs=fields.map(([key,ph])=>[key,h("input",{type:key==="accessToken"?"password":"text",placeholder:ph,autocomplete:"off",required:true})]);
      card.append(h("p",{class:"small muted"},hint),h("form",{onsubmit:guard(async()=>{const b=Object.fromEntries(inputs.map(([k,el])=>[k,el.value.trim()]));const r=await post("/v1/clones/"+clone.id+"/channels/"+kind,b);toast(r.label+" ulandi");loadMeta();})},
        inputs.map(([,el])=>h("div",{style:"margin-bottom:8px"},el)),h("button",{type:"submit"},"Ulash")));};
    render(igCard,"instagram","Instagram DM","Instagram professional akkaunt, Instagram Login tokeni (instagram_business_manage_messages ruxsati bilan).",[["accessToken","Instagram access token"]]);
    render(waCard,"whatsapp","WhatsApp","WhatsApp Cloud API: Meta Business'dagi phone_number_id va doimiy (system user) token.",[["phoneNumberId","phone_number_id"],["accessToken","Access token"]]);}
  await Promise.all([loadTg(),loadMeta()]);}

// --- Ovoz kloni ---
/** Mikrofondan yozib olish (MediaRecorder) yoki fayl tanlash — natija Blob. */
function recorder(label){let blob=null,rec=null,chunks=[];const status=h("span",{class:"small muted"},"yozilmagan");
  const file=h("input",{type:"file",accept:"audio/*",onchange:()=>{blob=file.files[0]||null;status.textContent=blob?"fayl: "+blob.name:"yozilmagan";}});
  const btn=h("button",{type:"button",class:"ghost small",onclick:guard(async()=>{
    if(rec){rec.stop();return;}
    if(!navigator.mediaDevices){toast("Brauzer mikrofonni qo'llamaydi — fayl tanlang",true);return;}
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});chunks=[];rec=new MediaRecorder(stream);
    rec.ondataavailable=(e)=>chunks.push(e.data);
    rec.onstop=()=>{blob=new Blob(chunks,{type:rec.mimeType||"audio/webm"});stream.getTracks().forEach(t=>t.stop());rec=null;btn.textContent="🎙 Qayta yozish";status.textContent="yozildi ("+Math.round(blob.size/1024)+" KB)";};
    rec.start();btn.textContent="⏹ To'xtatish";status.textContent="yozilmoqda…";})},"🎙 Yozish");
  return {el:h("div",{style:"margin:6px 0 12px"},h("label",{},label),h("div",{class:"row"},btn,status),h("div",{style:"margin-top:6px"},file)),get:()=>blob};}

async function viewVoice(view){let st;try{st=await api("/v1/clones/"+clone.id+"/voice");}catch(e){view.append(h("div",{class:"card"},e.message));return;}
  const quota=h("p",{class:"small muted"},"Ovoz daqiqalari: "+st.minutesUsed+" / "+st.minutesIncluded+" (shu oy)"+(st.minutesIncluded===0?" — ovozli javoblar Pro va Business tariflarida":""));
  if(!st.available){view.append(h("div",{class:"card"},h("h3",{},"Ovoz kloni"),h("p",{class:"muted"},"Serverda ovoz provayderi sozlanmagan.")));return;}
  if(!st.enrolled){const intro=h("div",{class:"card",style:"max-width:720px"},h("h3",{},"Klonga sizning ovozingiz"),
      h("p",{class:"muted"},"Klon javoblarini sizning ovozingizda o'qiydi. Buning uchun roziligingiz yozib olinadi va istalgan vaqtda qaytarib olishingiz mumkin. Faqat o'z ovozingizni klonlang."),
      h("button",{onclick:guard(async()=>{const c=await post("/v1/clones/"+clone.id+"/voice/consent",{});step2(c);})},"1. Rozilik matnini olish"));
    view.append(intro);
    function step2(c){const consentRec=recorder("2. Quyidagi matnni ovoz chiqarib o'qing va yozib oling:");const s1=recorder("3. Ovoz namunasi — 1–2 daqiqa tabiiy gapiring (masalan, kanalingiz haqida):");
      const s2=recorder("Qo'shimcha namuna (ixtiyoriy):");
      intro.replaceChildren(h("h3",{},"Ovozni yozib olish"),h("pre",{class:"code",style:"white-space:pre-wrap;font-size:15px"},c.script),
        h("p",{class:"small muted"},"Matn "+new Date(c.expiresAt).toLocaleTimeString("uz-UZ")+" gacha amal qiladi."),consentRec.el,s1.el,s2.el,
        h("button",{onclick:guard(async()=>{const consent=consentRec.get(),samples=[s1.get(),s2.get()].filter(Boolean);
          if(!consent||!samples.length){toast("Rozilik yozuvi va kamida bitta namuna kerak",true);return;}
          const fd=new FormData();fd.append("consentId",c.consentId);fd.append("consent",consent,"rozilik.webm");samples.forEach((b,i)=>fd.append("samples",b,"namuna-"+(i+1)+".webm"));
          await api("/v1/clones/"+clone.id+"/voice",{method:"POST",body:fd});toast("Ovoz yaratildi ✅");render();})},"4. Ovozni yaratish"));}
    view.append(quota);return;}
  const mode=h("select",{"aria-label":"Ovoz rejimi"},[["off","O'chiq — faqat matn"],["voice_in","Foydalanuvchi ovozli yozsa, ovozda javob"],["always","Har doim ovozda ham javob"]].map(([v,l])=>h("option",{value:v,selected:st.mode===v},l)));
  const text=h("input",{value:"Assalomu alaykum! Bu mening AI-klonim.",maxlength:"300"});const player=h("audio",{controls:true,style:"width:100%;margin-top:8px;display:none"});
  view.append(h("div",{class:"grid"},
    h("div",{class:"card"},h("h3",{},"Ovoz rejimi"),h("p",{class:"small muted"},"Ovoz yaratilgan: "+fmt(st.enrolledAt)+" · "+st.provider),mode,
      h("div",{style:"margin-top:10px"},h("button",{onclick:guard(async()=>{await patch("/v1/clones/"+clone.id+"/voice",{mode:mode.value});toast("Saqlandi");})},"Saqlash")),quota),
    h("div",{class:"card"},h("h3",{},"Eshitib ko'rish"),text,h("div",{style:"margin-top:10px"},h("button",{class:"ghost",onclick:guard(async()=>{
        const res=await fetch("/v1/clones/"+clone.id+"/voice/preview",{method:"POST",headers:{"authorization":"Bearer "+apiKey,"content-type":"application/json"},body:JSON.stringify({text:text.value})});
        if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error||"Xato");}
        player.src=URL.createObjectURL(await res.blob());player.style.display="block";player.play().catch(()=>{});})},"▶ Tinglash")),player),
    h("div",{class:"card"},h("h3",{},"Rozilikni qaytarib olish"),h("p",{class:"small muted"},"Ovoz provayderdan o'chiriladi, rozilik yozuvi tozalanadi, klon faqat matnda javob beradi."),
      h("button",{class:"ghost",onclick:guard(async()=>{if(!confirm("Ovoz kloni butunlay o'chirilsinmi?"))return;await api("/v1/clones/"+clone.id+"/voice",{method:"DELETE"});toast("Ovoz o'chirildi");render();})},"Ovozni o'chirish"))));}

// --- Daromad (klon monetizatsiyasi) ---
async function viewEarn(view){const m=await api("/v1/clones/"+clone.id+"/monetization");
  if(!m.available){view.append(h("div",{class:"card"},h("h3",{},"Klon orqali daromad"),h("p",{class:"muted"},"Serverda monetizatsiya yoqilmagan (PAYMENT_LINK_SECRET, PUBLIC_BASE_URL).")));return;}
  const e=await api("/v1/earnings");const som=(n)=>Number(n).toLocaleString("ru-RU").replace(/,/g," ")+" so'm";
  const enabled=h("input",{type:"checkbox",style:"width:auto",checked:m.enabled}),free=h("input",{type:"number",min:"0",max:"1000",value:m.freeMessages,style:"width:120px"});
  const f={title:h("input",{required:true,placeholder:"50 ta savol"}),kind:h("select",{},[["pack","Savollar paketi"],["subscription","Obuna (kunlar)"]].map(([v,l])=>h("option",{value:v},l))),
    amount:h("input",{type:"number",min:"1",required:true,placeholder:"50",style:"width:120px"}),price:h("input",{type:"number",min:"1000",step:"1000",required:true,placeholder:"49000",style:"width:160px"})};
  const unit=h("span",{class:"small muted"},"savol");f.kind.onchange=()=>{unit.textContent=f.kind.value==="pack"?"savol":"kun";};
  view.append(h("div",{class:"stats",style:"margin-bottom:16px"},[["Sof daromad",som(e.netUzs)],["Balans (to'lanadigan)",som(e.balanceUzs)],["Yalpi tushum",som(e.grossUzs)],["Platforma komissiyasi ("+Math.round(m.commissionRate*100)+"%)",som(e.commissionUzs)]].map(([l,v])=>h("div",{class:"card stat"},h("b",{style:"font-size:22px"},v),h("span",{},l)))),
    h("div",{class:"grid"},
      h("form",{class:"card",onsubmit:guard(async()=>{await patch("/v1/clones/"+clone.id+"/monetization",{enabled:enabled.checked,freeMessages:Number(free.value)});toast("Saqlandi");})},
        h("h3",{},"Pullik kirish"),h("label",{class:"row",style:"color:var(--ink)"},enabled,"Bepul savollardan keyin to'lov so'rash"),
        h("label",{},"Har bir obunachiga oyiga bepul savollar"),free,!m.providers.length&&h("p",{class:"small",style:"color:var(--accent)"},"To'lov tizimi (Payme/Click) sozlanmagan."),
        h("div",{style:"margin-top:12px"},h("button",{type:"submit"},"Saqlash"))),
      h("form",{class:"card",onsubmit:guard(async()=>{const b={title:f.title.value.trim(),kind:f.kind.value,priceUzs:Number(f.price.value)};b[f.kind.value==="pack"?"messages":"days"]=Number(f.amount.value);
          await post("/v1/clones/"+clone.id+"/products",b);toast("Mahsulot qo'shildi");render();})},
        h("h3",{},"Yangi mahsulot"),h("label",{},"Nomi"),f.title,h("label",{},"Turi"),f.kind,h("label",{},"Hajmi"),h("div",{class:"row"},f.amount,unit),h("label",{},"Narxi (so'm)"),f.price,
        h("div",{style:"margin-top:12px"},h("button",{type:"submit"},"Qo'shish")))),
    h("div",{class:"card",style:"margin-top:16px"},h("h3",{},"Mahsulotlar"),m.products.length?h("div",{class:"tablewrap"},h("table",{},h("thead",{},h("tr",{},["Nomi","Turi","Narxi","Holat",""].map(x=>h("th",{},x)))),
      h("tbody",{},m.products.map(p=>h("tr",{},h("td",{},p.title),h("td",{},p.kind==="pack"?p.messages+" ta savol":p.days+" kun"),h("td",{},som(p.priceUzs)),h("td",{},h("span",{class:"badge"},p.active?"faol":"o'chiq")),
        h("td",{},h("button",{class:"ghost small",onclick:guard(async()=>{await patch("/v1/products/"+p.id,{active:!p.active});render();})},p.active?"O'chirish":"Yoqish"))))))):h("p",{class:"muted"},"Hali mahsulot yo'q.")),
    h("div",{class:"card",style:"margin-top:16px"},h("h3",{},"Obunachilar to'lovlari"),e.recent.length?h("div",{class:"tablewrap"},h("table",{},h("thead",{},h("tr",{},["№","Mahsulot","Xaridor","Summa","Holat","Sana"].map(x=>h("th",{},x)))),
      h("tbody",{},e.recent.map(o=>h("tr",{},h("td",{},o.id),h("td",{},o.product),h("td",{},(o.buyer||"Mehmon")+" · "+(o.channel||"")),h("td",{},som(o.amount_uzs)),h("td",{},h("span",{class:"badge"},STATUS[o.status]||o.status)),h("td",{class:"small muted"},fmt(o.created_at))))))):h("p",{class:"muted"},"Hali to'lov yo'q.")));}

// --- Tarif ---
const PLAN_NAMES={free:"Free",creator:"Creator",pro:"Pro",business:"Business",enterprise:"Enterprise"};
const STATUS={pending:"kutilmoqda",paid:"to'langan",cancelled:"bekor qilingan",refunded:"qaytarilgan"};
const som=(n)=>Number(n).toLocaleString("ru-RU").replace(/,/g," ")+" so'm";
async function viewBilling(view){let b;try{b=await api("/v1/billing");}catch(e){view.append(h("div",{class:"card"},e.message));return;}
  const pct=Math.min(100,Math.round(100*b.usedThisMonth/Math.max(1,b.monthlyMessageLimit)));
  const months=h("select",{"aria-label":"Muddat"},[[1,"1 oy"],[3,"3 oy"],[6,"6 oy"],[12,"12 oy (2 oy bepul)"]].map(([v,l])=>h("option",{value:v},l)));
  const buy=(plan,provider)=>guard(async()=>{const r=await post("/v1/billing/orders",{plan,months:Number(months.value),provider});location.href=r.checkoutUrl;});
  view.append(...[h("div",{class:"card",style:"margin-bottom:16px"},h("h3",{},"Joriy tarif: "+(PLAN_NAMES[b.plan]||b.plan)),
      h("p",{class:"muted"},b.plan==="free"?"Bepul tarif":b.planExpiresAt?"Amal qiladi: "+new Date(b.planExpiresAt).toLocaleDateString("uz-UZ")+" gacha":"Muddatsiz"),
      h("p",{},"Shu oy: "+b.usedThisMonth+" / "+b.monthlyMessageLimit+" xabar ("+pct+"%)"),
      h("div",{style:"height:8px;background:var(--line);border-radius:99px;overflow:hidden"},h("div",{style:"height:100%;width:"+pct+"%;background:"+(pct>85?"var(--accent)":"var(--ink)")}))),
    h("div",{class:"row",style:"margin-bottom:12px"},h("label",{style:"margin:0"},"Muddat:"),h("div",{style:"width:220px"},months)),
    !b.providers.length&&h("p",{class:"card muted"},"To'lov tizimlari hali sozlanmagan (PAYME_* yoki CLICK_* muhit o'zgaruvchilari)."),
    h("div",{class:"grid"},b.plans.map(p=>h("div",{class:"card"},h("h3",{},PLAN_NAMES[p.id]),h("p",{style:"font:700 24px Georgia,serif;margin:0"},som(p.priceUzs)),h("p",{class:"muted small"},"oyiga · "+p.monthlyMessages.toLocaleString("ru-RU")+" xabar"),
      h("div",{class:"row"},b.providers.map(pr=>h("button",{class:pr==="payme"?"":"ghost",onclick:buy(p.id,pr)},pr==="payme"?"Payme":"Click")))))),
    b.orders.length&&h("div",{class:"card",style:"margin-top:16px"},h("h3",{},"To'lovlar tarixi"),h("div",{class:"tablewrap"},h("table",{},h("thead",{},h("tr",{},["№","Tarif","Muddat","Summa","Tizim","Holat","Sana"].map(x=>h("th",{},x)))),
      h("tbody",{},b.orders.map(o=>h("tr",{},h("td",{},o.id),h("td",{},PLAN_NAMES[o.plan]),h("td",{},o.months+" oy"),h("td",{},som(o.amount_uzs)),h("td",{},o.provider),h("td",{},h("span",{class:"badge"},STATUS[o.status]||o.status)),h("td",{class:"small muted"},fmt(o.created_at))))))))].filter(Boolean));}

// --- Sozlamalar ---
async function viewSettings(view){const p=clone.persona;
  const f={name:h("input",{value:p.name,required:true}),bio:h("textarea",{},p.bio),grounded:h("input",{type:"checkbox",style:"width:auto",checked:p.grounded}),chat:h("input",{value:clone.ownerTelegramChatId||"",placeholder:"123456789",inputmode:"numeric"})};
  view.append(h("form",{class:"card",style:"max-width:640px",onsubmit:guard(async()=>{const c=await patch("/v1/clones/"+clone.id,{name:f.name.value.trim(),bio:f.bio.value,grounded:f.grounded.checked,ownerTelegramChatId:f.chat.value.trim()||null});
      Object.assign(clone,c);toast("Saqlandi");render();})},
    h("h3",{},"Klon sozlamalari"),h("label",{},"Ism"),f.name,h("label",{},"Bio"),f.bio,
    h("label",{class:"row",style:"color:var(--ink)"},f.grounded,"Faqat bilim bazasidan javob berish (tavsiya etiladi)"),
    h("label",{},"Egasining Telegram chat ID'si (eskalatsiya xabarlari uchun)"),f.chat,h("p",{class:"small muted"},"ID'ni bilish uchun Telegramda @userinfobot ga yozing."),
    h("div",{style:"margin-top:14px"},h("button",{type:"submit"},"Saqlash"))));}

async function boot(){if(!apiKey)return render();try{clones=await api("/v1/clones");}catch(e){toast(e.message,true);return render();}
  const saved=store.get(CLONE);clone=clones.find(c=>c.id===saved)||clones[0]||null;render();}
boot();
})();
</script></body></html>`;
}
