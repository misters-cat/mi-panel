"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const {webcrypto}=require("node:crypto");

function setup(){
 const source=fs.readFileSync("app.js","utf8");
 const cut=source.lastIndexOf("readState().then(");
 assert(cut>0,"No se encontró punto de inicio de la PWA");
 const patched=source.slice(0,cut)+
  'window.__test={getState,migrateState,saveForm,saveCategory,save,setDb:x=>{db=x},setState:x=>{state=x},actual:()=>state};\n})();';
 const toast={textContent:"",classList:{add(){},remove(){}},value:""};
 const elements=new Map();
 const element=id=>{
  if(id==="#toast")return toast;
  if(!elements.has(id))elements.set(id,{innerHTML:"",textContent:"",value:"",classList:{add(){},remove(){},toggle(){}},focus(){},setSelectionRange(){}});
  return elements.get(id);
 };
 const window={addEventListener(){},scrollTo(){}};
 const document={documentElement:{dataset:{}},querySelector:element,querySelectorAll(){return[]},addEventListener(){}};
 class FData{constructor(x){this.x=x.fields}entries(){return Object.entries(this.x)[Symbol.iterator]()}}
 const ctx={window,document,console,crypto:webcrypto,FormData:FData,
  navigator:{onLine:true},matchMedia:()=>({matches:false}),setTimeout:()=>1,clearTimeout(){},setInterval(){},
  TextEncoder,TextDecoder,URL,confirm:()=>true,prompt:()=>null};
 vm.runInNewContext(patched,ctx,{filename:"app.js"});
 let saved=null;
 const db={fail:false,transaction(){
  const parent=this;
  const tx={error:new Error("Error de escritura simulado"),objectStore(){
   return{put(value){tx.staged=JSON.parse(JSON.stringify(value))}}
  }};
  setImmediate(()=>{if(parent.fail){tx.onerror?.()}else{saved=tx.staged;tx.oncomplete?.()}});
  return tx;
 }};
 window.__test.setDb(db);
 return {api:window.__test,db,toast,getSaved:()=>saved};
}
function form(fields){return{fields,querySelector(){return{disabled:false}}}}
function taskFields(areaId,title){return{id:"",title,areaId,subarea:"",type:"tarea",due:"",time:"",
 priority:"Normal",status:"Pendiente",notes:"",repeat:"none"}}
test("la migración conserva tareas existentes y agrega GRANDES METAS",()=>{
 const {api}=setup();
 const migrated=api.migrateState({version:1,tasks:[{id:"a",area:"Trabajo",title:"Visita",status:"Pendiente"}],settings:{theme:"dark"}});
 assert(migrated.categories.some(x=>x.name==="GRANDES METAS"));
 assert.equal(migrated.tasks[0].areaId,"trabajo");
 assert.equal(migrated.settings.theme,"dark");
});
test("Guardar pendiente confirma IndexedDB antes de mostrar éxito",async()=>{
 const {api,toast,getSaved}=setup();
 await api.saveForm(form(taskFields("grandes-metas","Completar mi meta anual")));
 assert.equal(getSaved().tasks.length,1);
 assert.equal(getSaved().tasks[0].areaId,"grandes-metas");
 assert.match(toast.textContent,/guardado/i);
});
test("Guardar categoría crea categoría personalizable y persiste",async()=>{
 const {api,toast,getSaved}=setup();
 await api.saveCategory(form({id:"",name:"Estudios",emoji:"📚",description:"Aprendizaje"}));
 assert(getSaved().categories.some(x=>x.name==="Estudios"&&x.emoji==="📚"));
 assert.match(toast.textContent,/guardada/i);
});
test("Si IndexedDB falla, Guardar NO muestra éxito ni mantiene un cambio inexistente",async()=>{
 const {api,db,toast,getSaved}=setup();
 db.fail=true;
 await api.saveForm(form(taskFields("personal","No debe quedar guardado")));
 assert.equal(api.actual().tasks.length,0);
 assert.equal(getSaved(),null);
 assert.match(toast.textContent,/Error/i);
});
