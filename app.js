import { openDB, getAll, put, del, getMeta, setMeta, exportAll, importAll } from "./db.js";

const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));
const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

const GOALS = [
  "Erhalt",
  "Wachstum",
  "Konditionierung",
  "Farbaufbau",
  "Schonfütterung",
  "Frühjahr/Herbst",
  "Winter",
];

// Prozent‑Faktoren bezogen auf "Normal" (Mittelwert aus Min‑Max)
const GOAL_MULTIPLIERS = {
  "Erhalt": 1.00,
  "Wachstum": 1.25,
  "Konditionierung": 1.15,
  "Farbaufbau": 1.10,
  "Schonfütterung": 0.60,
  "Frühjahr/Herbst": 0.80,
  "Winter": 0.40,
};

function normalizeGoal(g){
  const s = (g||"").trim();
  if(!s) return "Erhalt";
  // Backward‑compat mapping
  if(s === "Konditionsaufbau") return "Konditionierung";
  if(s === "Farbentwicklung") return "Farbaufbau";
  return s;
}

function goalFactor(goal, tempC){
  const g = normalizeGoal(goal);
  const t = Number(tempC);
  // Unter 8°C generell 0 (egal welches Ziel)
  if(Number.isFinite(t) && t < 8) return 0;
  // Winter: nur bei >8°C überhaupt füttern, sonst 0.
  if(g === "Winter" && (!Number.isFinite(t) || t <= 8)) return 0;
  return Number(GOAL_MULTIPLIERS[g] ?? GOAL_MULTIPLIERS["Erhalt"]); 
}

