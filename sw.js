/* Kodawari Koi PWA Service Worker */
const CACHE = "kodawari-koi-v11";
const ASSETS = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./sw.js",
  "./db.js",
  "./manifest.json",
  "./assets/icons/icon-48.png",
  "./assets/icons/icon-72.png",
  "./assets/icons/icon-96.png",
  "./assets/icons/icon-128.png",
  "./assets/icons/icon-144.png",
  "./assets/icons/icon-152.png",
  "./assets/icons/icon-167.png",
  "./assets/icons/icon-180.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png"
];

self.addEventListener("install", (e)=>{
  e.waitUntil(
    caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate", (e)=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.map(k=>k===CACHE?null:caches.delete(k)))).then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch", (e)=>{
  const req = e.request;
  const url = new URL(req.url);

  // Only handle same-origin
  if(url.origin !== location.origin) return;

  // Network-first for navigations, cache-first for assets
  if(req.mode === "navigate"){
    e.respondWith((async ()=>{
      try{
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put("./index.html", fresh.clone());
        return fresh;
      }catch{
        const cached = await caches.match("./index.html");
        return cached || new Response("Offline", {status: 200, headers: {"Content-Type":"text/plain"}});
      }
    })());
    return;
  }

  e.respondWith((async ()=>{
    const cached = await caches.match(req);
    if(cached) return cached;
    const res = await fetch(req);
    const cache = await caches.open(CACHE);
    cache.put(req, res.clone());
    return res;
  })());
});
