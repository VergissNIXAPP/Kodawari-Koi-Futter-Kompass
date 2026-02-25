import { openDB, getAll, put, del, getMeta, setMeta, exportAll, importAll } from "./db.js";

const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));
const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

const LOCK_PASSWORD = "koi"; // Nur hier im Code ändern

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
const GOAL_RANGES = {
  "Erhalt": { min: 70, max: 80 },
  "Wachstum": { min: 100, max: 120 },
  "Konditionierung": { min: 90, max: 100 },
  "Farbaufbau": { min: 80, max: 100 },
  "Schonfütterung": { min: 30, max: 50 },
  "Frühjahr/Herbst": { min: 50, max: 70 },
  "Winter": { min: 0, max: 20 },
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
  const r = GOAL_RANGES[g] || GOAL_RANGES["Erhalt"];
  const mid = (Number(r.min) + Number(r.max)) / 2; // percent
  const t = Number(tempC);
  // Winter: nur bei >8°C überhaupt füttern, sonst 0.
  if(g === "Winter" && (!Number.isFinite(t) || t <= 8)) return 0;
  // Unter 8°C generell 0 (egal welches Ziel)
  if(Number.isFinite(t) && t < 8) return 0;
  return mid / 100;
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
    tags: ["Allround", "Erhalt", "Kosten", "Basis"],
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
    tags: ["Allround", "Erhalt", "Vitalität", "Wasserqualität"],
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
    tags: ["Schonfütterung", "Erhalt", "Übergang", "Stabilisierung"],
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
    tags: ["Wachstum", "Aufzucht"],
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
    tags: ["Allround", "Erhalt", "Kosten", "Basis"],
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
    tags: ["Allround", "Erhalt", "Basis", "Futterkontrolle"],
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
    tags: ["Allround", "Erhalt", "Vitalität"],
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
    tags: ["Farbaufbau", "Erhalt", "Übergang"],
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
    tags: ["Winter", "Frühjahr/Herbst", "Schonfütterung", "Übergang"],
    url: "https://www.kodawari-koi.de/product-page/takazumi-vital",
    notes: "Für Immunkur, Stressphasen und kalte Jahreszeit (ab ca. 4°C)."
  }


  // Alpha (Kodawari Koi Shop)
  {
    id: "alpha_complete",
    name: "Alpha Complete",
    brand: "Alpha",
    category: "All-in-One / Ganzjahr",
    protein: 38.0,
    fat: 8.0,
    fiber: 2.0,
    ash: 9.0,
    phosphorus: 1.2,
    temp_min_c: 10,
    temp_max_c: 30,
    tags: ["Erhalt", "Wachstum", "Farbaufbau"],
    url: "https://www.kodawari-koi.de/product-page/alpha-complete",
    notes: "Premium All-in-One: Wachstum + Farbe + Immunsystem in einer Rezeptur (ab ca. 10°C)."
  },
  {
    id: "alpha_ice_5mm",
    name: "Alpha Ice 5mm",
    brand: "Alpha",
    category: "Winter / Wheatgerm",
    protein: 30.0,
    fat: 6.0,
    fiber: 2.5,
    ash: 8.5,
    phosphorus: 1.0,
    temp_min_c: 6,
    temp_max_c: 12,
    tags: ["Winter", "Frühjahr/Herbst", "Schonfütterung"],
    url: "https://www.kodawari-koi.de/product-page/alpha-ice-5mm",
    notes: "Schonendes Winter-/Übergangsfutter (ca. 6–12°C)."
  },
  {
    id: "alpha_addon_color",
    name: "Alpha Addon Color 5mm",
    brand: "Alpha",
    category: "Addon / Farbe",
    protein: 42.0,
    fat: 9.0,
    fiber: 1.5,
    ash: 9.5,
    temp_min_c: 16,
    temp_max_c: 30,
    tags: ["Farbaufbau"],
    url: "https://www.kodawari-koi.de/product-page/alpha-addon-color-5mm",
    notes: "Farbooster als Beimischung (Empfehlung: ab ca. 16°C)."
  },
  {
    id: "alpha_premium_bundle",
    name: "Alpha Premium Bundle: Complete + Addon Color",
    brand: "Alpha",
    category: "Bundle",
    temp_min_c: 10,
    temp_max_c: 30,
    tags: ["Bundle", "Erhalt", "Wachstum", "Farbaufbau"],
    url: "https://www.kodawari-koi.de/product-page/alpha-premium-bundle-complete-addon-color",
    notes: "Bundle aus Alpha Complete + Addon Color."
  },

  // Kenji Koi (Kodawari Koi Shop)
  {
    id: "kenji_daily_food",
    name: "Kenji Koi Daily Food",
    brand: "Kenji Koi",
    category: "Allround / Alltag",
    protein: 33.0,
    fat: 6.5,
    fiber: 3.0,
    ash: 5.0,
    temp_min_c: 10,
    temp_max_c: 30,
    tags: ["Erhalt", "Allround"],
    url: "https://www.kodawari-koi.de/product-page/kenji-koi-daily-food",
    notes: "Allround-Basis für die tägliche Fütterung (ab ca. 10°C)."
  },
  {
    id: "kenji_season_5kg",
    name: "Kenji Koi Season 5kg",
    brand: "Kenji Koi",
    category: "Saison / Schonend",
    protein: 32.0,
    fat: 7.0,
    fiber: 2.5,
    ash: 8.0,
    phosphorus: 1.1,
    temp_min_c: 8,
    temp_max_c: 18,
    tags: ["Frühjahr/Herbst", "Schonfütterung", "Erhalt"],
    url: "https://www.kodawari-koi.de/product-page/kenji-koi-season-5kg",
    notes: "Wheatgerm-basiert, sehr gut für Übergang (ab ca. 8–10°C)."
  },
  {
    id: "kenji_growth_plus",
    name: "Kenji Koi Growth+",
    brand: "Kenji Koi",
    category: "Wachstum / Sommer",
    protein: 45.0,
    fat: 12.0,
    fiber: 1.5,
    ash: 9.5,
    phosphorus: 1.2,
    temp_min_c: 16,
    temp_max_c: 30,
    tags: ["Wachstum"],
    url: "https://www.kodawari-koi.de/product-page/kenji-koi-growth-plus",
    notes: "Sommer-Wachstumsfutter (ab ca. 16°C, ideal >20°C)."
  },
  {
    id: "kenji_color_intense",
    name: "Kenji Koi Color Intense 5kg",
    brand: "Kenji Koi",
    category: "Farbe / Sommer",
    protein: 40.0,
    fat: 7.0,
    fiber: 2.0,
    ash: 8.5,
    phosphorus: 1.0,
    temp_min_c: 16,
    temp_max_c: 30,
    tags: ["Farbaufbau"],
    url: "https://www.kodawari-koi.de/product-page/kenji-koi-color-intense-5kg-5-6mm",
    notes: "Farbfutter mit Astaxanthin & Spirulina (ab ca. 15–16°C)."
  },
  {
    id: "kenji_color_growth",
    name: "Kenji Koi Color & Growth+ 5kg",
    brand: "Kenji Koi",
    category: "Leistung / Sommer",
    protein: 47.0,
    fat: 10.0,
    fiber: 1.2,
    ash: 9.0,
    phosphorus: 1.3,
    temp_min_c: 16,
    temp_max_c: 30,
    tags: ["Wachstum", "Farbaufbau"],
    url: "https://www.kodawari-koi.de/product-page/kenji-koi-color-growth-5kg",
    notes: "Leistungsfutter: Wachstum + Farbe (ab ca. 16°C)."
  },
  {
    id: "kenji_winter_balance",
    name: "Kenji Koi Winter Balance 5kg",
    brand: "Kenji Koi",
    category: "Winter (sinkend)",
    protein: 30.0,
    fat: 6.0,
    fiber: 2.5,
    ash: 8.0,
    phosphorus: 1.0,
    temp_min_c: 4,
    temp_max_c: 12,
    tags: ["Winter", "Frühjahr/Herbst", "Schonfütterung"],
    url: "https://www.kodawari-koi.de/product-page/kenji-koi-winter-balance-5kg",
    notes: "Sinkendes Winterfutter (ca. 4–12°C)."
  },
  {
    id: "kenji_snack_chip",
    name: "Kenji Koi Snack Chip",
    brand: "Kenji Koi",
    category: "Snack",
    protein: 30.0,
    fat: 5.0,
    fiber: 3.0,
    ash: 6.0,
    temp_min_c: 12,
    temp_max_c: 30,
    tags: ["Snack"],
    url: "https://www.kodawari-koi.de/product-page/kenji-koi-snack-chip",
    notes: "Belohnung/Snack – ideal zur Handfütterung (ab ca. 12°C)."
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

function foodLabel(f){
  const b = (f.brand||"").trim();
  return b ? `${b} • ${f.name}` : (f.name||"Futter");
}


function isShopFood(f){
  const u = (f && f.url) ? String(f.url) : "";
  return u.includes("kodawari-koi.de/");
}
function shopFoodsList(){
  const all = Array.isArray(state.foods) ? state.foods : [];
  const shop = all.filter(isShopFood);
  return shop.length ? shop : all;
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
    lockEnabled: true,
    weightMode: "estimate", // estimate|manual
    weightFactor: 0.012, // g per cm^3 factor
    tempUnit: "C",
    defaultFood: "Allround",
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
  const list = shopFoodsList();
  if(!list || list.length === 0) return null;
  const g = (goal || "").trim();
  const candidates = list.filter(f=>{
    const min = Number(f.temp_min_c);
    const max = Number(f.temp_max_c);
    const okTemp = (Number.isFinite(min)? t >= min : true) && (Number.isFinite(max)? t <= max : true);
    const tags = Array.isArray(f.tags) ? f.tags : [];
    const okGoal = !g ? true : (tags.includes(g) || tags.includes("Erhalt") || tags.length===0);
    return okTemp && okGoal;
  });
  const pickFrom = candidates.length ? candidates : list;
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
  const list = shopFoodsList();
  if(!list || list.length===0) return [];
  const scored = list.map(f=>{
    const min = Number(f.temp_min_c);
    const max = Number(f.temp_max_c);
    const okTemp = (Number.isFinite(min)? t >= min : true) && (Number.isFinite(max)? t <= max : true);
    const tags = Array.isArray(f.tags) ? f.tags : [];
    const sGoal = tags.includes(g) ? 3 : (tags.includes("Erhalt") ? 2 : (tags.length?1:0));
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
  const baseDefaults = [
    { id: "food_allround", name: "Allround", protein: 35, fat: 6, price_eur_per_kg: 8.90, temp_min_c: 12, temp_max_c: 24, tags:["Erhalt","Wachstum"] },
    { id: "food_wheatgerm", name: "Wheatgerm (kalt)", protein: 32, fat: 5, price_eur_per_kg: 9.90, temp_min_c: 6, temp_max_c: 15, tags:["Schonfütterung","Frühjahr/Herbst","Winter"] },
    { id: "food_growth", name: "Growth (warm)", protein: 40, fat: 8, price_eur_per_kg: 11.90, temp_min_c: 18, temp_max_c: 28, tags:["Wachstum","Konditionierung"] },
    { id: "food_color", name: "Color", protein: 36, fat: 7, price_eur_per_kg: 10.90, temp_min_c: 16, temp_max_c: 26, tags:["Farbaufbau"] },
  ];
  await addMissingFoods([...baseDefaults, ...PRESET_FOODS]);


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
          <span class="badge">Ziel: ${escapeHtml(state.settings.defaultGoal||"Erhalt")}</span> <span class="badge">Faktor: ${fmt(goalFactor(state.settings.defaultGoal, temp)*100,0)}%</span>
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
    <div class="item">
      <div class="row space">
        <div>
          <div class="item__title">🌊 ${escapeHtml(p.name || "Teich")}</div>
          <div class="item__meta">${fmt(p.volume_l,0)} L • ${fmt(p.temp_c,1)} °C</div>
        </div>
        <span class="badge">${p.id.slice(0,6)}</span>
      </div>
      ${p.note? `<div class="item__meta">${escapeHtml(p.note)}</div>`:""}
      <div class="item__actions">
        <button class="btn" data-act="pondWater" data-id="${p.id}">Wasserwerte</button>
        <button class="btn" data-act="editPond" data-id="${p.id}">Bearbeiten</button>
        <button class="btn danger" data-act="delPond" data-id="${p.id}">Löschen</button>
      </div>
    </div>
  `;
}

function viewKoi(){
  const list = state.koi.slice().sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  const biomass = totalWeightG();
  return `
    <section class="card">
      <div class="row space">
        <h2>Koi</h2>
        <button class="btn primary" data-act="addKoi">+ Koi hinzufügen</button>
      </div>
      <p>Gewicht ist ${state.settings.weightMode==="manual" ? "manuell" : "geschätzt"} (in Settings umstellbar). Gesamtgewicht: <b>${fmt(biomass/1000,2)} kg</b>.</p>
      <div class="list">
        ${list.length? list.map(k=>koiItem(k)).join("") : `<div class="item"><div class="item__title">Noch keine Koi</div><div class="item__meta">Füge Koi hinzu, um Empfehlungen zu berechnen.</div></div>`}
      </div>
    </section>
  `;
}

function koiItem(k){
  const w = koiWeight(k);
  const pond = k.pondId ? (state.ponds.find(p=>p.id===k.pondId)?.name || "Teich") : "—";
  return `
    <div class="item">
      <div class="row space">
        <div>
          <div class="item__title">🐟 ${escapeHtml(k.name || "Koi")}</div>
          <div class="item__meta">${k.length_cm ? fmt(k.length_cm,1)+" cm" : "—"} • ${fmt(w,0)} g • ${escapeHtml(pond)}</div>
        </div>
        <span class="badge">${k.id.slice(0,6)}</span>
      </div>
      ${k.note? `<div class="item__meta">${escapeHtml(k.note)}</div>`:""}
      <div class="item__actions">
        <button class="btn" data-act="koiPhotos" data-id="${k.id}">📸 Doku</button>
        <button class="btn" data-act="editKoi" data-id="${k.id}">Bearbeiten</button>
        <button class="btn danger" data-act="delKoi" data-id="${k.id}">Löschen</button>
      </div>
    </div>
  `;
}

function viewCalc(){
  const ponds = state.ponds.slice().sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  const defaultTemp = ponds[0]?.temp_c ?? 18;
  const biomass = totalWeightG();
  return `
    <section class="card">
      <div class="row space">
        <h2>Fütterungs‑Rechner</h2>
        <button class="btn" data-act="openEngineInfo">Wie berechnet?</button>
      </div>

      <div class="two">
        <div>
          <div class="label">Temperatur (°C)</div>
          <input class="input" id="calcTemp" type="number" step="0.1" value="${defaultTemp}">
        </div>
        <div>
          <div class="label">Teich (optional)</div>
          <select id="calcPond" class="input">
            <option value="">—</option>
            ${ponds.map(p=>`<option value="${p.id}">${escapeHtml(p.name||"Teich")}</option>`).join("")}
          </select>
        </div>
      </div>

      <div class="two">
        <div>
          <div class="label">Gesamtgewicht</div>
          <div class="badge">≈ ${fmt(biomass/1000,2)} kg</div>
        </div>
        <div>
          <div class="label">Futtertyp</div>
          <select class="input" id="calcFood">
            ${shopFoodsList()
              .slice()
              .sort((a,b)=>(a.name||"").localeCompare(b.name||""))
              .map(f=>`<option value="${f.id}" ${f.name===state.settings.defaultFood?"selected":""}>${escapeHtml(f.name)}</option>`)
              .join("")}
            <option value="__custom">Eigene Eingabe…</option>
          </select>
          <input class="input" id="calcFoodCustom" style="margin-top:8px; display:none" placeholder="z.B. ${state.settings.defaultFood}" value="">
        </div>
      </div>

      <div class="two">
        <div>
          <div class="label">Fütterungsziel</div>
          <select class="input" id="calcGoal">
            ${GOALS.map(g=>`<option value="${g}" ${g===state.settings.defaultGoal?"selected":""}>${escapeHtml(g)}</option>`).join("")}
          </select>
        </div>
        <div>
          <div class="label">Futter‑Tipp nach Temperatur</div>
          <div class="badge" id="calcFoodHint">—</div>
          <div class="muted" id="calcFoodHint2" style="margin-top:6px"></div>
        </div>
      </div>

      <hr class="sep"/>

      <div class="row space">
        <div>
          <div class="item__title">Empfehlung pro Tag</div>
          <div class="item__meta" id="calcOut">—</div>
        </div>
        <button class="btn primary" data-act="calcNow">Berechnen</button>
        <a class="btn primary" id="buyRecommended" href="#" target="_blank" rel="noopener" style="margin-left:8px; display:none">Empfohlenes Futter jetzt bestellen</a>
      </div>

      <div class="row" style="margin-top:10px">
        <button class="btn" data-act="split2">Auf 2 Fütterungen</button>
        <button class="btn" data-act="split3">Auf 3 Fütterungen</button>
        <button class="btn" data-act="split4">Auf 4 Fütterungen</button>
        <button class="btn" data-act="split5">Auf 5 Fütterungen</button>
        <button class="btn primary" data-act="logFromCalc">+ ins Logbuch</button>
      </div>
      <p class="muted">Hinweis: Das ist ein Richtwert. Bitte beobachte Wasserwerte & Verhalten – und passe an.</p>
    </section>
  `;
}

function viewLog(){
  const logs = state.logs.slice().sort((a,b)=>new Date(b.at)-new Date(a.at));
  return `
    <section class="card">
      <div class="row space">
        <h2>Logbuch</h2>
        <button class="btn primary" data-act="quickLog">+ Eintrag</button>
      </div>
      <p>Deine letzten Fütterungen & Notizen.</p>
      <div class="list">
        ${logs.length ? logs.map(l=>logItem(l)).join("") : `<div class="item"><div class="item__title">Noch leer</div><div class="item__meta">Lege den ersten Eintrag an.</div></div>`}
      </div>
    </section>
  `;
}

function viewStats(){
  const logs = state.logs.slice().sort((a,b)=>new Date(a.at)-new Date(b.at));
  const totalG = logs.reduce((a,l)=>a + (Number(l.amount_g)||0), 0);
  const totalCost = logs.reduce((a,l)=>a + (Number(l.cost_eur)||0), 0);

  // last 14 days avg consumption
  const now = Date.now();
  const day = 24*60*60*1000;
  const from = now - 14*day;
  const recent = logs.filter(l=>Date.parse(l.at||"")>=from);
  const recentG = recent.reduce((a,l)=>a + (Number(l.amount_g)||0), 0);
  const avgPerDay = recent.length ? (recentG / 14) : 0;

  // stock forecast: sum of remaining food amounts from foods? not tracked; use manual stock in foods (stock_g)
  const stockG = (state.foods||[]).reduce((a,f)=>a + (Number(f.stock_g)||0), 0);
  const daysLeft = (avgPerDay>0 && stockG>0) ? Math.floor(stockG/avgPerDay) : null;

  // growth vs feed: use koiPhotos with length/weight and dates.
  const growth = buildGrowthSummary();

  return `
    <div class="grid">
      <section class="card">
        <div class="row space">
          <h2>Auswertung</h2>
          <div class="row">
            <button class="btn" data-act="manageFoods">Futtersorten</button>
            <button class="btn" data-act="manageReminders">Erinnerungen</button>
          </div>
        </div>

        <div class="kpi">
          <div class="kpi__item"><div class="kpi__label">Futter gesamt</div><div class="kpi__value">${fmt(totalG/1000,2)} kg</div></div>
          <div class="kpi__item"><div class="kpi__label">Kosten gesamt</div><div class="kpi__value">${fmt(totalCost,2)} €</div></div>
          <div class="kpi__item"><div class="kpi__label">Ø / Tag (14T)</div><div class="kpi__value">${fmt(avgPerDay,0)} g</div></div>
          <div class="kpi__item"><div class="kpi__label">Futter reicht</div><div class="kpi__value">${daysLeft===null?"—":`${daysLeft} Tage`}</div></div>
        </div>

        <hr class="sep"/>

        <h3>Wachstum vs. Futtermenge</h3>
        ${growth.html}
        <p class="muted">Tipp: In der Koi‑Doku (📸) kannst du Fotos + Länge/Gewicht mit Datum speichern. Daraus entsteht diese Übersicht.</p>
      </section>

      <aside class="card">
        <h3>Wasserwerte (letzte Einträge)</h3>
        ${renderWaterSummary()}
        <hr class="sep"/>
        <h3>Prognose</h3>
        <p>Die Prognose nutzt deinen Verbrauch der letzten 14 Tage (Ø/Tag) und den hinterlegten Lagerbestand (g) je Futtersorte.</p>
        <p class="muted">Lagerbestand kannst du bei <b>Futtersorten</b> eintragen.</p>
      </aside>
    </div>
  `;
}

function logItem(l){
  const pond = l.pondId ? (state.ponds.find(p=>p.id===l.pondId)?.name || "Teich") : "";
  const cost = Number(l.cost_eur);
  const costStr = Number.isFinite(cost) && cost>0 ? ` • ${fmt(cost,2)} €` : "";
  const goalStr = l.goal ? ` • ${escapeHtml(l.goal)}` : "";
  return `
    <div class="item">
      <div class="row space">
        <div>
          <div class="item__title">📝 ${new Date(l.at).toLocaleString("de-DE")}</div>
          <div class="item__meta">${fmt(l.amount_g,0)} g • ${escapeHtml(l.food || state.settings.defaultFood || "Futter")}${pond? " • "+escapeHtml(pond):""}${goalStr}${costStr}</div>
        </div>
        <span class="badge">${l.id.slice(0,6)}</span>
      </div>
      ${l.note? `<div class="item__meta">${escapeHtml(l.note)}</div>`:""}
      <div class="item__actions">
        <button class="btn" data-act="editLog" data-id="${l.id}">Bearbeiten</button>
        <button class="btn danger" data-act="delLog" data-id="${l.id}">Löschen</button>
      </div>
    </div>
  `;
}

function bindViewActions(){
  $$("[data-act]").forEach(el=>{
    el.addEventListener("click", async ()=>{
      const act = el.dataset.act;
      const id = el.dataset.id;
      try{
        if(act==="addPond") return modalPond();
        if(act==="editPond") return modalPond(state.ponds.find(p=>p.id===id));
        if(act==="delPond") return deletePond(id);

        if(act==="addKoi") return modalKoi();
        if(act==="editKoi") return modalKoi(state.koi.find(k=>k.id===id));
        if(act==="delKoi") return deleteKoi(id);

        if(act==="quickLog") return modalLog();
        if(act==="editLog") return modalLog(state.logs.find(l=>l.id===id));
        if(act==="delLog") return deleteLog(id);

        if(act==="calcNow") return calcNow();
        if(act==="split2") return splitN(2);
        if(act==="split3") return splitN(3);
        if(act==="split4") return splitN(4);
        if(act==="split5") return splitN(5);
        if(act==="logFromCalc") return logFromCalc();
        if(act==="openEngineInfo") return engineInfo();

        if(act==="manageFoods") return openFoodsManager();
        if(act==="manageReminders") return openRemindersManager();
        if(act==="pondWater") return openWaterLogs(id);
        if(act==="koiPhotos") return openKoiPhotos(id);
      }catch(err){
        console.error(err);
        toast(err.message || "Fehler");
      }
    }, { once:true });
  });

  // Calc auto update
  const temp = $("#calcTemp");
  if(temp){
    temp.addEventListener("input", ()=>calcNow(true));
    $("#calcPond").addEventListener("change", ()=>{
      const pid = $("#calcPond").value;
      const p = state.ponds.find(x=>x.id===pid);
      if(p && p.temp_c !== undefined) $("#calcTemp").value = p.temp_c;
      calcNow(true);
    });

    const foodSel = $("#calcFood");
    const foodCustom = $("#calcFoodCustom");
    const goalSel = $("#calcGoal");
    const updateFoodUi = ()=>{
      const v = foodSel.value;
      const isCustom = v === "__custom";
      foodCustom.style.display = isCustom ? "block" : "none";
      calcNow(true);
    };
    foodSel?.addEventListener("change", updateFoodUi);
    foodCustom?.addEventListener("input", ()=>calcNow(true));
    goalSel?.addEventListener("change", ()=>calcNow(true));
    updateFoodUi();

    calcNow(true);
  }
}

function engineInfo(){
  openModal({
    title: "Berechnungs‑Hinweis",
    bodyHTML: `
      <p><b>Wichtig:</b> Die Formel ist ein konservativer Richtwert (kein Tierarzt‑Tool).</p>
      <p>Schritte:</p>
      <ul>
        <li>Gesamtgewicht = Summe der Koi‑Gewichte. (Gewicht entweder manuell oder aus Länge geschätzt.)</li>
        <li>Temperatur → Futter‑Prozent/Tag (sehr grob) × Ziel‑Faktor (z.B. Wachstum 110%):</li>
      </ul>
      <div class="item">
        <div class="item__meta">
          &lt;8°C: 0% • 8–12°C: 0,2% • 12–16°C: 0,5% • 16–20°C: 1,0% • 20–24°C: 1,5% • &gt;24°C: 1,0%
        </div>
      </div>
      <p>Du kannst Gewichtsschätzung & Standardfutter in den Einstellungen anpassen.</p>
    `,
    footHTML: `<button class="btn primary" id="ok">Ok</button>`,
    onMount(){
      $("#ok").addEventListener("click", closeModal);
    }
  });
}

function calcNow(silent=false){
  const t = Number($("#calcTemp")?.value ?? 18);
  const goal = normalizeGoal($("#calcGoal")?.value || state.settings.defaultGoal || "Erhalt");
  const rec = recommendedFeedGPerDay(t, goal);
  let rf = null;
  const out = $("#calcOut");
  if(out){
    const pct = recPercentByTemp(t)*100;
    out.innerHTML = `<b>${fmt(rec,0)} g</b> pro Tag <span class="badge">${fmt(pct,2)}%</span>`;
  }

  // Food hint
  const hint = $("#calcFoodHint");
  if(hint){
    rf = recommendFoodByTempAndGoal(t, goal);
    hint.innerHTML = rf ? `${escapeHtml(foodLabel(rf))} <span class="badge">${fmt(Number(rf.protein)||0,0)}% P</span> <span class="badge">${fmt(Number(rf.fat)||0,0)}% F</span>` : "—";
    const alt = recommendFoodsByTempAndGoal(t, goal, 3).filter(x=>!rf || x.id!==rf.id);
    const hint2 = $("#calcFoodHint2");
    if(hint2){
      hint2.innerHTML = alt.length ? (`Alternativen: ` + alt.map(a=>`${escapeHtml(foodLabel(a))} (${fmt(Number(a.protein)||0,0)}%P/${fmt(Number(a.fat)||0,0)}%F)`).join(' • ')) : '';
    }
  }

  // Buy button (dynamic shop link)
  const buy = $("#buyRecommended");
  if(buy){
    if(rf && rf.url){
      buy.href = rf.url;
      buy.style.display = "inline-flex";
    } else {
      buy.href = "#";
      buy.style.display = "none";
    }
  }


  if(!silent) toast("Berechnet");
}

function splitN(n){
  const t = Number($("#calcTemp")?.value ?? 18);
  const goal = normalizeGoal($("#calcGoal")?.value || state.settings.defaultGoal || "Erhalt");
  const rec = recommendedFeedGPerDay(t, goal);
  toast(`${fmt(rec/n,0)} g pro Fütterung (×${n})`);
}

function logFromCalc(){
  const t = Number($("#calcTemp")?.value ?? 18);
  const goal = $("#calcGoal")?.value || state.settings.defaultGoal || "Erhalt";
  const amount = Math.round(recommendedFeedGPerDay(t, goal));
  const foodSel = $("#calcFood")?.value;
  const custom = $("#calcFoodCustom")?.value?.trim();
  const foodId = (foodSel && foodSel !== "__custom") ? foodSel : "";
  const foodName = (foodSel === "__custom") ? (custom || state.settings.defaultFood) : (state.foods.find(f=>f.id===foodSel)?.name || state.settings.defaultFood);
  modalLog({
    amount_g: amount,
    foodId,
    food: foodName,
    goal,
    temp_c: t,
    pondId: $("#calcPond")?.value || ""
  });
}

function modalPond(existing=null){
  const p = existing || { id: uid(), name:"", volume_l:"", temp_c:"", note:"" };
  openModal({
    title: existing ? "Teich bearbeiten" : "Teich hinzufügen",
    bodyHTML: `
      <div class="label">Name</div>
      <input class="input" id="pName" value="${escapeAttr(p.name)}" placeholder="z.B. Hauptteich">
      <div class="two">
        <div>
          <div class="label">Volumen (Liter)</div>
          <input class="input" id="pVol" type="number" step="1" value="${escapeAttr(p.volume_l)}" placeholder="z.B. 12000">
        </div>
        <div>
          <div class="label">Temperatur (°C)</div>
          <input class="input" id="pTemp" type="number" step="0.1" value="${escapeAttr(p.temp_c)}" placeholder="z.B. 18.5">
        </div>
      </div>
      <div class="label">Notiz</div>
      <textarea class="input" id="pNote" placeholder="optional">${escapeHtml(p.note||"")}</textarea>
    `,
    footHTML: `
      ${existing ? `<button class="btn danger" id="pDelete">Löschen</button>` : `<span></span>`}
      <button class="btn" id="pCancel">Abbrechen</button>
      <button class="btn primary" id="pSave">Speichern</button>
    `,
    onMount(){
      $("#pCancel").addEventListener("click", closeModal);
      $("#pSave").addEventListener("click", async ()=>{
        const upd = {
          id: p.id,
          name: $("#pName").value.trim() || "Teich",
          volume_l: num($("#pVol").value),
          temp_c: num($("#pTemp").value),
          note: $("#pNote").value.trim()
        };
        await put(state.db, "ponds", upd);
        await loadAll();
        closeModal();
        toast("Teich gespeichert");
        render();
      });
      if(existing){
        $("#pDelete").addEventListener("click", ()=>deletePond(existing.id, true));
      }
    }
  });
}

async function deletePond(id, fromModal=false){
  const p = state.ponds.find(x=>x.id===id);
  if(!confirm(`Teich "${p?.name||"Teich"}" wirklich löschen?`)) return;
  await del(state.db, "ponds", id);
  // unlink koi/logs pointing to it
  for(const k of state.koi.filter(x=>x.pondId===id)){
    await put(state.db, "koi", {...k, pondId:""});
  }
  for(const l of state.logs.filter(x=>x.pondId===id)){
    await put(state.db, "logs", {...l, pondId:""});
  }
  await loadAll();
  if(fromModal) closeModal();
  toast("Teich gelöscht");
  render();
}

function modalKoi(existing=null){
  const ponds = state.ponds.slice().sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  const k = existing || { id: uid(), name:"", length_cm:"", weight_g:"", pondId:"", note:"" };
  openModal({
    title: existing ? "Koi bearbeiten" : "Koi hinzufügen",
    bodyHTML: `
      <div class="label">Name</div>
      <input class="input" id="kName" value="${escapeAttr(k.name)}" placeholder="z.B. Shiro 1">
      <div class="two">
        <div>
          <div class="label">Länge (cm)</div>
          <input class="input" id="kLen" type="number" step="0.1" value="${escapeAttr(k.length_cm)}" placeholder="z.B. 42">
          <div class="item__meta">Gewicht geschätzt: <b id="kEst">—</b></div>
        </div>
        <div>
          <div class="label">Gewicht (g) ${state.settings.weightMode==="manual" ? "" : "(optional)"}</div>
          <input class="input" id="kW" type="number" step="1" value="${escapeAttr(k.weight_g)}" placeholder="z.B. 1200">
          <div class="item__meta">${state.settings.weightMode==="manual" ? "Wird für die Berechnung genutzt." : "Nur genutzt, wenn du auf manuell umstellst."}</div>
        </div>
      </div>
      <div class="label">Teich</div>
      <select id="kPond" class="input">
        <option value="">—</option>
        ${ponds.map(p=>`<option value="${p.id}" ${p.id===k.pondId?"selected":""}>${escapeHtml(p.name||"Teich")}</option>`).join("")}
      </select>
      <div class="label">Notiz</div>
      <textarea class="input" id="kNote" placeholder="optional">${escapeHtml(k.note||"")}</textarea>
    `,
    footHTML: `
      ${existing ? `<button class="btn danger" id="kDelete">Löschen</button>` : `<span></span>`}
      <button class="btn" id="kCancel">Abbrechen</button>
      <button class="btn primary" id="kSave">Speichern</button>
    `,
    onMount(){
      const updEst = ()=>{
        const L = num($("#kLen").value);
        const est = estimateWeightFromLengthCm(L);
        $("#kEst").textContent = est ? `${fmt(est,0)} g` : "—";
      };
      $("#kLen").addEventListener("input", updEst);
      updEst();

      $("#kCancel").addEventListener("click", closeModal);
      $("#kSave").addEventListener("click", async ()=>{
        const upd = {
          id: k.id,
          name: $("#kName").value.trim() || "Koi",
          length_cm: num($("#kLen").value),
          weight_g: num($("#kW").value),
          pondId: $("#kPond").value || "",
          note: $("#kNote").value.trim()
        };
        await put(state.db, "koi", upd);
        await loadAll();
        closeModal();
        toast("Koi gespeichert");
        render();
      });
      if(existing){
        $("#kDelete").addEventListener("click", ()=>deleteKoi(existing.id, true));
      }
    }
  });
}

async function deleteKoi(id, fromModal=false){
  const k = state.koi.find(x=>x.id===id);
  if(!confirm(`Koi "${k?.name||"Koi"}" wirklich löschen?`)) return;
  await del(state.db, "koi", id);
  await loadAll();
  if(fromModal) closeModal();
  toast("Koi gelöscht");
  render();
}

function modalLog(existing=null){
  const ponds = state.ponds.slice().sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  const l = existing || {
    id: uid(),
    at: new Date().toISOString(),
    amount_g:"",
    foodId: "",
    food: state.settings.defaultFood,
    goal: state.settings.defaultGoal || "Erhalt",
    temp_c: state.ponds[0]?.temp_c ?? "",
    pondId:"",
    note:"",
    cost_eur: ""
  };
  const dtLocal = isoToLocalInput(l.at);
  const allFoods = Array.isArray(state.foods) ? state.foods.slice() : [];
  const foods = allFoods.filter(isShopFood);
  // Falls ein alter Eintrag ein nicht‑Shop‑Futter referenziert, trotzdem anzeigen (damit nichts "verschwindet")
  if(l.foodId && !foods.some(f=>f.id===l.foodId)){
    const sel = allFoods.find(f=>f.id===l.foodId);
    if(sel) foods.push(sel);
  }
  foods.sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  openModal({
    title: existing ? "Eintrag bearbeiten" : "Eintrag hinzufügen",
    bodyHTML: `
      <div class="two">
        <div>
          <div class="label">Datum & Uhrzeit</div>
          <input class="input" id="lAt" type="datetime-local" value="${escapeAttr(dtLocal)}">
        </div>
        <div>
          <div class="label">Menge (g)</div>
          <input class="input" id="lAmt" type="number" step="1" value="${escapeAttr(l.amount_g)}" placeholder="z.B. 80">
        </div>
      </div>
      <div class="two">
        <div>
          <div class="label">Futter</div>
          <select class="input" id="lFoodId">
            <option value="">(Text / Standard)</option>
            ${foods.map(f=>`<option value="${f.id}" ${f.id===l.foodId?"selected":""}>${escapeHtml(f.name)}${(Number.isFinite(Number(f.price_eur_per_kg))?` • ${fmt(f.price_eur_per_kg,2)} €/kg`:"")}</option>`).join("")}
          </select>
          <input class="input" id="lFood" style="margin-top:8px" value="${escapeAttr(l.food||"")}" placeholder="z.B. ${state.settings.defaultFood}">
          <div class="item__meta" id="lFoodMeta">—</div>
        </div>
        <div>
          <div class="label">Teich (optional)</div>
          <select id="lPond" class="input">
            <option value="">—</option>
            ${ponds.map(p=>`<option value="${p.id}" ${p.id===l.pondId?"selected":""}>${escapeHtml(p.name||"Teich")}</option>`).join("")}
          </select>
        </div>
      </div>

      <div class="two">
        <div>
          <div class="label">Fütterungsziel</div>
          <select id="lGoal" class="input">
            ${GOALS.map(g=>`<option value="${g}" ${g=== (l.goal||state.settings.defaultGoal)?"selected":""}>${escapeHtml(g)}</option>`).join("")}
          </select>
        </div>
        <div>
          <div class="label">Temperatur (°C) (optional)</div>
          <input class="input" id="lTemp" type="number" step="0.1" value="${escapeAttr(l.temp_c)}" placeholder="z.B. 18.5">
        </div>
      </div>

      <div class="two">
        <div>
          <div class="label">Kosten (auto) (€)</div>
          <input class="input" id="lCost" type="number" step="0.01" value="${escapeAttr(l.cost_eur)}" placeholder="wird berechnet" />
          <div class="item__meta">Wenn du einen Preis pro kg beim Futter hinterlegt hast, wird das automatisch berechnet – du kannst es trotzdem überschreiben.</div>
        </div>
        <div>
          <div class="label">Hinweis</div>
          <div class="badge" id="lHint">—</div>
        </div>
      </div>
      <div class="label">Notiz</div>
      <textarea class="input" id="lNote" placeholder="optional">${escapeHtml(l.note||"")}</textarea>
    `,
    footHTML: `
      ${existing ? `<button class="btn danger" id="lDelete">Löschen</button>` : `<span></span>`}
      <button class="btn" id="lCancel">Abbrechen</button>
      <button class="btn primary" id="lSave">Speichern</button>
    `,
    onMount(){
      const updFoodMeta = ()=>{
        const fid = $("#lFoodId").value;
        const f = state.foods.find(x=>x.id===fid);
        const meta = $("#lFoodMeta");
        if(!f){ meta.textContent = "—"; return; }
        const parts = [];
        if(Number.isFinite(Number(f.protein))) parts.push(`Protein ${fmt(f.protein,0)}%`);
        if(Number.isFinite(Number(f.fat))) parts.push(`Fett ${fmt(f.fat,0)}%`);
        if(Number.isFinite(Number(f.price_eur_per_kg))) parts.push(`${fmt(f.price_eur_per_kg,2)} €/kg`);
        if(Number.isFinite(Number(f.temp_min_c)) || Number.isFinite(Number(f.temp_max_c))){
          const a = Number.isFinite(Number(f.temp_min_c)) ? fmt(f.temp_min_c,0) : "?";
          const b = Number.isFinite(Number(f.temp_max_c)) ? fmt(f.temp_max_c,0) : "?";
          parts.push(`Temp ${a}–${b}°C`);
        }
        meta.textContent = parts.join(" • ") || "—";
      };

      const autoCost = ()=>{
        const amt = Number($("#lAmt").value);
        const fid = $("#lFoodId").value;
        const f = state.foods.find(x=>x.id===fid);
        const costEl = $("#lCost");
        const hintEl = $("#lHint");
        const t = Number($("#lTemp").value);
        const goal = $("#lGoal").value;

        const rf = recommendFoodByTempAndGoal(t, goal);
        hintEl.textContent = rf ? `Tipp: ${rf.name}` : "—";

        // only auto-fill if empty or matches previous auto value
        if(!f || !Number.isFinite(Number(f.price_eur_per_kg)) || !Number.isFinite(amt)) return;
        const cost = (amt/1000) * Number(f.price_eur_per_kg);
        if(!costEl.value || costEl.dataset.auto === "1"){
          costEl.value = String(Math.round(cost*100)/100);
          costEl.dataset.auto = "1";
        }
      };

      $("#lFoodId").addEventListener("change", ()=>{
        const fid = $("#lFoodId").value;
        const f = state.foods.find(x=>x.id===fid);
        if(f){
          $("#lFood").value = f.name;
        }
        updFoodMeta();
        autoCost();
      });
      $("#lAmt").addEventListener("input", autoCost);
      $("#lTemp").addEventListener("input", autoCost);
      $("#lGoal").addEventListener("change", autoCost);
      $("#lCost").addEventListener("input", ()=>{ $("#lCost").dataset.auto = "0"; });
      updFoodMeta();
      autoCost();

      $("#lCancel").addEventListener("click", closeModal);
      $("#lSave").addEventListener("click", async ()=>{
        const upd = {
          id: l.id,
          at: localInputToIso($("#lAt").value) || new Date().toISOString(),
          amount_g: num($("#lAmt").value),
          foodId: $("#lFoodId").value || "",
          food: $("#lFood").value.trim() || state.settings.defaultFood,
          goal: $("#lGoal").value || state.settings.defaultGoal || "Erhalt",
          temp_c: num($("#lTemp").value),
          cost_eur: num($("#lCost").value),
          pondId: $("#lPond").value || "",
          note: $("#lNote").value.trim()
        };
        await put(state.db, "logs", upd);
        await loadAll();
        closeModal();
        toast("Eintrag gespeichert");
        render();
      });
      if(existing){
        $("#lDelete").addEventListener("click", ()=>deleteLog(existing.id, true));
      }
    }
  });
}

async function deleteLog(id, fromModal=false){
  if(!confirm("Eintrag wirklich löschen?")) return;
  await del(state.db, "logs", id);
  await loadAll();
  if(fromModal) closeModal();
  toast("Eintrag gelöscht");
  render();
}

function num(v){
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : "";
}

function escapeHtml(s){
  return String(s??"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}
function escapeAttr(s){ return escapeHtml(s).replaceAll("\n"," "); }

function isoToLocalInput(iso){
  try{
    const d = new Date(iso);
    const pad = (x)=>String(x).padStart(2,"0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }catch{ return ""; }
}
function localInputToIso(v){
  if(!v) return "";
  const d = new Date(v);
  return d.toISOString();
}

/* Settings + Data tools */
$("#btnSettings").addEventListener("click", ()=>openSettings());
$("#btnSync").addEventListener("click", ()=>openDataTools());

function openFoodsManager(){
  const foods = state.foods.slice().sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  openModal({
    title: "Futtersorten",
    bodyHTML: `
      <p>Hier kannst du Futtersorten inkl. Nährwerte, Temperatur‑Bereich, Preis und Lagerbestand hinterlegen.</p>
      <div class="list">
        ${foods.map(f=>`
          <div class="item">
            <div class="row space">
              <div>
                <div class="item__title">🍽️ ${escapeHtml(f.name||"Futter")}</div>
                <div class="item__meta">
                  ${Number.isFinite(Number(f.protein))?`Protein ${fmt(f.protein,0)}%`:""}
                  ${Number.isFinite(Number(f.fat))?` • Fett ${fmt(f.fat,0)}%`:""}
                  ${Number.isFinite(Number(f.price_eur_per_kg))?` • ${fmt(f.price_eur_per_kg,2)} €/kg`:""}
                  ${(Number.isFinite(Number(f.temp_min_c))||Number.isFinite(Number(f.temp_max_c)))?` • Temp ${fmt(f.temp_min_c||"?",0)}–${fmt(f.temp_max_c||"?",0)}°C`:""}
                  ${Number.isFinite(Number(f.stock_g))?` • Lager ${fmt(f.stock_g,0)} g`:""}
                </div>
              </div>
              <span class="badge">${f.id.slice(0,6)}</span>
            </div>
            <div class="item__actions">
              ${f.url ? `<a class="btn" href="${f.url}" target="_blank" rel="noopener">🛒 Shop</a>` : ``}
              <button class="btn" data-act="editFood" data-id="${f.id}">Bearbeiten</button>
              <button class="btn danger" data-act="delFood" data-id="${f.id}">Löschen</button>
            </div>
          </div>
        `).join("")}
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn primary" id="addFood">+ Futtersorte</button>
      </div>
    `,
    footHTML: `<button class="btn primary" id="close">Fertig</button>`,
    onMount(){
      $("#close").addEventListener("click", closeModal);
      $("#addFood").addEventListener("click", ()=>modalFood());
      // bind dynamic actions
      $$('[data-act="editFood"]').forEach(b=>b.addEventListener("click", ()=>modalFood(state.foods.find(x=>x.id===b.dataset.id))));
      $$('[data-act="delFood"]').forEach(b=>b.addEventListener("click", ()=>deleteFood(b.dataset.id)));
    }
  });
}

function modalFood(existing=null){
  const f = existing || { id: uid(), name:"", protein:"", fat:"", price_eur_per_kg:"", stock_g:"", temp_min_c:"", temp_max_c:"", url:"", notes:"", tags:["Erhalt"] };
  openModal({
    title: existing ? "Futtersorte bearbeiten" : "Futtersorte hinzufügen",
    bodyHTML: `
      <div class="label">Name</div>
      <input class="input" id="fName" value="${escapeAttr(f.name)}" placeholder="z.B. Allround">
      <div class="two">
        <div>
          <div class="label">Protein (%)</div>
          <input class="input" id="fProt" type="number" step="1" value="${escapeAttr(f.protein)}">
        </div>
        <div>
          <div class="label">Fett (%)</div>
          <input class="input" id="fFat" type="number" step="1" value="${escapeAttr(f.fat)}">
        </div>
      </div>
      <div class="two">
        <div>
          <div class="label">Preis (€/kg)</div>
          <input class="input" id="fPrice" type="number" step="0.01" value="${escapeAttr(f.price_eur_per_kg)}">
        </div>
        <div>
          <div class="label">Lagerbestand (g)</div>
          <input class="input" id="fStock" type="number" step="1" value="${escapeAttr(f.stock_g)}" placeholder="z.B. 2500">
        </div>
      </div>
      <div class="two">
        <div>
          <div class="label">Temp min (°C)</div>
          <input class="input" id="fTmin" type="number" step="1" value="${escapeAttr(f.temp_min_c)}">
        </div>
        <div>
          <div class="label">Temp max (°C)</div>
          <input class="input" id="fTmax" type="number" step="1" value="${escapeAttr(f.temp_max_c)}">
        </div>
      </div>
      <div class="label">Shop‑Link (optional)</div>
      <input class="input" id="fUrl" value="${escapeAttr(f.url||"")}" placeholder="https://www.kodawari-koi.de/product-page/...">
      <div class="label">Notiz (optional)</div>
      <textarea class="input" id="fNotes" placeholder="Kurzbeschreibung / Einsatzbereich">${escapeHtml(f.notes||"")}</textarea>
      <div class="label">Ziele (für Empfehlungen)</div>
      <div class="row" style="flex-wrap:wrap; gap:8px">
        ${GOALS.map(g=>{
          const checked = (Array.isArray(f.tags)?f.tags:[]).includes(g);
          return `<label class="badge" style="cursor:pointer"><input type="checkbox" class="fTag" value="${escapeAttr(g)}" ${checked?"checked":""}/> ${escapeHtml(g)}</label>`;
        }).join("")}
      </div>
    `,
    footHTML: `
      ${existing ? `<button class="btn danger" id="fDelete">Löschen</button>` : `<span></span>`}
      <button class="btn" id="fCancel">Abbrechen</button>
      <button class="btn primary" id="fSave">Speichern</button>
    `,
    onMount(){
      $("#fCancel").addEventListener("click", closeModal);
      $("#fSave").addEventListener("click", async ()=>{
        const tags = $$(".fTag").filter(x=>x.checked).map(x=>x.value);
        const upd = {
          id: f.id,
          name: $("#fName").value.trim() || "Futter",
          protein: num($("#fProt").value),
          fat: num($("#fFat").value),
          price_eur_per_kg: num($("#fPrice").value),
          stock_g: num($("#fStock").value),
          temp_min_c: num($("#fTmin").value),
          temp_max_c: num($("#fTmax").value),
          tags
        };
        await put(state.db, "foods", upd);
        await loadAll();
        toast("Futter gespeichert");
        openFoodsManager();
      });
      if(existing){
        $("#fDelete").addEventListener("click", ()=>deleteFood(existing.id, true));
      }
    }
  });
}

async function deleteFood(id, fromModal=false){
  const f = state.foods.find(x=>x.id===id);
  if(!confirm(`Futtersorte "${f?.name||"Futter"}" wirklich löschen?`)) return;
  await del(state.db, "foods", id);
  await loadAll();
  if(fromModal) closeModal();
  toast("Futter gelöscht");
  openFoodsManager();
}

function openRemindersManager(){
  const rems = (state.reminders||[]).slice().sort((a,b)=>new Date(a.next_at)-new Date(b.next_at));
  openModal({
    title: "Erinnerungen",
    bodyHTML: `
      <p>Automatische Erinnerungen laufen lokal. Wenn du Browser‑Benachrichtigungen erlaubst, bekommst du einen Ping, sobald die App geöffnet ist und etwas fällig wird.</p>
      <div class="row" style="margin-bottom:10px">
        <button class="btn" id="reqNotif">🔔 Benachrichtigungen aktivieren</button>
      </div>
      <div class="list">
        ${rems.map(r=>`
          <div class="item">
            <div class="row space">
              <div>
                <div class="item__title">${isReminderDue(r)?"⏰":"🔔"} ${escapeHtml(r.name||"Erinnerung")}</div>
                <div class="item__meta">alle ${fmt(r.every_days,0)} Tage • nächstes: ${r.next_at?new Date(r.next_at).toLocaleDateString("de-DE"):"—"}</div>
              </div>
              <label class="badge" style="cursor:pointer">
                <input type="checkbox" class="rEnabled" data-id="${r.id}" ${r.enabled?"checked":""} /> aktiv
              </label>
            </div>
            <div class="two" style="margin-top:8px">
              <div>
                <div class="label">Intervall (Tage)</div>
                <input class="input rEvery" data-id="${r.id}" type="number" step="1" value="${escapeAttr(r.every_days)}" />
              </div>
              <div>
                <div class="label">Nächstes Datum</div>
                <input class="input rNext" data-id="${r.id}" type="date" value="${r.next_at?new Date(r.next_at).toISOString().slice(0,10):""}" />
              </div>
            </div>
            <div class="item__actions">
              <button class="btn" data-act="doneRem" data-id="${r.id}">Erledigt</button>
              <button class="btn danger" data-act="delRem" data-id="${r.id}">Löschen</button>
            </div>
          </div>
        `).join("")}
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn primary" id="addRem">+ Erinnerung</button>
      </div>
    `,
    footHTML: `
      <button class="btn" id="save">Speichern</button>
      <button class="btn primary" id="close">Fertig</button>
    `,
    onMount(){
      $("#close").addEventListener("click", ()=>{ closeModal(); render(); });
      $("#save").addEventListener("click", saveRemindersFromUI);
      $("#addRem").addEventListener("click", ()=>modalReminder());
      $("#reqNotif").addEventListener("click", async ()=>{
        if(!("Notification" in window)) return toast("Nicht unterstützt");
        const p = await Notification.requestPermission();
        toast(p==="granted"?"Ok – Benachrichtigungen aktiv":"Nicht erlaubt");
      });
      $$('[data-act="doneRem"]').forEach(b=>b.addEventListener("click", async ()=>{
        const r = state.reminders.find(x=>x.id===b.dataset.id);
        if(!r) return;
        await bumpReminder(r);
        toast("Erledigt");
        openRemindersManager();
      }));
      $$('[data-act="delRem"]').forEach(b=>b.addEventListener("click", ()=>deleteReminder(b.dataset.id)));
    }
  });
}

async function saveRemindersFromUI(){
  const enabledEls = $$(".rEnabled");
  const everyEls = $$(".rEvery");
  const nextEls = $$(".rNext");
  const byId = new Map((state.reminders||[]).map(r=>[r.id,r]));
  for(const el of enabledEls){
    const r = byId.get(el.dataset.id);
    if(r) r.enabled = el.checked;
  }
  for(const el of everyEls){
    const r = byId.get(el.dataset.id);
    if(r) r.every_days = clamp(Number(el.value||7), 1, 365);
  }
  for(const el of nextEls){
    const r = byId.get(el.dataset.id);
    if(r && el.value){
      const d = new Date(el.value + "T09:00:00");
      r.next_at = d.toISOString();
    }
  }
  for(const r of byId.values()) await put(state.db, "reminders", r);
  await loadAll();
  toast("Gespeichert");
}

function modalReminder(existing=null){
  const r = existing || { id: uid(), name:"", every_days:7, next_at: new Date(Date.now()+7*24*60*60*1000).toISOString(), enabled:true };
  openModal({
    title: existing?"Erinnerung bearbeiten":"Erinnerung hinzufügen",
    bodyHTML:`
      <div class="label">Name</div>
      <input class="input" id="rName" value="${escapeAttr(r.name)}" placeholder="z.B. Wasserwechsel">
      <div class="two">
        <div>
          <div class="label">Intervall (Tage)</div>
          <input class="input" id="rEvery" type="number" step="1" value="${escapeAttr(r.every_days)}" />
        </div>
        <div>
          <div class="label">Nächstes Datum</div>
          <input class="input" id="rNext" type="date" value="${r.next_at?new Date(r.next_at).toISOString().slice(0,10):""}" />
        </div>
      </div>
      <label class="badge" style="cursor:pointer"><input type="checkbox" id="rEnabled" ${r.enabled?"checked":""}/> aktiv</label>
    `,
    footHTML:`
      <button class="btn" id="rCancel">Abbrechen</button>
      <button class="btn primary" id="rSave">Speichern</button>
    `,
    onMount(){
      $("#rCancel").addEventListener("click", closeModal);
      $("#rSave").addEventListener("click", async ()=>{
        const d = $("#rNext").value ? new Date($("#rNext").value + "T09:00:00") : new Date();
        const upd = {
          id: r.id,
          name: $("#rName").value.trim() || "Erinnerung",
          every_days: clamp(Number($("#rEvery").value||7), 1, 365),
          next_at: d.toISOString(),
          enabled: $("#rEnabled").checked
        };
        await put(state.db, "reminders", upd);
        await loadAll();
        toast("Erinnerung gespeichert");
        openRemindersManager();
      });
    }
  });
}

async function deleteReminder(id){
  if(!confirm("Erinnerung wirklich löschen?")) return;
  await del(state.db, "reminders", id);
  await loadAll();
  toast("Gelöscht");
  openRemindersManager();
}

function openKoiPhotos(koiId){
  const k = state.koi.find(x=>x.id===koiId);
  if(!k) return;
  const photos = (state.koiPhotos||[])
    .filter(p=>p.koiId===koiId)
    .slice()
    .sort((a,b)=>new Date(b.at)-new Date(a.at));
  openModal({
    title: `📸 Doku – ${k.name||"Koi"}`,
    bodyHTML: `
      <p>Fotos & Messwerte für Wachstum/Entwicklung.</p>
      <div class="row" style="margin-bottom:10px">
        <label class="btn primary" for="phFile" style="cursor:pointer">+ Foto hinzufügen</label>
        <input id="phFile" type="file" accept="image/*" hidden>
      </div>
      <div class="list">
        ${photos.length ? photos.map(p=>`
          <div class="item">
            <div class="row space">
              <div>
                <div class="item__title">${new Date(p.at).toLocaleDateString("de-DE")}</div>
                <div class="item__meta">${p.length_cm?fmt(p.length_cm,1)+" cm":""}${p.weight_g?" • "+fmt(p.weight_g,0)+" g":""}</div>
              </div>
              <button class="btn danger" data-act="delPhoto" data-id="${p.id}">Löschen</button>
            </div>
            ${p.dataUrl ? `<img src="${p.dataUrl}" alt="Koi Foto" style="width:100%; border-radius:14px; margin-top:10px"/>` : ""}
          </div>
        `).join("") : `<div class="item"><div class="item__title">Noch keine Fotos</div><div class="item__meta">Füge das erste Bild hinzu.</div></div>`}
      </div>
    `,
    footHTML: `<button class="btn primary" id="close">Fertig</button>`,
    onMount(){
      $("#close").addEventListener("click", closeModal);
      $("#phFile").addEventListener("change", async (e)=>{
        const file = e.target.files?.[0];
        if(!file) return;
        const dataUrl = await fileToDataUrl(file);
        modalPhotoMeta({ koiId, dataUrl });
      });
      $$('[data-act="delPhoto"]').forEach(b=>b.addEventListener("click", ()=>deletePhoto(b.dataset.id, koiId)));
    }
  });
}

function modalPhotoMeta({koiId, dataUrl}){
  openModal({
    title: "Foto – Details",
    bodyHTML: `
      <div class="label">Datum</div>
      <input class="input" id="phDate" type="date" value="${new Date().toISOString().slice(0,10)}" />
      <div class="two">
        <div>
          <div class="label">Länge (cm) (optional)</div>
          <input class="input" id="phLen" type="number" step="0.1" placeholder="z.B. 45" />
        </div>
        <div>
          <div class="label">Gewicht (g) (optional)</div>
          <input class="input" id="phW" type="number" step="1" placeholder="z.B. 1300" />
        </div>
      </div>
      <img src="${dataUrl}" alt="Vorschau" style="width:100%; border-radius:14px; margin-top:10px" />
    `,
    footHTML: `
      <button class="btn" id="c">Abbrechen</button>
      <button class="btn primary" id="s">Speichern</button>
    `,
    onMount(){
      $("#c").addEventListener("click", closeModal);
      $("#s").addEventListener("click", async ()=>{
        const d = $("#phDate").value ? new Date($("#phDate").value + "T12:00:00") : new Date();
        const rec = {
          id: uid(),
          koiId,
          at: d.toISOString(),
          length_cm: num($("#phLen").value),
          weight_g: num($("#phW").value),
          dataUrl
        };
        await put(state.db, "koiPhotos", rec);
        await loadAll();
        toast("Foto gespeichert");
        openKoiPhotos(koiId);
      });
    }
  });
}

async function deletePhoto(photoId, koiId){
  if(!confirm("Foto wirklich löschen?")) return;
  await del(state.db, "koiPhotos", photoId);
  await loadAll();
  toast("Gelöscht");
  openKoiPhotos(koiId);
}

function openWaterLogs(pondId){
  const p = state.ponds.find(x=>x.id===pondId);
  if(!p) return;
  const logs = (state.waterLogs||[])
    .filter(w=>w.pondId===pondId)
    .slice()
    .sort((a,b)=>new Date(b.at)-new Date(a.at));
  openModal({
    title: `💧 Wasserwerte – ${p.name||"Teich"}`,
    bodyHTML: `
      <div class="row space" style="margin-bottom:10px">
        <p class="muted">Nitrit, Nitrat, pH, KH, GH, Sauerstoff – alles optional.</p>
        <button class="btn primary" id="add">+ Eintrag</button>
      </div>
      <div class="list">
        ${logs.length? logs.map(w=>`
          <div class="item">
            <div class="row space">
              <div>
                <div class="item__title">${new Date(w.at).toLocaleDateString("de-DE")}</div>
                <div class="item__meta">
                  ${waterLine(w)}
                </div>
              </div>
              <button class="btn danger" data-act="delWater" data-id="${w.id}">Löschen</button>
            </div>
          </div>
        `).join("") : `<div class="item"><div class="item__title">Noch keine Wasserwerte</div><div class="item__meta">Füge den ersten Mess‑Eintrag hinzu.</div></div>`}
      </div>
    `,
    footHTML: `<button class="btn primary" id="close">Fertig</button>`,
    onMount(){
      $("#close").addEventListener("click", closeModal);
      $("#add").addEventListener("click", ()=>modalWaterLog({pondId}));
      $$('[data-act="delWater"]').forEach(b=>b.addEventListener("click", ()=>deleteWaterLog(b.dataset.id, pondId)));
    }
  });
}

function modalWaterLog({pondId}){
  openModal({
    title: "Wasserwerte eintragen",
    bodyHTML: `
      <div class="label">Datum</div>
      <input class="input" id="wDate" type="date" value="${new Date().toISOString().slice(0,10)}" />
      <div class="two">
        <div><div class="label">Nitrit (mg/l)</div><input class="input" id="wNo2" type="number" step="0.01" /></div>
        <div><div class="label">Nitrat (mg/l)</div><input class="input" id="wNo3" type="number" step="0.1" /></div>
      </div>
      <div class="two">
        <div><div class="label">pH</div><input class="input" id="wPh" type="number" step="0.1" /></div>
        <div><div class="label">Sauerstoff (mg/l)</div><input class="input" id="wO2" type="number" step="0.1" /></div>
      </div>
      <div class="two">
        <div><div class="label">KH (°dH)</div><input class="input" id="wKh" type="number" step="0.1" /></div>
        <div><div class="label">GH (°dH)</div><input class="input" id="wGh" type="number" step="0.1" /></div>
      </div>
      <div class="label">Notiz</div>
      <textarea class="input" id="wNote" placeholder="optional"></textarea>
    `,
    footHTML: `
      <button class="btn" id="c">Abbrechen</button>
      <button class="btn primary" id="s">Speichern</button>
    `,
    onMount(){
      $("#c").addEventListener("click", closeModal);
      $("#s").addEventListener("click", async ()=>{
        const d = $("#wDate").value ? new Date($("#wDate").value + "T12:00:00") : new Date();
        const rec = {
          id: uid(),
          pondId,
          at: d.toISOString(),
          no2: num($("#wNo2").value),
          no3: num($("#wNo3").value),
          ph: num($("#wPh").value),
          kh: num($("#wKh").value),
          gh: num($("#wGh").value),
          o2: num($("#wO2").value),
          note: $("#wNote").value.trim()
        };
        await put(state.db, "waterLogs", rec);
        await loadAll();
        toast("Wasserwerte gespeichert");
        openWaterLogs(pondId);
      });
    }
  });
}

async function deleteWaterLog(id, pondId){
  if(!confirm("Eintrag wirklich löschen?")) return;
  await del(state.db, "waterLogs", id);
  await loadAll();
  toast("Gelöscht");
  openWaterLogs(pondId);
}

function waterLine(w){
  const parts = [];
  if(w.no2!=="" && w.no2!==undefined) parts.push(`NO₂ ${fmt(w.no2,2)}`);
  if(w.no3!=="" && w.no3!==undefined) parts.push(`NO₃ ${fmt(w.no3,0)}`);
  if(w.ph!=="" && w.ph!==undefined) parts.push(`pH ${fmt(w.ph,1)}`);
  if(w.kh!=="" && w.kh!==undefined) parts.push(`KH ${fmt(w.kh,0)}`);
  if(w.gh!=="" && w.gh!==undefined) parts.push(`GH ${fmt(w.gh,0)}`);
  if(w.o2!=="" && w.o2!==undefined) parts.push(`O₂ ${fmt(w.o2,1)}`);
  return parts.join(" • ") || "—";
}

function renderWaterSummary(){
  const byPond = new Map();
  for(const w of (state.waterLogs||[])){
    const pid = w.pondId || "";
    const prev = byPond.get(pid);
    if(!prev || new Date(w.at) > new Date(prev.at)) byPond.set(pid, w);
  }
  const items = Array.from(byPond.values())
    .sort((a,b)=>new Date(b.at)-new Date(a.at))
    .slice(0,4);
  if(items.length===0) return `<p>Noch keine Wasserwerte erfasst.</p>`;
  return `
    <div class="list">
      ${items.map(w=>{
        const pond = state.ponds.find(p=>p.id===w.pondId)?.name || "Teich";
        return `
          <div class="item">
            <div class="item__title">${escapeHtml(pond)} • ${new Date(w.at).toLocaleDateString("de-DE")}</div>
            <div class="item__meta">${waterLine(w)}</div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function buildGrowthSummary(){
  const rows = [];
  for(const k of state.koi){
    const ph = (state.koiPhotos||[])
      .filter(p=>p.koiId===k.id && (p.length_cm || p.weight_g))
      .slice()
      .sort((a,b)=>new Date(a.at)-new Date(b.at));
    if(ph.length < 2) continue;
    const first = ph[0];
    const last = ph[ph.length-1];
    const dDays = Math.max(1, Math.round((new Date(last.at)-new Date(first.at))/(24*60*60*1000)));

    // feed in same time window
    const from = new Date(first.at).getTime();
    const to = new Date(last.at).getTime();
    const feedG = state.logs
      .filter(l=>{ const t=new Date(l.at).getTime(); return t>=from && t<=to; })
      .reduce((a,l)=>a + (Number(l.amount_g)||0), 0);

    rows.push({
      name: k.name||"Koi",
      days: dDays,
      lenStart: first.length_cm||"",
      lenEnd: last.length_cm||"",
      wStart: first.weight_g||"",
      wEnd: last.weight_g||"",
      feedG
    });
  }

  if(rows.length===0){
    return { html: `<p>Noch nicht genug Daten. Lege pro Koi mindestens <b>2 Doku‑Einträge</b> mit Messwerten an.</p>` };
  }

  const table = `
    <div class="list">
      ${rows.slice(0,6).map(r=>`
        <div class="item">
          <div class="row space">
            <div>
              <div class="item__title">🐟 ${escapeHtml(r.name)}</div>
              <div class="item__meta">
                Zeitraum: ${fmt(r.days,0)} Tage • Futter: ${fmt(r.feedG/1000,2)} kg
              </div>
              <div class="item__meta">
                Länge: ${r.lenStart?fmt(r.lenStart,1):"—"} → ${r.lenEnd?fmt(r.lenEnd,1):"—"} cm • Gewicht: ${r.wStart?fmt(r.wStart,0):"—"} → ${r.wEnd?fmt(r.wEnd,0):"—"} g
              </div>
            </div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
  return { html: table };
}

function fileToDataUrl(file){
  return new Promise((res, rej)=>{
    const fr = new FileReader();
    fr.onload = ()=>res(fr.result);
    fr.onerror = ()=>rej(fr.error);
    fr.readAsDataURL(file);
  });
}

function openSettings(){
  openModal({
    title: "Einstellungen",
    bodyHTML: `
      <div class="item">
        <div class="row space">
          <div>
            <div class="item__title">Passwortschutz</div>
            <div class="item__meta">Für Test/privat. In Produktion kannst du es deaktivieren. (Passwort ist im Code fest.)</div>
          </div>
          <label class="badge" style="cursor:pointer">
            <input type="checkbox" id="sLock" ${state.settings.lockEnabled?"checked":""} />
            aktiv
          </label>
        </div>
</div>

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
        <input class="input" id="sFood" value="${escapeAttr(state.settings.defaultFood||"Allround")}" placeholder="Allround">
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
        state.settings.lockEnabled = $("#sLock").checked;
state.settings.weightMode = $("#sWeightMode").value;
        state.settings.weightFactor = clamp(Number($("#sFactor").value || 0.012), 0.001, 0.05);
        state.settings.defaultFood = ($("#sFood").value || "Allround").trim();
        state.settings.defaultGoal = $("#sGoal").value || "Erhalt";

        await saveSettings();
        closeModal();
        toast("Gespeichert");
        applyLockUI();
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
        applyLockUI();
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

/* Lock Screen */
function applyLockUI(){
  const lock = $("#lock");
  const enabled = !!state.settings.lockEnabled;
  if(!enabled){
    lock.hidden = true;
    document.body.style.overflow = "";
    return;
  }
  const ok = sessionStorage.getItem("kk_lock_ok")==="1";
  lock.hidden = ok;
  document.body.style.overflow = ok ? "" : "hidden";
}

$("#lockForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const pw = ($("#lockPw").value || "").trim();
  if(pw === LOCK_PASSWORD){
    sessionStorage.setItem("kk_lock_ok","1");
    $("#lockPw").value = "";
    applyLockUI();
    toast("Entsperrt");
  }else{
    toast("Falsches Passwort");
  }
});

async function init(){
  state.db = await openDB();
  await loadSettings();
  await loadAll();
  await ensureDefaults();
  await loadAll();
  applyLockUI();
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