const PRESET_FOODS = [
  // Nutramare (Kodawari Koi Shop)
  {
    id: "nutramare_koibasic",
    name: "Nutramare KoiBasic Swim",
    brand: "Nutramare",
    category: "Basis / Allround",
    protein: 33.0,
    fat: 6.0,
    fiber: 3.0,
    ash: 8.5,
    phosphorus: 1.0,
    temp_min_c: 12,
    temp_max_c: 30,
    tags: ["Erhalt", "Konditionierung"],
    url: "https://www.kodawari-koi.de/product-page/nutramare-koibasic",
    notes: "Solides Basisfutter (ab ca. 12°C). Preis/Leistung, stabile Pellets, gute Verdaulichkeit."
  },
  {
    id: "nutramare_koi360_swim",
    name: "Nutramare Koi360 Swim",
    brand: "Nutramare",
    category: "Allround / Ganzjahr (warm)",
    protein: 38.0,
    fat: 8.0,
    fiber: 2.5,
    ash: 9.5,
    phosphorus: 1.2,
    temp_min_c: 12,
    temp_max_c: 30,
    tags: ["Erhalt", "Konditionierung", "Wachstum"],
    url: "https://www.kodawari-koi.de/product-page/nutramare-koi360-swim",
    notes: "360°-Versorgung, schwimmend, sehr gute Futterkontrolle (ab ca. 12°C)."
  },
  {
    id: "nutramare_koi360_sensitive",
    name: "Nutramare Koi360 Sensitive",
    brand: "Nutramare",
    category: "Schonkost / Übergang",
    protein: 35.0,
    fat: 7.0,
    fiber: 3.2,
    ash: 8.5,
    phosphorus: 1.0,
    temp_min_c: 8,
    temp_max_c: 28,
    tags: ["Schonfütterung", "Frühjahr/Herbst", "Erhalt"],
    url: "https://www.kodawari-koi.de/product-page/nutramare-koi360-sensitive",
    notes: "Für sensible Koi, nach Behandlungen oder in Übergangsphasen – entlastet Verdauung & System."
  },
  {
    id: "nutramare_koi360_tosai",
    name: "Nutramare Koi360 Tosai Swim",
    brand: "Nutramare",
    category: "Aufzucht / Wachstum (Tosai)",
    protein: 45.0,
    fat: 10.0,
    fiber: 1.5,
    ash: 9.5,
    phosphorus: 1.2,
    temp_min_c: 15,
    temp_max_c: 30,
    tags: ["Wachstum"],
    url: "https://www.kodawari-koi.de/product-page/nutramare-koi360-tosai-swim",
    notes: "Sehr proteinreich für Tosai-Aufzucht (ab ca. 15°C) – nur in kleinen Portionen, mehrfach täglich."
  },

  // Takazumi (Kodawari Koi Shop)
  {
    id: "takazumi_friend",
    name: "Takazumi Friend",
    brand: "Takazumi",
    category: "Basis / Alltag",
    protein: 33.0,
    fat: 3.0,
    fiber: 2.6,
    ash: 4.4,
    phosphorus: 0.7,
    temp_min_c: 10,
    temp_max_c: 30,
    tags: ["Erhalt"],
    url: "https://www.kodawari-koi.de/product-page/takazumi-friend-10kg",
    notes: "Alltagsfutter für größere Bestände – gut kombinierbar mit Gold Plus oder Vital."
  },
  {
    id: "takazumi_easy_mix",
    name: "Takazumi Easy Mix (sinkend & schwimmend)",
    brand: "Takazumi",
    category: "Mix / Alltag",
    protein: 33.0,
    fat: 6.0,
    fiber: 4.2,
    ash: 8.3,
    phosphorus: 1.1,
    temp_min_c: 10,
    temp_max_c: 30,
    tags: ["Erhalt", "Frühjahr/Herbst"],
    url: "https://www.kodawari-koi.de/product-page/takazumi-easy-sinkend",
    notes: "Mix aus sinkend & schwimmend – gut bei gemischter Altersstruktur / scheuen Fischen."
  },
  {
    id: "takazumi_mix",
    name: "Takazumi Mix",
    brand: "Takazumi",
    category: "Allround / Saison",
    protein: 40.0,
    fat: 9.5,
    fiber: 2.4,
    ash: 6.5,
    phosphorus: 1.2,
    temp_min_c: 10,
    temp_max_c: 30,
    tags: ["Konditionierung", "Wachstum", "Erhalt"],
    url: "https://www.kodawari-koi.de/product-page/takazumi-mix",
    notes: "Ausgewogener Mix für aktive Saison (ab ca. 10°C)."
  },
  {
    id: "takazumi_gold_plus",
    name: "Takazumi Gold Plus",
    brand: "Takazumi",
    category: "Farbe / Ganzjahr (kühl möglich)",
    protein: 35.0,
    fat: 7.0,
    fiber: 2.5,
    ash: 9.0,
    phosphorus: 0.9,
    temp_min_c: 4,
    temp_max_c: 30,
    tags: ["Farbaufbau", "Frühjahr/Herbst", "Erhalt"],
    url: "https://www.kodawari-koi.de/product-page/takazumi-gold-plus",
    notes: "Farbbrillanz (Astaxanthin) + sehr hohe Verdaulichkeit – kann bereits ab ca. 4°C genutzt werden."
  },
  {
    id: "takazumi_high_growth",
    name: "Takazumi High Growth",
    brand: "Takazumi",
    category: "Wachstum / Saison",
    protein: 45.0,
    fat: 12.0,
    fiber: 2.3,
    ash: 7.0,
    phosphorus: 1.4,
    temp_min_c: 15,
    temp_max_c: 30,
    tags: ["Wachstum"],
    url: "https://www.kodawari-koi.de/product-page/takazumi-high-groth",
    notes: "Maximales Wachstum – empfohlen ab ca. 15°C (Hochsaison)."
  },
  {
    id: "takazumi_vital",
    name: "Takazumi Vital",
    brand: "Takazumi",
    category: "Immun / Winter / Kur",
    protein: 35.0,
    fat: 7.0,
    fiber: 2.5,
    ash: 9.0,
    phosphorus: 0.9,
    temp_min_c: 4,
    temp_max_c: 20,
    tags: ["Schonfütterung", "Frühjahr/Herbst", "Winter", "Erhalt"],
    url: "https://www.kodawari-koi.de/product-page/takazumi-vital",
    notes: "Für Immunkur, Stressphasen und kalte Jahreszeit (ab ca. 4°C)."
  }
];

async function addMissingFoods(presets){
  const existing = new Set((state.foods||[]).map(f=>f.id));
  for(const f of presets){
    if(existing.has(f.id)) continue;
    await put(state.db, "foods", f);
    existing.add(f.id);
  }
  state.foods = await getAll(state.db, "foods");
}


