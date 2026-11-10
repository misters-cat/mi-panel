"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const {webcrypto}=require("node:crypto");
function engine(){
 const source=fs.readFileSync("drive-sync.js","utf8");
 assert(source.includes("window.MiPanelCloud={init};"));
 const script=source.replace("window.MiPanelCloud={init};","window.MiPanelCloud={init};window.__mergeForTest=merge;window.__parseCloudPackageForTest=parseCloudPackage;window.__prefixForTest=PREFIX;window.__uploadForTest=upload;");
 const window={addEventListener(){}};
 const document={addEventListener(){},getElementById(){return null}};
 const ctx={window,document,console,crypto:webcrypto,TextEncoder,URLSearchParams,setInterval(){}};
 vm.runInNewContext(script,ctx,{filename:"drive-sync.js"});
 window.MiPanelCloud.init({normalize:x=>x,defaultCategories:()=>[{id:"personal",name:"Personal",builtIn:true,updatedAt:"2025-01-01T00:00:00Z"}]});
 return {merge:window.__mergeForTest,parseCloudPackage:window.__parseCloudPackageForTest,prefix:window.__prefixForTest};
}
function task(title,date){return{id:"t1",title,areaId:"personal",area:"Personal",status:"Pendiente",updatedAt:date,createdAt:"2026-11-01T00:00:00Z"}}
test("La sincronización une tareas de dos dispositivos sin descartarlas",()=>{
 const {merge}=engine();
 const result=merge([
  {categories:[],tasks:[task("Versión teléfono","2026-11-09T16:00:00Z")]},
  {categories:[],tasks:[{...task("Versión PC","2026-11-09T17:00:00Z"),id:"t2"}]}
 ],"2026-11-08T00:00:00Z");
 assert.equal(result.snapshot.tasks.length,2);
 assert(result.snapshot.tasks.some(x=>x.id==="t1"));
 assert(result.snapshot.tasks.some(x=>x.id==="t2"));
});
test("Dos ediciones simultáneas preservan la versión anterior para revisión",()=>{
 const {merge}=engine();
 const out=merge([
  {tasks:[task("Desde iPhone","2026-11-09T16:00:00Z")]},
  {tasks:[task("Desde PC","2026-11-09T17:00:00Z")]}
 ],"2026-11-09T15:00:00Z");
 assert(out.snapshot.tasks.some(x=>x.title==="Desde PC"&&x.id==="t1"));
 assert(out.snapshot.tasks.some(x=>x.title.startsWith("⚠️")&&x.title.includes("Desde iPhone")));
 assert(out.conflicts>0);
});
test("Una eliminación sincronizada prevalece sobre la tarea más antigua",()=>{
 const {merge}=engine();
 const out=merge([
  {tasks:[task("Antes de eliminar","2026-11-01T00:00:00Z")]},
  {deletedTasks:[{id:"t1",deletedAt:"2026-11-09T17:00:00Z"}]}
 ],"2026-11-09T15:00:00Z");
 assert(!out.snapshot.tasks.some(x=>x.id==="t1"));
});

test("La nueva sincronización ignora el espacio de archivos cifrados antiguos",()=>{
 const {prefix,parseCloudPackage}=engine();
 assert.equal(prefix,"mi-panel-sync-v3-");
 const decoded=parseCloudPackage({format:"mi-panel-auto-sync-v2",version:2,
   tasks:[],categories:[],deletedTasks:[],deletedCategories:[]});
 assert.equal(decoded.tasks.length,0);
 assert.throws(()=>parseCloudPackage({format:"mi-panel-encrypted",v:1,data:"irrelevante"}),/incompatible/);
});
test("La sincronización cifra antes de subir y valida descifrado",()=>{
 const code=fs.readFileSync("drive-sync.js","utf8");
 assert(code.includes('hooks.encrypt(snapshot,password)'));
 assert(code.includes('hooks.decrypt(pkg,password)'));
 assert(code.includes('OLD_PREFIX'));
 assert(code.includes('method:"DELETE"'));
 assert(code.includes('await fetchFile({id:savedId,name:PREFIX+id+".json"})'));
 assert(!code.includes('JSON.stringify({...snapshot,format:FORMAT'));
 assert(code.includes("protectLocal(s)"));
});

test("Actualizar ahora llama al método sync sin desactivar la sincronización automática",()=>{
 const app=fs.readFileSync("app.js","utf8");
 assert.match(app,/id="drive-now"/);
 assert.match(app,/btn\.id==="drive-now"/);
 assert.match(app,/await cloudClient\?\.sync\(\)/);
 assert.match(app,/cloudClient\?\.schedule\(\)/);
});

function member(name,id="p1",updatedAt="2026-11-10T13:00:00Z"){return{id,name,updatedAt,createdAt:"2026-11-09T12:00:00Z"}}
function visit(topics,id="v1",personId="p1",updatedAt="2026-11-10T13:00:00Z"){return{id,personId,date:"2026-11-09",topics,updatedAt,createdAt:"2026-11-09T12:00:00Z"}}
test("La sincronización reúne integrantes y visitas independientes de PC e iPhone",()=>{
 const {merge}=engine();
 const result=merge([
  {groupPeople:[member("Integrante A")],groupVisits:[visit("Lectura general")]},
  {groupPeople:[member("Integrante B","p2")],groupVisits:[visit("Segunda visita","v2","p2")]}
 ],"2026-11-08T00:00:00Z");
 assert.equal(result.snapshot.groupPeople.length,2);
 assert.equal(result.snapshot.groupVisits.length,2);
 assert(result.snapshot.groupVisits.some(x=>x.id==="v1"&&x.topics==="Lectura general"));
 assert(result.snapshot.groupVisits.some(x=>x.id==="v2"&&x.personId==="p2"));
});
test("Dos temas editados en paralelo se preservan como versiones para revisión",()=>{
 const {merge}=engine();
 const result=merge([
  {groupPeople:[member("Integrante A")],groupVisits:[visit("Tema desde iPhone","v1","p1","2026-11-10T14:00:00Z")]},
  {groupPeople:[member("Integrante A")],groupVisits:[visit("Tema desde PC","v1","p1","2026-11-10T15:00:00Z")]}
 ],"2026-11-10T13:00:00Z");
 assert(result.snapshot.groupVisits.some(x=>x.id==="v1"&&x.topics==="Tema desde PC"));
 assert(result.snapshot.groupVisits.some(x=>x.conflictOf==="v1"&&x.topics.includes("Tema desde iPhone")));
 assert(result.conflicts>0);
});
test("Una visita borrada y su integrante no reaparecen al sincronizar",()=>{
 const {merge}=engine();
 const result=merge([
  {groupPeople:[member("Integrante A","p1","2026-11-09T12:00:00Z")],groupVisits:[visit("Nota","v1","p1","2026-11-09T12:00:00Z")]},
  {deletedGroupPeople:[{id:"p1",deletedAt:"2026-11-10T15:00:00Z"}],deletedGroupVisits:[{id:"v1",deletedAt:"2026-11-10T15:00:00Z"}]}
 ],"2026-11-09T13:00:00Z");
 assert.equal(result.snapshot.groupPeople.length,0);
 assert.equal(result.snapshot.groupVisits.length,0);
 assert.equal(result.snapshot.deletedGroupPeople.length,1);
 assert.equal(result.snapshot.deletedGroupVisits.length,1);
});
