const CACHE = 'altervenator-v1';
const ASSETS = [
  './','./index.html','./styles.css','./app.js','./manifest.webmanifest',
  './icon-192.png','./icon-512.png','./logo.png','./logofondo.png'
];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
});
self.addEventListener('fetch', e=>{
  const req = e.request;
  e.respondWith(
    caches.match(req).then(cached=>{
      const fetchPromise = fetch(req).then(res=>{
        const copy = res.clone();
        caches.open(CACHE).then(c=>c.put(req, copy));
        return res;
      }).catch(()=>cached);
      return cached || fetchPromise;
    })
  );
});
