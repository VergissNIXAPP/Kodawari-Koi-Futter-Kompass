import { openDB, getAll, put, del, getMeta, setMeta, exportAll, importAll } from "./db.js";

const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));
const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

const LOCK_PASSWORD = "koi"; // Nur hier im Code ändern

const state = {
  route: "dash",
  db: null,
  ponds: [],
  koi: [],
  logs: [],
  settings: {
    lockEnabled: true,
    weightMode: "estimate", // estimate|manual
    weightFactor: 0.012, // g per cm^3 factor
    tempUnit: "C",
    defaultFood: "Allround",
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

function totalBiomassG(){
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

function recommendedFeedGPerDay(tempC){
  const biomass = totalBiomassG();
  const pct = recPercentByTemp(tempC);
  return biomass * pct;
}

function deriveKpis(){
  const ponds = state.ponds.length;
  const koi = state.koi.length;
  const biomass = totalBiomassG();
  const lastLog = state.logs
    .slice()
    .sort((a,b)=>new Date(b.at)-new Date(a.at))[0] || null;
  return { ponds, koi, biomass, lastLog };
}

async function loadAll(){
  state.ponds = await getAll(state.db, "ponds");
  state.koi = await getAll(state.db, "koi");
  state.logs = await getAll(state.db, "logs");
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

  // bind actions
  bindViewActions();
}

function viewDash(){
  const k = deriveKpis();
  const temp = state.ponds[0]?.temp_c ?? 18;
  const rec = recommendedFeedGPerDay(temp);
  return `
    <div class="grid">
      <section class="card">
        <h2>Übersicht</h2>
        <div class="kpi">
          <div class="kpi__item"><div class="kpi__label">Teiche</div><div class="kpi__value">${k.ponds}</div></div>
          <div class="kpi__item"><div class="kpi__label">Koi</div><div class="kpi__value">${k.koi}</div></div>
          <div class="kpi__item"><div class="kpi__label">Biomasse (geschätzt)</div><div class="kpi__value">${fmt(k.biomass/1000,2)} kg</div></div>
          <div class="kpi__item"><div class="kpi__label">Empfehlung/Tag</div><div class="kpi__value">${fmt(rec,0)} g</div></div>
        </div>
        <hr class="sep"/>
        <p>
          Empfehlung basiert auf Temperatur & Biomasse. In den Einstellungen kannst du die Gewichtsschätzung anpassen.
        </p>
        <div class="row">
          <button class="btn primary" data-act="quickLog">+ Fütterung loggen</button>
          <button class="btn" data-act="addPond">+ Teich</button>
          <button class="btn" data-act="addKoi">+ Koi</button>
          <a class="btn" href="https://www.kodawari-koi.de/" target="_blank" rel="noopener">🛒 Futter nachbestellen</a>
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
        <button class="btn" data-act="editPond" data-id="${p.id}">Bearbeiten</button>
        <button class="btn danger" data-act="delPond" data-id="${p.id}">Löschen</button>
      </div>
    </div>
  `;
}

function viewKoi(){
  const list = state.koi.slice().sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  const biomass = totalBiomassG();
  return `
    <section class="card">
      <div class="row space">
        <h2>Koi</h2>
        <button class="btn primary" data-act="addKoi">+ Koi hinzufügen</button>
      </div>
      <p>Gewicht ist ${state.settings.weightMode==="manual" ? "manuell" : "geschätzt"} (in Settings umstellbar). Biomasse: <b>${fmt(biomass/1000,2)} kg</b>.</p>
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
        <button class="btn" data-act="editKoi" data-id="${k.id}">Bearbeiten</button>
        <button class="btn danger" data-act="delKoi" data-id="${k.id}">Löschen</button>
      </div>
    </div>
  `;
}

function viewCalc(){
  const ponds = state.ponds.slice().sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  const defaultTemp = ponds[0]?.temp_c ?? 18;
  const biomass = totalBiomassG();
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
          <div class="label">Biomasse</div>
          <div class="badge">≈ ${fmt(biomass/1000,2)} kg</div>
        </div>
        <div>
          <div class="label">Futtertyp</div>
          <input class="input" id="calcFood" placeholder="z.B. ${state.settings.defaultFood}" value="${escapeHtml(state.settings.defaultFood||"")}">
        </div>
      </div>

      <hr class="sep"/>

      <div class="row space">
        <div>
          <div class="item__title">Empfehlung pro Tag</div>
          <div class="item__meta" id="calcOut">—</div>
        </div>
        <button class="btn primary" data-act="calcNow">Berechnen</button>
      </div>

      <div class="row" style="margin-top:10px">
        <button class="btn" data-act="split3">Auf 3 Fütterungen</button>
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

function logItem(l){
  const pond = l.pondId ? (state.ponds.find(p=>p.id===l.pondId)?.name || "Teich") : "";
  return `
    <div class="item">
      <div class="row space">
        <div>
          <div class="item__title">📝 ${new Date(l.at).toLocaleString("de-DE")}</div>
          <div class="item__meta">${fmt(l.amount_g,0)} g • ${escapeHtml(l.food || state.settings.defaultFood || "Futter")}${pond? " • "+escapeHtml(pond):""}</div>
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
        if(act==="split3") return splitN(3);
        if(act==="split5") return splitN(5);
        if(act==="logFromCalc") return logFromCalc();
        if(act==="openEngineInfo") return engineInfo();
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
        <li>Biomasse = Summe der Koi‑Gewichte. (Gewicht entweder manuell oder aus Länge geschätzt.)</li>
        <li>Temperatur → Futter‑Prozent/Tag (sehr grob):</li>
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
  const rec = recommendedFeedGPerDay(t);
  const out = $("#calcOut");
  if(out){
    const pct = recPercentByTemp(t)*100;
    out.innerHTML = `<b>${fmt(rec,0)} g</b> pro Tag <span class="badge">${fmt(pct,2)}%</span>`;
  }
  if(!silent) toast("Berechnet");
}

function splitN(n){
  const t = Number($("#calcTemp")?.value ?? 18);
  const rec = recommendedFeedGPerDay(t);
  toast(`${fmt(rec/n,0)} g pro Fütterung (×${n})`);
}

function logFromCalc(){
  const t = Number($("#calcTemp")?.value ?? 18);
  const amount = Math.round(recommendedFeedGPerDay(t));
  modalLog({ amount_g: amount, food: $("#calcFood")?.value || state.settings.defaultFood, pondId: $("#calcPond")?.value || "" });
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
  const l = existing || { id: uid(), at: new Date().toISOString(), amount_g:"", food: state.settings.defaultFood, pondId:"", note:"" };
  const dtLocal = isoToLocalInput(l.at);
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
          <input class="input" id="lFood" value="${escapeAttr(l.food||"")}" placeholder="z.B. ${state.settings.defaultFood}">
        </div>
        <div>
          <div class="label">Teich (optional)</div>
          <select id="lPond" class="input">
            <option value="">—</option>
            ${ponds.map(p=>`<option value="${p.id}" ${p.id===l.pondId?"selected":""}>${escapeHtml(p.name||"Teich")}</option>`).join("")}
          </select>
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
      $("#lCancel").addEventListener("click", closeModal);
      $("#lSave").addEventListener("click", async ()=>{
        const upd = {
          id: l.id,
          at: localInputToIso($("#lAt").value) || new Date().toISOString(),
          amount_g: num($("#lAmt").value),
          food: $("#lFood").value.trim() || state.settings.defaultFood,
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

        await saveSettings();
        closeModal();
        toast("Gespeichert");
        applyLockUI();
        render();
      });
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
  applyLockUI();
  render();
  await registerSW();

  // Hide install button until available (except iOS – still show on wide screens)
  $("#btnInstall").style.display = "none";
  // iOS detection: show "Install" tip as button on iOS
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  if(isIOS) $("#btnInstall").style.display = "inline-flex";
}

init();
