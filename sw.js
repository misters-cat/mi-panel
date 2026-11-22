/* Mi Panel v1.6.2 — inicio local-first. Solo actualiza cachés de la PWA; NUNCA IndexedDB. */
"use strict";
const CACHE_NAME="mi-panel-v21-offline-first";
const PRECACHE=[
 "./",
 "./index.html",
 "./styles.css?v=20261122-offline162",
 "./app.js?v=20261122-offline162",
 "./drive-sync.js?v=20261122-offline162",
 "./manifest.webmanifest",
 "./icon.svg"
];
const SCOPE=new URL(self.registration.scope);
const SHELL_URL=new URL("./index.html",SCOPE).href;
const SW_PATH=new URL("./sw.js",SCOPE).pathname;

self.addEventListener("install",event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE_NAME);
  // La nueva versión se activa solo cuando el conjunto local completo está disponible.
  await cache.addAll(PRECACHE);
  await self.skipWaiting();
 })());
});

self.addEventListener("activate",event=>{
 event.waitUntil((async()=>{
  const names=await caches.keys();
  await Promise.all(names.filter(name=>name.startsWith("mi-panel-")&&name!==CACHE_NAME).map(name=>caches.delete(name)));
  await self.clients.claim();
 })());
});

self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET")return;
 const url=new URL(request.url);
 // Google Drive/Calendar/OAuth se consultan solo bajo demanda, nunca desde esta caché.
 if(url.origin!==SCOPE.origin||!url.pathname.startsWith(SCOPE.pathname)||url.pathname===SW_PATH)return;

 if(request.mode==="navigate"){
  event.respondWith((async()=>{
   const cache=await caches.open(CACHE_NAME);
   // Sin esperas por red: la aplicación precargada se muestra primero, incluso en modo avión.
   const local=await cache.match(SHELL_URL);
   if(local)return local;
   try{
    const fresh=await fetch(request);
    if(fresh.ok)event.waitUntil(cache.put(SHELL_URL,fresh.clone()).catch(console.warn));
    return fresh;
   }catch(_){
    return new Response("Mi Panel no está guardado aún en este dispositivo. Ábrelo una vez con conexión.",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}});
   }
  })());
  return;
 }

 event.respondWith((async()=>{
  const cache=await caches.open(CACHE_NAME);
  const local=await cache.match(request);
  if(local)return local;
  try{
   const fresh=await fetch(request);
   if(fresh.ok&&fresh.type==="basic")event.waitUntil(cache.put(request,fresh.clone()).catch(console.warn));
   return fresh;
  }catch(_){return Response.error()}
 })());
});