async function removeFoodsByIds(ids=[]){
  if(!state.db) return;
  const set = new Set(ids.map(x=>String(x)));
  const current = await getAll(state.db, "foods");
  const toDelete = current.filter(f => set.has(String(f.id)) || set.has(String(f.name||"").toLowerCase()));
  for(const f of toDelete){
    try{ await del(state.db, "foods", f.id); }catch{}
  }
  // refresh in-memory list
  try{ state.foods = await getAll(state.db, "foods"); }catch{ state.foods = []; }
}


function foodLabel(f){
  const b = (f.brand||"").trim();
  return b ? `${b} • ${f.name}` : (f.name||"Futter");
}


const state = {
  route: "dash",
  db: null,
  ponds: [],
  koi: [],
  logs: [],
  foods: [],
  koiPhotos: [],
  waterLogs: [],
  reminders: [],
  settings: {
    lockEnabled: false,
    weightMode: "estimate", // estimate|manual
    weightFactor: 0.012, // g per cm^3 factor
    tempUnit: "C",
    defaultFood: "Nutramare Koi360 Swim",
    defaultGoal: "Erhalt",
  }
};

function fmt(n, d=0){
  if(n === null || n === undefined || Number.isNaN(n)) return "—";
  const f = new Intl.NumberFormat("de-DE", {maximumFractionDigits:d, minimumFractionDigits:d});
  return f.format(n);
}
function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }
function toast(msg){
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>t.classList.remove("show"), 2400);
}

function openModal({title, bodyHTML, footHTML, onMount}){
  $("#modalTitle").textContent = title || "";
  $("#modalBody").innerHTML = bodyHTML || "";
  $("#modalFoot").innerHTML = footHTML || "";
  $("#modal").classList.add("show");
  $("#modal").setAttribute("aria-hidden","false");
  if(onMount) onMount();
}
function closeModal(){
  $("#modal").classList.remove("show");
  $("#modal").setAttribute("aria-hidden","true");
}
$("#modalClose").addEventListener("click", closeModal);
$("#modal").addEventListener("click", (e)=>{ if(e.target.id==="modal") closeModal(); });

function setRoute(r){
  state.route = r;
  $$(".tab").forEach(b=>b.classList.toggle("active", b.dataset.route===r));
  $$(".bottab").forEach(b=>b.classList.toggle("active", b.dataset.route===r));
  render();
}

$$(".tab").forEach(b=>b.addEventListener("click", ()=>setRoute(b.dataset.route)));
$$(".bottab").forEach(b=>b.addEventListener("click", ()=>setRoute(b.dataset.route)));

function estimateWeightFromLengthCm(L){
  const f = Number(state.settings.weightFactor) || 0.012;
  return Math.max(0, f * Math.pow(L, 3));
}

function koiWeight(k){
  if(state.settings.weightMode === "manual" && k.weight_g) return Number(k.weight_g) || 0;
  if(k.length_cm) return estimateWeightFromLengthCm(Number(k.length_cm)||0);
  return 0;
}

function totalWeightG(){
  return state.koi.reduce((a,k)=>a + koiWeight(k), 0);
}

function recPercentByTemp(tempC){
  // Very conservative heuristic; adjust in Settings.
  const t = Number(tempC);
  if(Number.isNaN(t)) return 0.01;
  if(t < 8) return 0.0;
  if(t < 12) return 0.002;
  if(t < 16) return 0.005;
  if(t < 20) return 0.010;
  if(t < 24) return 0.015;
  return 0.010;
}

function recommendedFeedGPerDay(tempC, goal){
  const biomass = totalWeightG();
  const pct = recPercentByTemp(tempC);
  const gf = goalFactor(goal, tempC);
  return biomass * pct * gf;
}

