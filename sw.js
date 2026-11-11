/* Mi Panel PWA v1.6.1 — solo borra cachés de esta aplicación, nunca IndexedDB */
const CACHE="mi-panel-v20-calendar-events";
const ASSETS=["./","./index.html","./styles.css?v=20261111-calendar161","./app.js?v=20261111-calendar161","./drive-sync.js?v=20261111-calendar161","./manifest.webmanifest","./icon.svg"];
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(name=>name.startsWith("mi-panel-")&&name!==CACHE).map(name=>caches.delete(name)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET"||new URL(request.url).origin!==self.location.origin)return;
 event.respondWith((async()=>{
  try{
   const response=await fetch(request,{cache:"no-store"});
   if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(console.warn));}
   return response;
  }catch(error){
   const cached=await caches.match(request,{ignoreSearch:true});
   if(cached)return cached;
   if(request.mode==="navigate"){
    const shell=await caches.match("./index.html");
    if(shell)return shell;
   }
   return Response.error();
  }
 })());
});
