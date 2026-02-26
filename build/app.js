import { openDB, getAll, put, del, getMeta, setMeta, exportAll, importAll } from "./db.js";

/* ===========================
   Kodawari KoiFutter Kompass
   Rebuilt stable runtime (2026-02-25)
   =========================== */

const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));
const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

const GOALS = ["Erhalt","Wachstum","Konditionierung","Farbaufbau","Schonfütterung","Frühjahr/Herbst","Winter"];
const GOAL_RANGES = {
  "Erhalt": { min: 70, max: 80 },
  "Wachstum": { min: 100, max: 120 },
  "Konditionierung": { min: 90, max: 100 },
  "Farbaufbau": { min: 80, max: 100 },
  "Schonfütterung": { min: 30, max: 50 },
  "Frühjahr/Herbst": { min: 50, max: 70 },
  "Winter": { min: 0, max: 20 },
};

const PRESET_FOODS = [
  // Nutramare (Kodawari Koi Shop)
  { id:"nutramare_koibasic", name:"Nutramare Koi Basic", brand:"Nutramare", temp_min_c:12, temp_max_c:30, tags:["Erhalt"], url:"https://www.kodawari-koi.de/product-page/nutramare-koibasic" },
  { id:"nutramare_koi360_swim", name:"Nutramare Koi360", brand:"Nutramare", temp_min_c:12, temp_max_c:30, tags:["Erhalt","Konditionierung"], url:"https://www.kodawari-koi.de/product-page/nutramare-koi360-swim" },
  { id:"nutramare_koi360_sensitive", name:"Nutramare Koi360 Sensitive", brand:"Nutramare", temp_min_c:6, temp_max_c:10, tags:["Schonfütterung","Frühjahr/Herbst","Winter"], url:"https://www.kodawari-koi.de/product-page/nutramare-koi360-sensitive" },
  { id:"nutramare_koi360_goldplus", name:"Nutramare Koi360 Gold Plus", brand:"Nutramare", temp_min_c:16, temp_max_c:30, tags:["Farbaufbau"], url:"https://www.kodawari-koi.de/product-page/nutramare-koi360-gold-plus-swim" },
  { id:"nutramare_koi360_tosai", name:"Nutramare Koi360 Tosai Swim", brand:"Nutramare", temp_min_c:15, temp_max_c:30, tags:["Wachstum"], url:"https://www.kodawari-koi.de/product-page/nutramare-koi360-tosai-swim" },
  { id:"nutramare_wheatgerm", name:"Nutramare Koi360 Wheat Germ Swim", brand:"Nutramare", temp_min_c:8, temp_max_c:18, tags:["Schonfütterung","Frühjahr/Herbst"], url:"https://www.kodawari-koi.de/product-page/nutramare-koi360-wheat-germ-swim" },

  // Takazumi (Kodawari Koi Shop)
  { id:"takazumi_easy", name:"Takazumi Easy", brand:"Takazumi", temp_min_c:6, temp_max_c:10, tags:["Schonfütterung","Frühjahr/Herbst","Winter","Erhalt"], url:"https://www.kodawari-koi.de/product-page/takazumi-easy" },
  { id:"takazumi_mix", name:"Takazumi Mix", brand:"Takazumi", temp_min_c:10, temp_max_c:30, tags:["Erhalt","Farbaufbau"], url:"https://www.kodawari-koi.de/product-page/takazumi-mix" },
  { id:"takazumi_high_growth", name:"Takazumi High Growth", brand:"Takazumi", temp_min_c:18, temp_max_c:30, tags:["Wachstum","Konditionierung"], url:"https://www.kodawari-koi.de/product-page/takazumi-high-growth" },
  { id:"takazumi_gold_plus", name:"Takazumi Gold Plus", brand:"Takazumi", temp_min_c:16, temp_max_c:30, tags:["Farbaufbau"], url:"https://www.kodawari-koi.de/product-page/takazumi-gold-plus" },
];

const state = {
  db: null,
  route: "dash",
  ponds: [],
  koi: [],
  logs: [],
  foods: [],
  settings: {
    weightMode: "estimate",      // estimate | manual
    weightFactor: 0.012,         // used for L^3 estimate
    defaultGoal: "Erhalt",
    defaultFood: "Nutramare Koi360",
  },
};

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}

function fmt(n, d=0){
  const x = Number(n);
  if(!Number.isFinite(x)) return "0";
  return x.toLocaleString("de-DE",{maximumFractionDigits:d, minimumFractionDigits:d});
}

function clamp(n, a, b){ return Math.min(b, Math.max(a, n)); }

function normalizeGoal(g){
  const s = (g||"").trim();
  if(!s) return "Erhalt";
  if(s === "Konditionsaufbau") return "Konditionierung";
  if(s === "Farbentwicklung") return "Farbaufbau";
  return s;
}