function recommendFoodByTempAndGoal(tempC, goal){
  const t = Number(tempC);
  if(!state.foods || state.foods.length === 0) return null;
  const g = (goal || "").trim();
  const candidates = state.foods.filter(f=>{
    const min = Number(f.temp_min_c);
    const max = Number(f.temp_max_c);
    const okTemp = (Number.isFinite(min)? t >= min : true) && (Number.isFinite(max)? t <= max : true);
    const tags = Array.isArray(f.tags) ? f.tags : [];
    const okGoal = !g ? true : (
      tags.includes(g) ||
      (g === "Erhalt" && tags.includes("Erhalt")) ||
      tags.length===0
    );
    return okTemp && okGoal;
  });
  const pickFrom = candidates.length ? candidates : state.foods;
  // prefer foods that explicitly match goal
  pickFrom.sort((a,b)=>{
    const at = Array.isArray(a.tags)?a.tags:[];
    const bt = Array.isArray(b.tags)?b.tags:[];
    const as = at.includes(g)?2:at.includes("Erhalt")?1:0;
    const bs = bt.includes(g)?2:bt.includes("Erhalt")?1:0;
    return bs - as;
  });
  return pickFrom[0] || null;
}

function recommendFoodsByTempAndGoal(tempC, goal, limit=3){
  const t = Number(tempC);
  const g = normalizeGoal(goal);
  if(!state.foods || state.foods.length===0) return [];
  const scored = state.foods.map(f=>{
    const min = Number(f.temp_min_c);
    const max = Number(f.temp_max_c);
    const okTemp = (Number.isFinite(min)? t >= min : true) && (Number.isFinite(max)? t <= max : true);
    const tags = Array.isArray(f.tags) ? f.tags : [];
    const sGoal = tags.includes(g) ? 4 : (
      (g === "Erhalt" && tags.includes("Erhalt")) ? 3 :
      (tags.length ? 0 : 0)
    );
    const sTemp = okTemp ? 3 : 0;
    const sProt = Number(f.protein)||0;
    const score = sTemp*10 + sGoal*5 + sProt/20;
    return { f, score, okTemp, tags };
  });
  scored.sort((a,b)=>b.score-a.score);
  return scored.filter(x=>x.okTemp || scored.filter(y=>y.okTemp).length===0).slice(0, limit).map(x=>x.f);
}

function nextDueReminder(){
  const enabled = (state.reminders||[]).filter(r=>r.enabled);
  const due = enabled
    .map(r=>({ ...r, _t: Date.parse(r.next_at || "") }))
    .filter(r=>Number.isFinite(r._t))
    .sort((a,b)=>a._t-b._t);
  return due[0] || null;
}

function isReminderDue(r){
  const t = Date.parse(r.next_at || "");
  return Number.isFinite(t) && t <= Date.now();
}

async function bumpReminder(r){
  const day = 24*60*60*1000;
  const every = Math.max(1, Number(r.every_days) || 7);
  const next = new Date(Date.now() + every*day).toISOString();
  const upd = { ...r, next_at: next };
  await put(state.db, "reminders", upd);
  await loadAll();
}

function startReminderLoop(){
  // Only while app is open (simple + reliable). Uses Notification API if granted.
  clearInterval(startReminderLoop._t);
  startReminderLoop._seen = startReminderLoop._seen || new Set();
  startReminderLoop._t = setInterval(async ()=>{
    const due = (state.reminders||[]).filter(r=>r.enabled && isReminderDue(r));
    if(due.length===0) return;
    for(const r of due){
      if(startReminderLoop._seen.has(r.id)) continue;
      startReminderLoop._seen.add(r.id);
      toast(`Erinnerung fällig: ${r.name}`);
      if("Notification" in window && Notification.permission === "granted"){
        try{ new Notification("Kodawari Koi", { body: `Erinnerung fällig: ${r.name}` }); }catch{}
      }
    }
    // refresh dashboard badges
    if(state.route === "dash" || state.route === "stats") render();
  }, 60*1000);
}

function deriveKpis(){
  const ponds = state.ponds.length;
  const koi = state.koi.length;
  const biomass = totalWeightG();
  const lastLog = state.logs
    .slice()
    .sort((a,b)=>new Date(b.at)-new Date(a.at))[0] || null;
  return { ponds, koi, biomass, lastLog };
}

async function loadAll(){
  state.ponds = await getAll(state.db, "ponds");
  state.koi = await getAll(state.db, "koi");
  state.logs = await getAll(state.db, "logs");
  // v2 stores
  try{ state.foods = await getAll(state.db, "foods"); }catch{ state.foods = []; }
  try{ state.koiPhotos = await getAll(state.db, "koiPhotos"); }catch{ state.koiPhotos = []; }
  try{ state.waterLogs = await getAll(state.db, "waterLogs"); }catch{ state.waterLogs = []; }
  try{ state.reminders = await getAll(state.db, "reminders"); }catch{ state.reminders = []; }
}

