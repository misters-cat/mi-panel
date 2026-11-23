"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

const SCOPE="https://misters-cat.github.io/mi-panel/";
function response(body){
 return {ok:true,type:"basic",status:200,body,async text(){return body},clone(){return response(body)}};
}
function serviceWorkerFixture(){
 const listeners={},stores=new Map();
 let networkCalls=0,online=false;
 const getStore=name=>{
  if(!stores.has(name))stores.set(name,new Map());
  const entries=stores.get(name);
  const key=req=>new URL(typeof req==="string"?req:req.url,SCOPE).href;
  return {
   async match(req){return entries.get(key(req))},
   async put(req,res){entries.set(key(req),res)},
   async addAll(paths){for(const path of paths)entries.set(key(path),response("guardado:"+path))}
  };
 };
 const caches={
  async open(name){return getStore(name)},
  async keys(){return [...stores.keys()]},
  async delete(name){return stores.delete(name)}
 };
 const self={
  registration:{scope:SCOPE},location:{origin:"https://misters-cat.github.io"},
  clients:{async claim(){}},async skipWaiting(){},
  addEventListener(name,cb){listeners[name]=cb}
 };
 const fetch=async()=>{networkCalls++;if(!online)throw new Error("Sin conexión");return response("descargado")};
 vm.runInNewContext(fs.readFileSync("sw.js","utf8"),{self,caches,fetch,URL,console,Response:{error:()=>response("error")}},{filename:"sw.js"});
 async function fire(name,request){
  let responsePromise=null,waitPromise=Promise.resolve();
  listeners[name]({
   request,
   respondWith(p){responsePromise=p},
   waitUntil(p){waitPromise=Promise.resolve(p)}
  });
  await waitPromise;
  return responsePromise===null?null:await responsePromise;
 }
 return {fire,caches,setOnline:v=>{online=v},getNetworkCalls:()=>networkCalls};
}

test("la PWA se instala con todos los recursos necesarios, sin borrar IndexedDB",async()=>{
 const worker=serviceWorkerFixture();
 await worker.fire("install");
 const cache=await worker.caches.open("mi-panel-v24-recurrence");
 const paths=["index.html","styles.css?v=20261123-routines180","app.js?v=20261123-routines180","drive-sync.js?v=20261123-routines180","manifest.webmanifest","icon.svg"];
 for(const path of paths)assert(await cache.match(new URL(path,SCOPE).href),"Falta en caché: "+path);
 const old=await worker.caches.open("mi-panel-v20-calendar-events");
 await old.put(new URL("obsoleto.css",SCOPE).href,response("viejo"));
 await worker.fire("activate");
 assert.deepEqual(await worker.caches.keys(),["mi-panel-v24-recurrence"]);
 assert.doesNotMatch(fs.readFileSync("sw.js","utf8"),/indexedDB\.deleteDatabase|\.clear\(\)/);
});

test("el inicio y JavaScript responden desde caché sin consultar Internet",async()=>{
 const worker=serviceWorkerFixture();
 await worker.fire("install");
 const home=await worker.fire("fetch",{method:"GET",mode:"navigate",url:SCOPE+"?actualizar=123"});
 assert.equal(await home.text(),"guardado:./index.html");
 const script=await worker.fire("fetch",{method:"GET",mode:"same-origin",url:SCOPE+"app.js?v=20261123-routines180"});
 assert.equal(await script.text(),"guardado:./app.js?v=20261123-routines180");
 assert.equal(worker.getNetworkCalls(),0);
});

test("Google no se intercepta ni se requiere en la carga inicial",async()=>{
 const worker=serviceWorkerFixture();
 await worker.fire("install");
 const oauth=await worker.fire("fetch",{method:"GET",mode:"no-cors",url:"https://accounts.google.com/gsi/client"});
 assert.equal(oauth,null);
 const html=fs.readFileSync("index.html","utf8");
 assert.doesNotMatch(html,/fonts\.googleapis\.com|fonts\.gstatic\.com/);
 assert.doesNotMatch(html,/<script src="https:\/\/accounts\.google\.com\/gsi\/client"/);
 assert.match(html,/boot-status/);
});

test("HTML y precarga apuntan a las mismas versiones de archivos",()=>{
 const html=fs.readFileSync("index.html","utf8");
 const sw=fs.readFileSync("sw.js","utf8");
 for(const path of ["styles.css","app.js","drive-sync.js"]){
  const ref=path+"?v=20261123-routines180";
  assert(html.includes(ref),"Falta referencia HTML: "+ref);
  assert(sw.includes(ref),"Falta precarga: "+ref);
 }
});