function goalFactor(goal, tempC){
  const g = normalizeGoal(goal);
  const r = GOAL_RANGES[g] || GOAL_RANGES["Erhalt"];
  const mid = (Number(r.min) + Number(r.max)) / 2; // percent
  const t = Number(tempC);
  if(g === "Winter" && (!Number.isFinite(t) || t <= 8)) return 0;
  if(Number.isFinite(t) && t < 8) return 0;
  return mid / 100;
}

function recPercentByTemp(tempC){
  // Base % of biomass/day (very conservative)
  const t = Number(tempC);
  if(Number.isNaN(t)) return 0.01;
  if(t < 8) return 0.0;
  if(t < 12) return 0.002;
  if(t < 16) return 0.005;
  if(t < 20) return 0.010;
  if(t < 24) return 0.015;
  return 0.010;
}

function estimateWeightFromLengthCm(L){
  // Simple allometric estimate; user can switch to manual per koi
  const f = Number(state.settings.weightFactor) || 0.012;
  return Math.max(0, f * Math.pow(Number(L)||0, 3));
}

function koiWeight(k){
  if(state.settings.weightMode === "manual" && k.weight_g) return Number(k.weight_g) || 0;
  if(k.length_cm) return estimateWeightFromLengthCm(k.length_cm);
  return 0;
}

function totalWeightG(){
  return state.koi.reduce((a,k)=>a + koiWeight(k), 0);
}

function recommendedFeedGPerDay(tempC, goal){
  const biomass = totalWeightG();
  const pct = recPercentByTemp(tempC);
  const gf = goalFactor(goal, tempC);
  return biomass * pct * gf;
}

function foodLabel(f){
  const brand = f.brand ? `${f.brand} • ` : "";
  return `${brand}${f.name}`;
}

// Futterempfehlung: NUR nach deiner festen Temperatur-Tabelle.
function _foodById(id){
  return (state.foods||[]).find(f=>f.id===id) || null;
}

function _tableRecommendations(tempC, goal){
  const t = Number(tempC);
  const g = normalizeGoal(goal);
  if(!Number.isFinite(t)) return [];
  if(t < 6) return [];

  const N_SENS = "nutramare_koi360_sensitive";
  const N_BASIC = "nutramare_koibasic";
  const N_360 = "nutramare_koi360_swim";
  const N_TOSAI = "nutramare_koi360_tosai";
  const T_EASY = "takazumi_easy";
  const T_MIX = "takazumi_mix";
  const T_GOLD = "takazumi_gold_plus";
  const T_GROW = "takazumi_high_growth";
  const uniq = (ids)=>Array.from(new Set(ids)).map(_foodById).filter(Boolean);

  if(t >= 6 && t < 10){
    return uniq([N_SENS, T_EASY]);
  }
  if(t >= 10 && t < 12){
    if(g === "Wachstum" || g === "Farbaufbau") return uniq([T_MIX, N_BASIC]);
    return uniq([N_BASIC, T_MIX]);
  }
  if(t >= 12 && t < 15){
    if(g === "Farbaufbau") return uniq([T_GOLD, N_TOSAI]);
    return uniq([N_TOSAI, T_GOLD]);
  }
  if(t >= 15 && t < 20){
    if(g === "Wachstum") return uniq([T_GROW, N_360]);
    if(g === "Farbaufbau") return uniq([N_360, T_MIX]);
    if(g === "Konditionierung") return uniq([N_360, T_GOLD]);
    return uniq([N_360, T_GROW]);
  }
  if(t >= 20 && t <= 26){
    if(g === "Wachstum" || g === "Konditionierung") return uniq([T_GROW, N_360]);
    if(g === "Farbaufbau") return uniq([T_MIX, N_360]);
    return uniq([N_360, T_MIX]);
  }
  if(t > 26){
    if(g === "Farbaufbau") return uniq([T_GOLD, N_BASIC]);
    return uniq([N_BASIC, T_GOLD]);
  }
  return [];
}

function recommendFoodByTempAndGoal(tempC, goal){
  return _tableRecommendations(tempC, goal)[0] || null;
}

function recommendFoodsByTempAndGoal(tempC, goal, limit=3){
  return _tableRecommendations(tempC, goal).slice(0, limit);
}

function toast(msg){
  const el = $("#toast");
  if(!el) return alert(msg);
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"), 2200);
}

/* ---------- Modal ---------- */
function openModal({title, bodyHTML, footHTML, onMount}){
  $("#modalTitle").textContent = title || "—";
  $("#modalBody").innerHTML = bodyHTML || "";
  $("#modalFoot").innerHTML = footHTML || "";
  const m = $("#modal");
  m.setAttribute("aria-hidden","false");
  m.classList.add("open");

  const close = () => closeModal();
  $("#modalClose").onclick = close;
  m.addEventListener("click", (e)=>{ if(e.target === m) closeModal(); }, { once:true });

  if(typeof onMount === "function") onMount();
}
function closeModal(){
  const m = $("#modal");
  m.setAttribute("aria-hidden","true");
  m.classList.remove("open");
}