async function ensureDefaults(){
  // Food catalogue: Basis + Presets (Nutramare/Takazumi) – ergänzt ohne deine eigenen Einträge zu überschreiben
    // Food catalogue: nur Produkte aus deinem Shop (kodawari-koi.de)
  // (keine generischen Platzhalter wie Allround/Color/Wheatgerm/Growth)
  await addMissingFoods([...PRESET_FOODS]);

  // Cleanup: entferne ggf. frühere Platzhalter aus älteren Versionen
  await removeFoodsByIds(["food_allround","food_wheatgerm","food_growth","food_color"]); 


  // Default reminders
  if(!state.reminders || state.reminders.length === 0){
    const now = Date.now();
    const day = 24*60*60*1000;
    const defaults = [
      { id:"rem_waterchange", name:"Wasserwechsel", every_days: 14, next_at: new Date(now + 14*day).toISOString(), enabled: true },
      { id:"rem_filter", name:"Filterreinigung", every_days: 7, next_at: new Date(now + 7*day).toISOString(), enabled: true },
      { id:"rem_watertest", name:"Wasserwerte messen", every_days: 7, next_at: new Date(now + 7*day).toISOString(), enabled: true },
    ];
    for(const r of defaults) await put(state.db, "reminders", r);
    state.reminders = await getAll(state.db, "reminders");
  }
}

async function loadSettings(){
  const s = await getMeta(state.db, "settings", null);
  if(s && typeof s === "object"){
    state.settings = { ...state.settings, ...s };
    if("lockPassword" in state.settings) delete state.settings.lockPassword;
  } else {
    await setMeta(state.db, "settings", state.settings);
  }
}

async function saveSettings(){
  await setMeta(state.db, "settings", state.settings);
}

function render(){
  const v = $("#view");
  if(state.route === "dash") v.innerHTML = viewDash();
  if(state.route === "ponds") v.innerHTML = viewPonds();
  if(state.route === "koi") v.innerHTML = viewKoi();
  if(state.route === "calc") v.innerHTML = viewCalc();
  if(state.route === "log") v.innerHTML = viewLog();
  if(state.route === "stats") v.innerHTML = viewStats();

  // bind actions
  bindViewActions();
}

function viewDash(){
  const k = deriveKpis();
  const temp = state.ponds[0]?.temp_c ?? 18;
  const rec = recommendedFeedGPerDay(temp, state.settings.defaultGoal);
  const recFood = recommendFoodByTempAndGoal(temp, state.settings.defaultGoal);
  const nextReminder = nextDueReminder();
  return `
    <div class="grid">
      <section class="card">
        <h2>Übersicht</h2>
        <div class="kpi">
          <div class="kpi__item"><div class="kpi__label">Teiche</div><div class="kpi__value">${k.ponds}</div></div>
          <div class="kpi__item"><div class="kpi__label">Koi</div><div class="kpi__value">${k.koi}</div></div>
          <div class="kpi__item"><div class="kpi__label">Gesamtgewicht (≈)</div><div class="kpi__value">${fmt(k.biomass/1000,2)} kg</div></div>
          <div class="kpi__item"><div class="kpi__label">Empfehlung/Tag</div><div class="kpi__value">${fmt(rec,0)} g</div></div>
        </div>
        <div class="row" style="margin-top:8px">
          <span class="badge">Ziel: ${escapeHtml(state.settings.defaultGoal||"Erhalt")}</span> <span class="badge">Faktor: ${fmt((recPercentByTemp(temp)*goalFactor(state.settings.defaultGoal, temp))*100,2)}%</span>
          <span class="badge">Futter‑Tipp: ${escapeHtml(recFood ? foodLabel(recFood) : (state.settings.defaultFood || "—"))}</span>
          ${nextReminder ? `<span class="badge">🔔 Nächstes: ${escapeHtml(nextReminder.name)} • ${new Date(nextReminder.next_at).toLocaleDateString("de-DE")}</span>` : ``}
        </div>
        <hr class="sep"/>
        <p>
          Empfehlung basiert auf Temperatur & Gewicht. In den Einstellungen kannst du die Gewichtsschätzung anpassen –
          und Futtersorten / Erinnerungen verwalten.
        </p>
        <div class="row">
          <button class="btn primary" data-act="quickLog">+ Fütterung loggen</button>
          <button class="btn" data-act="addPond">+ Teich</button>
          <button class="btn" data-act="addKoi">+ Koi</button>
          ${recFood && recFood.url ? `<a class="btn" href="${recFood.url}" target="_blank" rel="noopener">🛒 Empfohlenes Futter bestellen</a>` : `<a class="btn" href="https://www.kodawari-koi.de/category/koi-futter" target="_blank" rel="noopener">🛒 Futter nachbestellen</a>`}
        </div>
      </section>

      <aside class="card">
        <h3>Letzter Eintrag</h3>
        ${k.lastLog ? `
          <div class="item">
            <div class="item__title">${new Date(k.lastLog.at).toLocaleString("de-DE")}</div>
            <div class="item__meta">${fmt(k.lastLog.amount_g,0)} g • ${k.lastLog.food || state.settings.defaultFood}${k.lastLog.pondId ? " • " + (state.ponds.find(p=>p.id===k.lastLog.pondId)?.name || "Teich") : ""}</div>
            ${k.lastLog.note ? `<div class="item__meta">${escapeHtml(k.lastLog.note)}</div>` : ""}
          </div>
        ` : `<p>Noch kein Logbuch‑Eintrag.</p>`}
        <hr class="sep"/>
        <h3>Tipps (iPhone)</h3>
        <p>Safari → Teilen → <b>Zum Home‑Bildschirm</b>, dann läuft die App wie eine echte App.</p>
      </aside>
    </div>
  `;
}

