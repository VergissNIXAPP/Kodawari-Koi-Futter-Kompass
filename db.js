// Minimal IndexedDB helper (no deps)
const DB_NAME = "kodawari_koi_db";
// v2 adds: foods, koiPhotos, waterLogs, reminders
const DB_VER = 2;

function reqToPromise(req){
  return new Promise((res, rej)=>{
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function openDB(){
  const req = indexedDB.open(DB_NAME, DB_VER);
  req.onupgradeneeded = (e)=>{
    const db = req.result;
    if(!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    if(!db.objectStoreNames.contains("ponds")) db.createObjectStore("ponds", { keyPath:"id" });
    if(!db.objectStoreNames.contains("koi")) db.createObjectStore("koi", { keyPath:"id" });
    if(!db.objectStoreNames.contains("logs")) db.createObjectStore("logs", { keyPath:"id" });
    if(!db.objectStoreNames.contains("foods")) db.createObjectStore("foods", { keyPath:"id" });
    if(!db.objectStoreNames.contains("koiPhotos")) db.createObjectStore("koiPhotos", { keyPath:"id" });
    if(!db.objectStoreNames.contains("waterLogs")) db.createObjectStore("waterLogs", { keyPath:"id" });
    if(!db.objectStoreNames.contains("reminders")) db.createObjectStore("reminders", { keyPath:"id" });
  };
  return reqToPromise(req);
}

export function tx(db, storeName, mode="readonly"){
  return db.transaction(storeName, mode).objectStore(storeName);
}

export async function getAll(db, storeName){
  return reqToPromise(tx(db, storeName).getAll());
}

export async function put(db, storeName, value){
  return reqToPromise(tx(db, storeName, "readwrite").put(value));
}

export async function del(db, storeName, key){
  return reqToPromise(tx(db, storeName, "readwrite").delete(key));
}

export async function get(db, storeName, key){
  return reqToPromise(tx(db, storeName).get(key));
}

export async function setMeta(db, key, value){
  return reqToPromise(tx(db, "meta", "readwrite").put(value, key));
}

export async function getMeta(db, key, fallback=null){
  const v = await reqToPromise(tx(db, "meta").get(key));
  return (v === undefined) ? fallback : v;
}

export async function exportAll(db){
  const [ponds,koi,logs,foods,koiPhotos,waterLogs,reminders,settings] = await Promise.all([
    getAll(db,"ponds"),
    getAll(db,"koi"),
    getAll(db,"logs"),
    getAll(db,"foods"),
    getAll(db,"koiPhotos"),
    getAll(db,"waterLogs"),
    getAll(db,"reminders"),
    getMeta(db,"settings", null)
  ]);
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    ponds, koi, logs, foods, koiPhotos, waterLogs, reminders,
    settings
  };
}

export async function importAll(db, data){
  if(!data || typeof data !== "object") throw new Error("Ungültige Datei.");
  const stores = ["ponds","koi","logs","foods","koiPhotos","waterLogs","reminders"];
  // wipe + import
  await Promise.all(stores.map(store=>{
    return new Promise((res, rej)=>{
      const tr = db.transaction(store, "readwrite");
      const os = tr.objectStore(store);
      const clr = os.clear();
      clr.onerror = ()=>rej(clr.error);
      tr.oncomplete = ()=>res();
      tr.onerror = ()=>rej(tr.error);
    });
  }));
  for(const p of (data.ponds||[])) await put(db,"ponds",p);
  for(const k of (data.koi||[])) await put(db,"koi",k);
  for(const l of (data.logs||[])) await put(db,"logs",l);
  for(const f of (data.foods||[])) await put(db,"foods",f);
  for(const ph of (data.koiPhotos||[])) await put(db,"koiPhotos",ph);
  for(const wl of (data.waterLogs||[])) await put(db,"waterLogs",wl);
  for(const r of (data.reminders||[])) await put(db,"reminders",r);
  if(data.settings) await setMeta(db,"settings",data.settings);
}