function setRoute(r){
  state.route = r;
  $$(".tab, .bottab").forEach(b=>b.classList.toggle("active", b.dataset.route === r));
  render();
}

/* ---------- Data ---------- */
async function loadAll(){
  state.ponds = await getAll(state.db, "ponds");
  state.koi   = await getAll(state.db, "koi");
  state.logs  = await getAll(state.db, "logs");
  try{ state.foods = await getAll(state.db, "foods"); }catch{ state.foods=[]; }
}

async function saveSettings(){
  await setMeta(state.db, "settings", state.settings);
}

async function loadSettings(){
  const s = await getMeta(state.db, "settings", null);
  if(s && typeof s === "object"){
    state.settings = { ...state.settings, ...s };
  }
  if(!GOALS.includes(state.settings.defaultGoal)) state.settings.defaultGoal = "Erhalt";
}

async function addMissingFoods(presets){
  const existing = new Set((state.foods||[]).map(f=>f.id));
  for(const f of presets){
    if(!existing.has(f.id)){
      await put(state.db, "foods", f);
    }
  }
  state.foods = await getAll(state.db, "foods");
}

async function purgeRemovedFoods(){
  // remove generic placeholders requested by Andre
  const removeIds = new Set(["food_allround","food_wheatgerm","food_growth","food_color"]);
  const all = state.foods || [];
  for(const f of all){
    if(removeIds.has(f.id)){
      await del(state.db, "foods", f.id);
    }
  }
  state.foods = await getAll(state.db, "foods");
}

async function ensureDefaults(){
  await addMissingFoods(PRESET_FOODS);
  await purgeRemovedFoods();
}

/* ---------- Views ---------- */
function deriveKpis(){
  const ponds = state.ponds.length;
  const koi = state.koi.length;
  const biomass = totalWeightG();
  const lastLog = state.logs.slice().sort((a,b)=>new Date(b.at)-new Date(a.at))[0] || null;
  return { ponds, koi, biomass, lastLog };
}