function viewPonds(){
  const list = state.ponds.slice().sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  return `
    <section class="card">
      <div class="row space">
        <h2>Teiche</h2>
        <button class="btn primary" data-act="addPond">+ Teich hinzufügen</button>
      </div>
      <p>Verwalte Volumen und Temperatur – das beeinflusst die Empfehlung.</p>
      <div class="list">
        ${list.length? list.map(p=>pondItem(p)).join("") : `<div class="item"><div class="item__title">Noch kein Teich</div><div class="item__meta">Lege deinen ersten Teich an.</div></div>`}
      </div>
    </section>
  `;
}
function pondItem(p){
  return `
    <div class="item" style="margin-top:10px">
        <div class="item__title">Gewicht</div>
        <div class="item__meta">Entweder manuell pro Koi oder geschätzt aus der Länge.</div>
        <div class="label">Modus</div>
        <select id="sWeightMode" class="input">
          <option value="estimate" ${state.settings.weightMode==="estimate"?"selected":""}>Schätzung (Länge → Gewicht)</option>
          <option value="manual" ${state.settings.weightMode==="manual"?"selected":""}>Manuell (Gewicht‑Feld nutzen)</option>
        </select>
        <div class="label">Schätz‑Faktor (g / cm³)</div>
        <input class="input" id="sFactor" type="number" step="0.001" value="${escapeAttr(state.settings.weightFactor)}">
        <div class="item__meta">Formel: Gewicht(g) ≈ Faktor × Länge(cm)^3. Typisch 0,010–0,015.</div>
      </div>

      <div class="item" style="margin-top:10px">
        <div class="item__title">Standard‑Futter</div>
        <div class="label">Name</div>
        <input class="input" id="sFood" value="${escapeAttr(state.settings.defaultFood||"Nutramare Koi360 Swim")}" placeholder="Nutramare Koi360 Swim">
      </div>

      <div class="item" style="margin-top:10px">
        <div class="item__title">Standard‑Ziel</div>
        <div class="label">Fütterungsziel</div>
        <select id="sGoal" class="input">
          ${GOALS.map(g=>`<option value="${g}" ${g===state.settings.defaultGoal?"selected":""}>${escapeHtml(g)}</option>`).join("")}
        </select>
      </div>

      <div class="row" style="margin-top:10px">
        <button class="btn" data-act="manageFoods">Futtersorten verwalten</button>
        <button class="btn" data-act="manageReminders">Erinnerungen</button>
      </div>
    `,
    footHTML: `
      <button class="btn" id="sCancel">Abbrechen</button>
      <button class="btn primary" id="sSave">Speichern</button>
    `,
    onMount(){
      $("#sCancel").addEventListener("click", closeModal);
      $("#sSave").addEventListener("click", async ()=>{
        state.settings.lockEnabled = false;
        state.settings.weightMode = $("#sWeightMode").value;
        state.settings.weightFactor = clamp(Number($("#sFactor").value || 0.012), 0.001, 0.05);
        state.settings.defaultFood = ($("#sFood").value || "Nutramare Koi360 Swim").trim();
        state.settings.defaultGoal = $("#sGoal").value || "Erhalt";

        await saveSettings();
        closeModal();
        toast("Gespeichert");
render();
      });

      // allow opening managers from settings modal
      $$('[data-act="manageFoods"]').forEach(b=>b.addEventListener("click", openFoodsManager));
      $$('[data-act="manageReminders"]').forEach(b=>b.addEventListener("click", openRemindersManager));
    }
  });
}

