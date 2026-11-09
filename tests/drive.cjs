"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const {webcrypto}=require("node:crypto");
function engine(){
 const source=fs.readFileSync("drive-sync.js","utf8");
 assert(source.includes("window.MiPanelCloud={init};"));
 const script=source.replace("window.MiPanelCloud={init};","window.MiPanelCloud={init};window.__mergeForTest=merge;window.__parseCloudPackageForTest=parseCloudPackage;window.__prefixForTest=PREFIX;");
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
 assert.equal(prefix,"mi-panel-sync-v2-");
 const decoded=parseCloudPackage({format:"mi-panel-auto-sync-v2",version:2,
   tasks:[],categories:[],deletedTasks:[],deletedCategories:[]});
 assert.equal(decoded.tasks.length,0);
 assert.throws(()=>parseCloudPackage({format:"mi-panel-encrypted",v:1,data:"irrelevante"}),/incompatible/);
});
test("La nueva sincronización no utiliza contraseña ni cifra la carga de Drive",()=>{
 const code=fs.readFileSync("drive-sync.js","utf8");
 assert(!code.includes("hooks.encrypt("));
 assert(!code.includes("hooks.decrypt("));
 assert(!code.includes("drive-pass"));
 assert(code.includes("lastAutoSynced"));
 assert(code.includes("protectLocal(s)"));
});