function viewDash(){
  const k = deriveKpis();
  const temp = state.ponds[0]?.temp_c ?? 18;
  const pct = recPercentByTemp(temp);
  const gf  = goalFactor(state.settings.defaultGoal, temp);
  const overallPct = pct * gf * 100;
  const rec = recommendedFeedGPerDay(temp, state.settings.defaultGoal);
  const recFood = recommendFoodByTempAndGoal(temp, state.settings.defaultGoal);

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

        <div class="row" style="margin-top:8px; flex-wrap:wrap">
          <span class="badge">Ziel: ${escapeHtml(state.settings.defaultGoal)}</span>
          <span class="badge">Temp‑Basis: ${fmt(pct*100,2)}%</span>
          <span class="badge">Ziel‑Faktor: ${fmt(gf*100,0)}%</span>
          <span class="badge">Gesamt: ${fmt(overallPct,2)}%</span>
        </div>

        <div class="row" style="margin-top:8px; flex-wrap:wrap">
          <span class="badge">Futter‑Tipp: ${escapeHtml(recFood ? foodLabel(recFood) : (state.settings.defaultFood || "—"))}</span>
        </div>

        <hr class="sep"/>
        <p>Empfehlung basiert auf Temperatur × Ziel × (Koi‑Gewicht). In den Einstellungen kannst du die Gewichtsschätzung & das Futterziel anpassen.</p>

        <div class="row" style="flex-wrap:wrap">
          <button class="btn primary" data-act="quickLog">+ Fütterung loggen</button>
          <button class="btn" data-act="addPond">+ Teich</button>
          <button class="btn" data-act="addKoi">+ Koi</button>
          ${recFood?.url ? `<a class="btn" href="${recFood.url}" target="_blank" rel="noopener">🛒 Empfohlenes Futter bestellen</a>` :
            `<a class="btn" href="https://www.kodawari-koi.de/category/koi-futter" target="_blank" rel="noopener">🛒 Futter nachbestellen</a>`}
          <button class="btn" data-act="settings">⚙️ Einstellungen</button>
        </div>
      </section>

      <aside class="card">
        <h3>Letzter Eintrag</h3>
        ${k.lastLog ? `
          <div class="item">
            <div class="item__title">${new Date(k.lastLog.at).toLocaleString("de-DE")}</div>
            <div class="item__meta">${fmt(k.lastLog.amount_g,0)} g • ${escapeHtml(k.lastLog.food || state.settings.defaultFood)}</div>
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
      ${list.length ? `
        <div class="list">
          ${list.map(p=>`
            <div class="item">
              <div>
                <div class="item__title">${escapeHtml(p.name||"Teich")}</div>
                <div class="item__meta">Temp: ${fmt(p.temp_c ?? "—", 1)} °C • Volumen: ${fmt(p.volume_l ?? "—",0)} L</div>
              </div>
              <div class="row">
                <button class="btn small" data-act="editPond" data-id="${p.id}">Bearbeiten</button>
                <button class="btn small danger" data-act="delPond" data-id="${p.id}">Löschen</button>
              </div>
            </div>
          `).join("")}
        </div>
      ` : `<p>Noch keine Teiche. Leg jetzt deinen ersten an.</p>`}
    </section>
  `;
}

function viewKoi(){
  const list = state.koi.slice().sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  return `
    <section class="card">
      <div class="row space">
        <h2>Koi</h2>
        <button class="btn primary" data-act="addKoi">+ Koi hinzufügen</button>
      </div>
      ${list.length ? `
        <div class="list">
          ${list.map(k=>`
            <div class="item">
              <div>
                <div class="item__title">${escapeHtml(k.name||"Koi")}</div>
                <div class="item__meta">Länge: ${fmt(k.length_cm ?? "—",0)} cm • Gewicht: ${fmt(koiWeight(k)/1000,2)} kg</div>
              </div>
              <div class="row">
                <button class="btn small" data-act="editKoi" data-id="${k.id}">Bearbeiten</button>
                <button class="btn small danger" data-act="delKoi" data-id="${k.id}">Löschen</button>
              </div>
            </div>
          `).join("")}
        </div>
      ` : `<p>Noch keine Koi. Leg jetzt deinen ersten an.</p>`}
    </section>
  `;
}

function viewCalc(){
  const temp = state.ponds[0]?.temp_c ?? 18;
  const biomass = totalWeightG();
  const pct = recPercentByTemp(temp);
  const gf  = goalFactor(state.settings.defaultGoal, temp);
  const grams = biomass * pct * gf;
  const foods = recommendFoodsByTempAndGoal(temp, state.settings.defaultGoal, 3);

  return `
    <section class="card">
      <div class="row space">
        <h2>Rechner</h2>
        <button class="btn" data-act="settings">⚙️ Einstellungen</button>
      </div>

      <div class="grid2">
        <div>
          <div class="label">Temperatur (°C)</div>
          <input id="calcTemp" class="input" type="number" step="0.5" value="${escapeHtml(temp)}"/>
        </div>
        <div>
          <div class="label">Fütterungsziel</div>
          <select id="calcGoal" class="input">
            ${GOALS.map(g=>`<option value="${g}" ${g===state.settings.defaultGoal?"selected":""}>${escapeHtml(g)}</option>`).join("")}
          </select>
        </div>
      </div>

      <div class="kpi" style="margin-top:10px">
        <div class="kpi__item"><div class="kpi__label">Biomasse</div><div class="kpi__value">${fmt(biomass/1000,2)} kg</div></div>
        <div class="kpi__item"><div class="kpi__label">Temp‑Basis</div><div class="kpi__value">${fmt(pct*100,2)}%</div></div>
        <div class="kpi__item"><div class="kpi__label">Ziel‑Faktor</div><div class="kpi__value">${fmt(gf*100,0)}%</div></div>
        <div class="kpi__item"><div class="kpi__label">Empfehlung/Tag</div><div class="kpi__value">${fmt(grams,0)} g</div></div>
      </div>

      <hr class="sep"/>
      <h3>Futterempfehlung</h3>
      ${foods.length ? `
        <div class="list">
          ${foods.map(f=>`
            <div class="item">
              <div>
                <div class="item__title">${escapeHtml(foodLabel(f))}</div>
                <div class="item__meta">Temp: ${fmt(f.temp_min_c ?? "—",0)}–${fmt(f.temp_max_c ?? "—",0)} °C • Tags: ${(f.tags||[]).map(escapeHtml).join(", ")}</div>
              </div>
              <div class="row">
                ${f.url ? `<a class="btn small" href="${f.url}" target="_blank" rel="noopener">Öffnen</a>` : ``}
              </div>
            </div>
          `).join("")}
        </div>
      ` : `<p>Keine passenden Futtersorten gefunden. Öffne Einstellungen → Futtersorten verwalten.</p>`}
    </section>
  `;
}

function viewLog(){
  const list = state.logs.slice().sort((a,b)=>new Date(b.at)-new Date(a.at));
  return `
    <section class="card">
      <div class="row space">
        <h2>Logbuch</h2>
        <button class="btn primary" data-act="quickLog">+ Eintrag</button>
      </div>
      ${list.length ? `
        <div class="list">
          ${list.map(l=>`
            <div class="item">
              <div>
                <div class="item__title">${new Date(l.at).toLocaleString("de-DE")}</div>
                <div class="item__meta">${fmt(l.amount_g,0)} g • ${escapeHtml(l.food || state.settings.defaultFood)}${l.pondId ? " • " + escapeHtml(state.ponds.find(p=>p.id===l.pondId)?.name || "Teich") : ""}</div>
                ${l.note ? `<div class="item__meta">${escapeHtml(l.note)}</div>` : ""}
              </div>
              <div class="row">
                <button class="btn small danger" data-act="delLog" data-id="${l.id}">Löschen</button>
              </div>
            </div>
          `).join("")}
        </div>
      ` : `<p>Noch keine Einträge.</p>`}
    </section>
  `;
}

function viewStats(){
  const biomass = totalWeightG();
  const avgTemp = state.ponds.length ? (state.ponds.reduce((a,p)=>a+Number(p.temp_c||0),0)/state.ponds.length) : 0;
  return `
    <section class="card">
      <div class="row space">
        <h2>Auswertung</h2>
        <button class="btn" data-act="dataTools">📦 Export/Import</button>
      </div>
      <div class="kpi">
        <div class="kpi__item"><div class="kpi__label">Teiche</div><div class="kpi__value">${state.ponds.length}</div></div>
        <div class="kpi__item"><div class="kpi__label">Koi</div><div class="kpi__value">${state.koi.length}</div></div>
        <div class="kpi__item"><div class="kpi__label">Biomasse</div><div class="kpi__value">${fmt(biomass/1000,2)} kg</div></div>
        <div class="kpi__item"><div class="kpi__label">Ø Temp</div><div class="kpi__value">${fmt(avgTemp,1)} °C</div></div>
      </div>
      <hr class="sep"/>
      <p>Mehr Auswertungen (Verlauf, Kosten, Wachstum) kann ich dir als nächstes sauber ergänzen – erstmal läuft wieder alles stabil.</p>
    </section>
  `;
}

function render(){
  const v = $("#view");
  if(!v) return;

  if(state.route === "dash") v.innerHTML = viewDash();
  else if(state.route === "ponds") v.innerHTML = viewPonds();
  else if(state.route === "koi") v.innerHTML = viewKoi();
  else if(state.route === "calc") v.innerHTML = viewCalc();
  else if(state.route === "log") v.innerHTML = viewLog();
  else if(state.route === "stats") v.innerHTML = viewStats();
  else v.innerHTML = viewDash();

  bindViewActions();
}

/* ---------- Actions ---------- */
function bindViewActions(){
  // route buttons
  $$(".tab, .bottab").forEach(b=>{
    b.onclick = ()=> setRoute(b.dataset.route);
  });

  $$("[data-act]").forEach(el=>{
    el.onclick = (e)=>{
      const act = el.dataset.act;
      const id = el.dataset.id;
      if(act === "addPond") return openPondModal();
      if(act === "editPond") return openPondModal(id);
      if(act === "delPond") return deletePond(id);

      if(act === "addKoi") return openKoiModal();
      if(act === "editKoi") return openKoiModal(id);
      if(act === "delKoi") return deleteKoi(id);

      if(act === "quickLog") return openLogModal();
      if(act === "delLog") return deleteLog(id);

      if(act === "settings") return openSettingsModal();
      if(act === "dataTools") return openDataTools();
    };
  });

  const calcTemp = $("#calcTemp");
  const calcGoal = $("#calcGoal");
  if(calcTemp) calcTemp.oninput = ()=> {
    // update temp in first pond if exists (nice UX)
    if(state.ponds[0]){
      const p = {...state.ponds[0], temp_c: Number(calcTemp.value)};
      put(state.db,"ponds",p).then(loadAll).then(()=>render()).catch(()=>render());
    }else{
      render();
    }
  };
  if(calcGoal) calcGoal.onchange = async ()=> {
    state.settings.defaultGoal = calcGoal.value;
    await saveSettings();
    render();
  };
}

/* ---------- CRUD modals ---------- */
function openPondModal(id=null){
  const p = id ? state.ponds.find(x=>x.id===id) : null;
  openModal({
    title: p ? "Teich bearbeiten" : "Teich hinzufügen",
    bodyHTML: `
      <div class="field"><div class="label">Name</div><input id="pName" class="input" value="${escapeHtml(p?.name||"")}" /></div>
      <div class="grid2">
        <div class="field"><div class="label">Temperatur (°C)</div><input id="pTemp" class="input" type="number" step="0.5" value="${escapeHtml(p?.temp_c ?? 18)}" /></div>
        <div class="field"><div class="label">Volumen (Liter)</div><input id="pVol" class="input" type="number" step="1" value="${escapeHtml(p?.volume_l ?? "")}" /></div>
      </div>
    `,
    footHTML: `
      <button class="btn" id="mCancel">Abbrechen</button>
      <button class="btn primary" id="mSave">Speichern</button>
    `,
    onMount(){
      $("#mCancel").onclick = closeModal;
      $("#mSave").onclick = async ()=>{
        const obj = {
          id: p?.id || uid(),
          name: $("#pName").value.trim() || "Teich",
          temp_c: Number($("#pTemp").value),
          volume_l: $("#pVol").value ? Number($("#pVol").value) : null,
        };
        await put(state.db, "ponds", obj);
        await loadAll();
        closeModal();
        toast("Gespeichert");
        render();
      };
    }
  });
}

async function deletePond(id){
  if(!id) return;
  if(!confirm("Teich wirklich löschen?")) return;
  await del(state.db, "ponds", id);
  // also detach koi/log pond references
  for(const k of state.koi){
    if(k.pondId === id) await put(state.db,"koi",{...k, pondId:null});
  }
  for(const l of state.logs){
    if(l.pondId === id) await put(state.db,"logs",{...l, pondId:null});
  }
  await loadAll();
  toast("Gelöscht");
  render();
}

function openKoiModal(id=null){
  const k = id ? state.koi.find(x=>x.id===id) : null;
  openModal({
    title: k ? "Koi bearbeiten" : "Koi hinzufügen",
    bodyHTML: `
      <div class="field"><div class="label">Name</div><input id="kName" class="input" value="${escapeHtml(k?.name||"")}" /></div>
      <div class="grid2">
        <div class="field"><div class="label">Länge (cm)</div><input id="kLen" class="input" type="number" step="1" value="${escapeHtml(k?.length_cm ?? "")}" /></div>
        <div class="field"><div class="label">Gewicht (g) (optional)</div><input id="kW" class="input" type="number" step="1" value="${escapeHtml(k?.weight_g ?? "")}" /></div>
      </div>
      <div class="field">
        <div class="label">Teich (optional)</div>
        <select id="kPond" class="input">
          <option value="">—</option>
          ${state.ponds.map(p=>`<option value="${p.id}" ${k?.pondId===p.id?"selected":""}>${escapeHtml(p.name||"Teich")}</option>`).join("")}
        </select>
      </div>
    `,
    footHTML: `
      <button class="btn" id="mCancel">Abbrechen</button>
      <button class="btn primary" id="mSave">Speichern</button>
    `,
    onMount(){
      $("#mCancel").onclick = closeModal;
      $("#mSave").onclick = async ()=>{
        const obj = {
          id: k?.id || uid(),
          name: $("#kName").value.trim() || "Koi",
          length_cm: $("#kLen").value ? Number($("#kLen").value) : null,
          weight_g: $("#kW").value ? Number($("#kW").value) : null,
          pondId: $("#kPond").value || null,
        };
        await put(state.db, "koi", obj);
        await loadAll();
        closeModal();
        toast("Gespeichert");
        render();
      };
    }
  });
}

async function deleteKoi(id){
  if(!id) return;
  if(!confirm("Koi wirklich löschen?")) return;
  await del(state.db, "koi", id);
  await loadAll();
  toast("Gelöscht");
  render();
}

function openLogModal(){
  openModal({
    title: "Fütterung loggen",
    bodyHTML: `
      <div class="grid2">
        <div class="field">
          <div class="label">Menge (g)</div>
          <input id="lAmt" class="input" type="number" step="1" value="${fmt(recommendedFeedGPerDay(state.ponds[0]?.temp_c ?? 18, state.settings.defaultGoal),0)}"/>
        </div>
        <div class="field">
          <div class="label">Teich</div>
          <select id="lPond" class="input">
            <option value="">—</option>
            ${state.ponds.map(p=>`<option value="${p.id}">${escapeHtml(p.name||"Teich")}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="field">
        <div class="label">Futter</div>
        <select id="lFood" class="input">
          ${state.foods.slice().sort((a,b)=>foodLabel(a).localeCompare(foodLabel(b))).map(f=>`<option value="${escapeHtml(f.name)}">${escapeHtml(foodLabel(f))}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <div class="label">Notiz (optional)</div>
        <input id="lNote" class="input" placeholder="z.B. aufgeteilt auf 3 Portionen" />
      </div>
    `,
    footHTML: `
      <button class="btn" id="mCancel">Abbrechen</button>
      <button class="btn primary" id="mSave">Speichern</button>
    `,
    onMount(){
      $("#mCancel").onclick = closeModal;
      $("#mSave").onclick = async ()=>{
        const obj = {
          id: uid(),
          at: new Date().toISOString(),
          amount_g: Number($("#lAmt").value || 0),
          pondId: $("#lPond").value || null,
          food: $("#lFood").value || state.settings.defaultFood,
          note: $("#lNote").value.trim() || "",
        };
        await put(state.db, "logs", obj);
        await loadAll();
        closeModal();
        toast("Geloggt");
        render();
      };
    }
  });
}

async function deleteLog(id){
  if(!id) return;
  if(!confirm("Eintrag löschen?")) return;
  await del(state.db, "logs", id);
  await loadAll();
  toast("Gelöscht");
  render();
}

function openSettingsModal(){
  openModal({
    title: "Einstellungen",
    bodyHTML: `
      <div class="grid2">
        <div class="field">
          <div class="label">Gewichtsbasis</div>
          <select id="sMode" class="input">
            <option value="estimate" ${state.settings.weightMode==="estimate"?"selected":""}>Schätzen (Länge)</option>
            <option value="manual" ${state.settings.weightMode==="manual"?"selected":""}>Manuell (Gewicht)</option>
          </select>
        </div>
        <div class="field">
          <div class="label">Faktor (L³ → g)</div>
          <input id="sFactor" class="input" type="number" step="0.001" value="${escapeHtml(state.settings.weightFactor)}"/>
        </div>
      </div>

      <div class="grid2">
        <div class="field">
          <div class="label">Standard‑Ziel</div>
          <select id="sGoal" class="input">
            ${GOALS.map(g=>`<option value="${g}" ${g===state.settings.defaultGoal?"selected":""}>${escapeHtml(g)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <div class="label">Standard‑Futter</div>
          <input id="sFood" class="input" value="${escapeHtml(state.settings.defaultFood||"")}" />
        </div>
      </div>

      <div class="row" style="margin-top:10px; flex-wrap:wrap">
        <button class="btn" data-act="manageFoods" id="btnFoods">Futtersorten verwalten</button>
        <button class="btn" data-act="dataTools" id="btnData">Export/Import</button>
      </div>
    `,
    footHTML: `
      <button class="btn" id="mCancel">Abbrechen</button>
      <button class="btn primary" id="mSave">Speichern</button>
    `,
    onMount(){
      $("#mCancel").onclick = closeModal;
      $("#mSave").onclick = async ()=>{
        state.settings.weightMode = $("#sMode").value;
        state.settings.weightFactor = clamp(Number($("#sFactor").value || 0.012), 0.001, 0.05);
        state.settings.defaultGoal = $("#sGoal").value || "Erhalt";
        state.settings.defaultFood = $("#sFood").value.trim() || "Nutramare Koi360";
        await saveSettings();
        closeModal();
        toast("Gespeichert");
        render();
      };
      $("#btnFoods").onclick = ()=> openFoodManager();
      $("#btnData").onclick = ()=> openDataTools();
    }
  });
}

function openFoodManager(){
  const sorted = state.foods.slice().sort((a,b)=>foodLabel(a).localeCompare(foodLabel(b)));
  openModal({
    title: "Futtersorten",
    bodyHTML: `
      <p>Hier kannst du eigene Futtersorten hinzufügen. (Hinweis: „Allround/Color/Wheatgerm/Growth“ Platzhalter wurden entfernt.)</p>
      <div class="list">
        ${sorted.map(f=>`
          <div class="item">
            <div>
              <div class="item__title">${escapeHtml(foodLabel(f))}</div>
              <div class="item__meta">Temp: ${fmt(f.temp_min_c??"—",0)}–${fmt(f.temp_max_c??"—",0)} °C • Tags: ${(f.tags||[]).map(escapeHtml).join(", ")}</div>
            </div>
            <div class="row">
              <button class="btn small danger" data-act="delFood" data-id="${f.id}">Löschen</button>
            </div>
          </div>
        `).join("")}
      </div>
      <hr class="sep"/>
      <h3>Neu hinzufügen</h3>
      <div class="field"><div class="label">Name</div><input id="fName" class="input" placeholder="z.B. Nutramare Koi360"/></div>
      <div class="field"><div class="label">Brand (optional)</div><input id="fBrand" class="input" placeholder="Nutramare"/></div>
      <div class="grid2">
        <div class="field"><div class="label">Temp min</div><input id="fMin" class="input" type="number" step="1" value="12"/></div>
        <div class="field"><div class="label">Temp max</div><input id="fMax" class="input" type="number" step="1" value="30"/></div>
      </div>
      <div class="field"><div class="label">Tags (kommagetrennt)</div><input id="fTags" class="input" placeholder="Erhalt, Wachstum"/></div>
      <div class="field"><div class="label">URL (optional)</div><input id="fUrl" class="input" placeholder="https://..."/></div>
    `,
    footHTML: `
      <button class="btn" id="mCancel">Schließen</button>
      <button class="btn primary" id="mAdd">Hinzufügen</button>
    `,
    onMount(){
      $("#mCancel").onclick = closeModal;
      $("#mAdd").onclick = async ()=>{
        const name = $("#fName").value.trim();
        if(!name) return toast("Bitte Name eingeben");
        const obj = {
          id: uid(),
          name,
          brand: $("#fBrand").value.trim(),
          temp_min_c: Number($("#fMin").value),
          temp_max_c: Number($("#fMax").value),
          tags: $("#fTags").value.split(",").map(s=>s.trim()).filter(Boolean),
          url: $("#fUrl").value.trim(),
        };
        await put(state.db, "foods", obj);
        await loadAll();
        closeModal();
        toast("Futter hinzugefügt");
        render();
      };

      $$("[data-act='delFood']").forEach(btn=>{
        btn.onclick = async ()=>{
          if(!confirm("Futtersorte löschen?")) return;
          await del(state.db,"foods", btn.dataset.id);
          await loadAll();
          openFoodManager();
        };
      });
    }
  });
}

function openDataTools(){
  openModal({
    title: "Export / Import",
    bodyHTML: `
      <p>Du kannst hier alles sichern oder auf ein anderes Gerät übernehmen.</p>
      <div class="row" style="flex-wrap:wrap">
        <button class="btn" id="btnExport">Export JSON</button>
        <label class="btn" style="cursor:pointer">
          Import JSON
          <input id="fileImport" type="file" accept="application/json" style="display:none" />
        </label>
        <button class="btn danger" id="btnReset">Alles zurücksetzen</button>
      </div>
      <pre class="code" id="exportBox" style="display:none; margin-top:10px; max-height:260px; overflow:auto;"></pre>
    `,
    footHTML: `<button class="btn" id="mClose">Schließen</button>`,
    onMount(){
      $("#mClose").onclick = closeModal;
      $("#btnExport").onclick = async ()=>{
        const data = await exportAll(state.db);
        const txt = JSON.stringify(data, null, 2);
        const box = $("#exportBox");
        box.style.display = "block";
        box.textContent = txt;
        try{
          await navigator.clipboard.writeText(txt);
          toast("Export in Zwischenablage kopiert");
        }catch{
          toast("Export angezeigt (Kopieren manuell)");
        }
      };
      $("#fileImport").onchange = async (e)=>{
        const f = e.target.files?.[0];
        if(!f) return;
        const txt = await f.text();
        const data = JSON.parse(txt);
        await importAll(state.db, data);
        await loadAll();
        await loadSettings();
        closeModal();
        toast("Import fertig");
        render();
      };
      $("#btnReset").onclick = async ()=>{
        if(!confirm("Wirklich ALLES löschen?")) return;
        // easiest reset: re-init db by clearing stores via importAll(empty)
        await importAll(state.db, { ponds:[], koi:[], logs:[], foods:[], koiPhotos:[], waterLogs:[], reminders:[], settings: null });
        await loadAll();
        state.settings = { weightMode:"estimate", weightFactor:0.012, defaultGoal:"Erhalt", defaultFood:"Nutramare Koi360" };
        await saveSettings();
        await ensureDefaults();
        await loadAll();
        closeModal();
        toast("Zurückgesetzt");
        render();
      };
    }
  });
}

/* ---------- SW ---------- */
async function registerSW(){
  if("serviceWorker" in navigator){
    try{
      const reg = await navigator.serviceWorker.register("./sw.js");

      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", ()=>{
        if(refreshing) return;
        refreshing = true;
        window.location.reload();
      });

      reg.addEventListener("updatefound", ()=>{
        const nw = reg.installing;
        if(!nw) return;
        nw.addEventListener("statechange", ()=>{
          if(nw.state === "installed" && navigator.serviceWorker.controller){
            try{ nw.postMessage({ type: "SKIP_WAITING" }); }catch{}
          }
        });
      });

      try{ await reg.update(); }catch{}
    }
    catch(err){ console.warn("SW failed", err); }
  }
}

/* ---------- Init ---------- */
async function init(){
  state.db = await openDB();
  await loadSettings();
  await loadAll();
  await ensureDefaults();
  await loadAll();

  // Route from hash
  const h = (location.hash||"").replace("#","");
  if(h && ["dash","ponds","koi","calc","log","stats"].includes(h)) state.route = h;

  render();
  await registerSW();

  // Install prompt
  const btnInstall = $("#btnInstall");
  if(btnInstall) btnInstall.style.display = "none";
  window.addEventListener("beforeinstallprompt", (e)=>{
    e.preventDefault();
    window.__deferredInstall = e;
    if(btnInstall) btnInstall.style.display = "inline-flex";
  });
  if(btnInstall){
    btnInstall.onclick = async ()=>{
      const d = window.__deferredInstall;
      if(!d) return toast("Installation nicht verfügbar");
      d.prompt();
      await d.userChoice;
      window.__deferredInstall = null;
      btnInstall.style.display = "none";
    };
  }
}

init().catch(err=>{
  console.error(err);
  const v = $("#view");
  if(v) v.innerHTML = `<section class="card"><h2>Fehler</h2><p>Die App konnte nicht starten.</p><pre class="code">${escapeHtml(String(err && err.stack || err))}</pre></section>`;
});