function openDataTools(){
  openModal({
    title: "Daten – Export / Import",
    bodyHTML: `
      <p>Alle Daten sind lokal (Offline) gespeichert. Hier kannst du ein Backup erstellen oder Daten importieren.</p>
      <div class="row">
        <button class="btn primary" id="doExport">Export (.json)</button>
        <label class="btn" for="importFile" style="cursor:pointer">Import (.json)</label>
        <input id="importFile" type="file" accept="application/json" hidden>
      </div>
      <hr class="sep"/>
      <div class="item">
        <div class="item__title">Alles löschen</div>
        <div class="item__meta">Setzt Teiche, Koi und Logbuch zurück.</div>
        <button class="btn danger" id="doWipe">Zurücksetzen</button>
      </div>
    `,
    footHTML: `<button class="btn primary" id="dtClose">Fertig</button>`,
    onMount(){
      $("#dtClose").addEventListener("click", closeModal);

      $("#doExport").addEventListener("click", async ()=>{
        const data = await exportAll(state.db);
        const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `kodawari-koi-backup-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href), 3000);
        toast("Export erstellt");
      });

      $("#importFile").addEventListener("change", async (e)=>{
        const file = e.target.files?.[0];
        if(!file) return;
        const text = await file.text();
        const data = JSON.parse(text);
        if(!confirm("Import überschreibt deine aktuellen Daten. Fortfahren?")) return;
        await importAll(state.db, data);
        await loadSettings();
        await loadAll();
        toast("Import fertig");
render();
        closeModal();
      });

      $("#doWipe").addEventListener("click", async ()=>{
        if(!confirm("Wirklich ALLES löschen?")) return;
        // wipe stores by importing empty sets
        await importAll(state.db, {ponds:[], koi:[], logs:[], settings: state.settings});
        await loadAll();
        toast("Zurückgesetzt");
        render();
        closeModal();
      });
    }
  });
}

/* Install prompt */
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e)=>{
  e.preventDefault();
  deferredPrompt = e;
  $("#btnInstall").style.display = "inline-flex";
});
$("#btnInstall").addEventListener("click", async ()=>{
  if(deferredPrompt){
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    toast("Install‑Dialog geöffnet");
  }else{
    // iOS fallback
    openModal({
      title:"Installieren (iPhone)",
      bodyHTML:`<p>Auf iPhone: Safari → Teilen → <b>Zum Home‑Bildschirm</b>.</p>`,
      footHTML:`<button class="btn primary" id="ok">Ok</button>`,
      onMount(){ $("#ok").addEventListener("click", closeModal); }
    });
  }
});

/* Service Worker */
async function registerSW(){
  if("serviceWorker" in navigator){
    try{
      await navigator.serviceWorker.register("./sw.js");
    }catch(err){
      console.warn("SW failed", err);
    }
  }
}

async function init(){
  state.db = await openDB();
  await loadSettings();
  await loadAll();
  await ensureDefaults();
  await loadAll();
render();
  await registerSW();

  startReminderLoop();

  // Hide install button until available (except iOS – still show on wide screens)
  $("#btnInstall").style.display = "none";
  // iOS detection: show "Install" tip as button on iOS
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  if(isIOS) $("#btnInstall").style.display = "inline-flex";
}

init();
