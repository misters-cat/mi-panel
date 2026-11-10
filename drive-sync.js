/* Mi Panel: sincronización cifrada con Google Drive appDataFolder.
   El usuario debe habilitar Google Drive API y autorizar con OAuth.
   Un archivo por dispositivo evita sobrescrituras directas entre iPhone y PC. */
(function(){
"use strict";
const SCOPE="https://www.googleapis.com/auth/drive.appdata";
const PREFIX="mi-panel-sync-v3-";
const OLD_PREFIX="mi-panel-sync-v2-";
const FORMAT="mi-panel-auto-sync-v2"; // Legacy: solo lectura para migrar y retirar archivos sin cifrar
let token="",password="",expiration=0,busy=false,timer=null,statusText="Sin conectar",hooks=null;
function connected(){return Boolean(token&&password&&Date.now()<expiration-60000)}
function setStatus(value){statusText=value;const e=document.getElementById("drive-status");if(e)e.textContent=value}
async function deviceId(){
 const db=hooks.getDb();if(!db)throw Error("IndexedDB no disponible");
 let id=await new Promise((ok,fail)=>{const r=db.transaction("kv","readonly").objectStore("kv").get("sync-device-id");r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error)});
 if(id)return id;
 id=crypto.randomUUID();
 await new Promise((ok,fail)=>{const tx=db.transaction("kv","readwrite");tx.objectStore("kv").put(id,"sync-device-id");tx.oncomplete=ok;tx.onerror=()=>fail(tx.error)});
 return id;
}
async function call(url,opts={}){
 if(!connected())throw Error("La sesión de Google caducó: reconecta Drive");
 const res=await fetch(url.startsWith("https://")?url:"https://www.googleapis.com/drive/v3"+url,{...opts,headers:{Authorization:"Bearer "+token,...(opts.headers||{})}});
 if(!res.ok){const detail=(await res.text()).slice(0,180);if(res.status===401){token="";expiration=0;setStatus("Sesión de Google caducada: vuelve a conectar")}throw Error("Google Drive "+res.status+" "+detail)}
 return res;
}
async function list(){
 let page="",files=[],n=0;
 do{
  const p=new URLSearchParams({spaces:"appDataFolder",fields:"nextPageToken,files(id,name,modifiedTime)",pageSize:"1000"});
  if(page)p.set("pageToken",page);
  const data=await(await call("/files?"+p)).json();
  files.push(...(data.files||[]).filter(f=>f.name&&(f.name.startsWith(PREFIX)||f.name.startsWith(OLD_PREFIX))));
  page=data.nextPageToken||"";if(++n>10)throw Error("Hay demasiados archivos para sincronizar");
 }while(page);
 return files;
}
function shared(snapshot){
 const d=hooks.normalize(snapshot);
 return {version:3,tasks:d.tasks,categories:d.categories,deletedTasks:d.deletedTasks,deletedCategories:d.deletedCategories,
  groupPeople:d.groupPeople||[],groupVisits:d.groupVisits||[],deletedGroupPeople:d.deletedGroupPeople||[],deletedGroupVisits:d.deletedGroupVisits||[]};
}
function parseCloudPackage(pkg){
 if(pkg?.format!==FORMAT||pkg.version!==2||
  !Array.isArray(pkg.tasks)||!Array.isArray(pkg.categories)||
  !Array.isArray(pkg.deletedTasks)||!Array.isArray(pkg.deletedCategories)){
  throw Error("Un archivo de sincronización tiene un formato incompatible. No se modificó ningún dato.");
 }
 return shared(pkg);
}
async function fetchFile(file){
 const pkg=await(await call("/files/"+encodeURIComponent(file.id)+"?alt=media")).json();
 if(file.name.startsWith(OLD_PREFIX))return parseCloudPackage(pkg);
 if(pkg?.format!=="mi-panel-encrypted")throw Error("Archivo cifrado incompatible; no se hicieron cambios.");
 try{return shared(await hooks.decrypt(pkg,password))}
 catch(e){throw Error("No se puede descifrar Drive. Verifica la misma contraseña en todos los equipos. No se han sobrescrito archivos.")}
}
function protectionKey(){return "mi-panel-proteccion-autosync-v2"}
async function getProtection(){
 const db=hooks.getDb();if(!db)throw Error("IndexedDB no disponible");
 return new Promise((ok,fail)=>{
  const r=db.transaction("kv","readonly").objectStore("kv").get(protectionKey());
  r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error);
 });
}
async function protectLocal(snapshot,key=protectionKey()){
 const db=hooks.getDb();if(!db)throw Error("IndexedDB no disponible");
 return new Promise((ok,fail)=>{
  const tx=db.transaction("kv","readwrite"),store=tx.objectStore("kv");
  const r=store.get(key);
  r.onsuccess=()=>{if(!r.result)store.put(JSON.parse(JSON.stringify(snapshot)),key)};
  tx.oncomplete=()=>ok();tx.onabort=()=>fail(tx.error||Error("Error al proteger datos locales"));
  tx.onerror=()=>fail(tx.error||Error("Error al proteger datos locales"));
 });
}
async function restoreProtection(){
 try{
  const saved=await getProtection();
  if(!saved){hooks.toast("Este dispositivo aún no tiene una copia previa de sincronización");return}
  if(!confirm("¿Restaurar la copia de protección de este dispositivo? Antes conservaremos también los datos actuales. La sincronización se desconectará."))return;
  const old=hooks.getState();
  await protectLocal(old,"mi-panel-proteccion-antes-restaurar-"+Date.now());
  hooks.setState(hooks.normalize(saved));
  try{await hooks.persist({skipSync:true,preserveDate:true})}catch(error){hooks.setState(old);throw error}
  disconnect();hooks.toast("Copia local restaurada. Revisa tus tareas antes de reconectar.");
 }catch(error){console.error(error);hooks.toast("No se pudo recuperar la copia; tus datos actuales siguen intactos")}
}
async function upload(file,snapshot,id){
 // Nunca enviar tareas en JSON legible: AES-GCM + PBKDF2 en el navegador.
 const body=JSON.stringify(await hooks.encrypt(snapshot,password));
 if(file)return (await call("https://www.googleapis.com/upload/drive/v3/files/"+encodeURIComponent(file.id)+"?uploadType=media",{method:"PATCH",headers:{"Content-Type":"application/json"},body})).json();
 const boundary="mp_"+id.replace(/-/g,"");
 const meta={name:PREFIX+id+".json",parents:["appDataFolder"],mimeType:"application/json"};
 const content="--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"+
  JSON.stringify(meta)+"\r\n--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"+
  body+"\r\n--"+boundary+"--";
 return (await call("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name",{
  method:"POST",headers:{"Content-Type":"multipart/related; boundary="+boundary},body:content})).json();
}
function hash(str){let h=2166136261;for(let i=0;i<str.length;i++)h=Math.imul(h^str.charCodeAt(i),16777619);return (h>>>0).toString(36)}
function merge(all,since){
 const tasks=new Map(),cats=new Map(),removed=new Map(),removedCats=new Map(),preserved=new Map();
 const people=new Map(),visits=new Map(),removedPeople=new Map(),removedVisits=new Map(),preservedVisits=new Map();
 let conflicts=0;
 for(const snapshot of all){
  for(const x of snapshot.categories||[]){const y=cats.get(x.id);if(!y||x.updatedAt>y.updatedAt)cats.set(x.id,x)}
  for(const x of snapshot.deletedTasks||[]){const y=removed.get(x.id);if(!y||x.deletedAt>y.deletedAt)removed.set(x.id,x)}
  for(const x of snapshot.deletedCategories||[]){const y=removedCats.get(x.id);if(!y||x.deletedAt>y.deletedAt)removedCats.set(x.id,x)}

  for(const person of snapshot.groupPeople||[]){
   const prior=people.get(person.id);
   if(!prior||(person.updatedAt||"")>(prior.updatedAt||""))people.set(person.id,person);
   if(prior&&prior.name!==person.name&&(prior.updatedAt||"")>since&&(person.updatedAt||"")>since)conflicts++;
  }
  for(const tomb of snapshot.deletedGroupPeople||[]){
   const prior=removedPeople.get(tomb.id);
   if(!prior||tomb.deletedAt>prior.deletedAt)removedPeople.set(tomb.id,tomb);
  }
  for(const tomb of snapshot.deletedGroupVisits||[]){
   const prior=removedVisits.get(tomb.id);
   if(!prior||tomb.deletedAt>prior.deletedAt)removedVisits.set(tomb.id,tomb);
  }
  for(const visit of snapshot.groupVisits||[]){
   const prior=visits.get(visit.id);
   if(!prior){visits.set(visit.id,visit);continue}
   const winner=(visit.updatedAt||"")>(prior.updatedAt||"")?visit:prior,loser=winner===visit?prior:visit;
   visits.set(visit.id,winner);
   const changed=JSON.stringify({...visit,updatedAt:undefined})!==JSON.stringify({...prior,updatedAt:undefined});
   if(changed&&(visit.updatedAt||"")>since&&(prior.updatedAt||"")>since){
    const copyId="conflict-visit-"+loser.id+"-"+hash(JSON.stringify(loser));
    if(!preservedVisits.has(copyId)&&!visits.has(copyId)){
     preservedVisits.set(copyId,{...loser,id:copyId,topics:"⚠️ Revisar otra versión de esta visita:\n"+loser.topics,
       conflictOf:loser.id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
     conflicts++;
    }
   }
  }
  for(const t of snapshot.tasks||[]){
   const prev=tasks.get(t.id);if(!prev){tasks.set(t.id,t);continue}
   const winner=(t.updatedAt||"")>(prev.updatedAt||"")?t:prev,loser=winner===t?prev:t;
   const different=JSON.stringify({...t,area:"",updatedAt:""})!==JSON.stringify({...prev,area:"",updatedAt:""});
   tasks.set(t.id,winner);
   if(different&&(t.updatedAt||"")>since&&(prev.updatedAt||"")>since){
    const cid="conflict-"+loser.id+"-"+hash(JSON.stringify(loser));
    if(!tasks.has(cid)&&!preserved.has(cid)){preserved.set(cid,{...loser,id:cid,title:"⚠️ Revisar otra versión: "+loser.title,notes:(loser.notes||"")+"\n[Otra versión conservada por sincronización]",updatedAt:new Date().toISOString(),createdAt:new Date().toISOString()});conflicts++}
   }
  }
 }
 for(const [id,r] of removed){
  const t=tasks.get(id);if(!t)continue;
  if(r.deletedAt>=(t.updatedAt||"")){
   if(r.deletedAt>since&&(t.updatedAt||"")>since){
    const cid="conflict-"+id+"-"+hash(JSON.stringify(t));
    if(!preserved.has(cid)&&!tasks.has(cid)){preserved.set(cid,{...t,id:cid,title:"⚠️ Recuperado tras eliminación: "+t.title,updatedAt:new Date().toISOString()});conflicts++}
   }
   tasks.delete(id);
  }
 }
 for(const [id,tomb] of removedVisits){
  const record=visits.get(id);
  if(record&&tomb.deletedAt>=(record.updatedAt||""))visits.delete(id);
 }
 for(const [id,tomb] of removedPeople){
  const person=people.get(id);
  if(person&&tomb.deletedAt>=(person.updatedAt||""))people.delete(id);
 }
 for(const [id,visit] of visits)if(!people.has(visit.personId))visits.delete(id);
 for(const [id,visit] of preservedVisits)if(!people.has(visit.personId))preservedVisits.delete(id);
 for(const [id,r] of removedCats){const x=cats.get(id);if(x&&!x.builtIn&&r.deletedAt>=(x.updatedAt||""))cats.delete(id)}
 const defaults=hooks.defaultCategories();
 for(const d of defaults)if(!cats.has(d.id))cats.set(d.id,d);
 const sortedCategories=[...cats.values()].sort((a,b)=>{
  const x=defaults.findIndex(d=>d.id===a.id),y=defaults.findIndex(d=>d.id===b.id);
  return (x<0?999:x)-(y<0?999:y)||a.name.localeCompare(b.name,"es");
 });
 return {snapshot:{
  version:2,categories:sortedCategories,
  tasks:[...tasks.values(),...preserved.values()].sort((a,b)=>a.id.localeCompare(b.id)),
  deletedTasks:[...removed.values()].sort((a,b)=>a.id.localeCompare(b.id)),
  deletedCategories:[...removedCats.values()].sort((a,b)=>a.id.localeCompare(b.id)),
  groupPeople:[...people.values()].sort((a,b)=>a.id.localeCompare(b.id)),
  groupVisits:[...visits.values(),...preservedVisits.values()].sort((a,b)=>a.id.localeCompare(b.id)),
  deletedGroupPeople:[...removedPeople.values()].sort((a,b)=>a.id.localeCompare(b.id)),
  deletedGroupVisits:[...removedVisits.values()].sort((a,b)=>a.id.localeCompare(b.id))
 },conflicts};
}
async function sync(){
 if(busy)return;
 if(!connected()){setStatus("Debes autorizar Drive para sincronizar");return}
 if(!navigator.onLine){setStatus("Sin conexión: los datos siguen guardados en tu equipo");return}
 busy=true;setStatus("Sincronizando…");
 try{
  const id=await deviceId(),files=await list(),cloud=[];
  // Si un archivo no puede descifrarse, nunca se escribe encima de nada.
  for(const file of files)cloud.push({file,content:await fetchFile(file)});
  const s=hooks.getState(),before=shared(s);
  // Copia local independiente, antes de combinar cualquier dato de Drive.
  if(!s.settings?.lastAutoSynced)await protectLocal(s);
  const result=merge([before,...cloud.map(c=>c.content)],s.settings?.lastAutoSynced||"2025-01-01T00:00:00Z");
  const updated={...s,...result.snapshot,settings:{...s.settings}};
  hooks.setState(updated);
  try{await hooks.persist({skipSync:true,preserveDate:true})}catch(e){hooks.setState(s);throw e}
  const current=shared(hooks.getState()),own=cloud.find(c=>c.file.name===PREFIX+id+".json");
  if(!own||JSON.stringify(own.content)!==JSON.stringify(current)){
   const uploaded=await upload(own?.file,current,id);
   // Validar que Drive guardó el paquete cifrado antes de limpiar formatos antiguos.
   const savedId=own?.file?.id||uploaded?.id;
   if(!savedId)throw Error("No se confirmó el ID del archivo cifrado");
   const verification=await fetchFile({id:savedId,name:PREFIX+id+".json"});
   if(JSON.stringify(verification)!==JSON.stringify(current))throw Error("Falló la comprobación del archivo cifrado de Drive");
  }
  let oldFailures=0;
  for(const item of cloud.filter(x=>x.file.name.startsWith(OLD_PREFIX))){
   try{await call("/files/"+encodeURIComponent(item.file.id),{method:"DELETE"})}
   catch(err){console.warn("No se pudo retirar archivo previo sin cifrar",err);oldFailures++}
  }
  hooks.getState().settings.lastAutoSynced=new Date().toISOString();
  await hooks.persist({skipSync:true,preserveDate:true});
  setStatus("🔐 Sincronización cifrada: "+new Date().toLocaleString("es-CL")+(result.conflicts?" · ⚠️ Revisa conflictos":"")+(oldFailures?" · ⚠️ "+oldFailures+" archivo(s) antiguos aún sin retirar":""));
  hooks.render();
  if(result.conflicts)hooks.toast("Se conservaron versiones en conflicto para revisar");
 }catch(error){
  console.error(error);
  setStatus("No se completó la sincronización: "+String(error.message||error).slice(0,110));
  hooks.toast("No se sincronizó. Tus tareas locales y archivos anteriores se conservan.");
  hooks.render();
 }
 finally{busy=false}
}
function schedule(){if(!connected()||!navigator.onLine)return;clearTimeout(timer);timer=setTimeout(()=>sync(),4000)}
function connect(clientId,passphrase){
 if(!clientId){hooks.toast("Primero guarda el Client ID OAuth");return}
 if(!passphrase||passphrase.length<12){hooks.toast("Escribe una clave de cifrado de 12 caracteres o más");return}
 if(!navigator.onLine){hooks.toast("Para autorizar Drive se necesita internet");return}
 try{
  // requestAccessToken debe ejecutarse en el clic del usuario: Safari/iOS bloquea ventanas tardías.
  const oauth=window.google?.accounts?.oauth2;
  if(!oauth){setStatus("Cargando autorización Google…");hooks.loadGIS().then(()=>{setStatus("Google listo: pulsa Conectar Drive otra vez");hooks.toast("Google está listo. Pulsa Conectar Drive otra vez.")}).catch(()=>{setStatus("No se pudo cargar Google");hooks.toast("Comprueba tu conexión e inténtalo nuevamente")});return}
  const client=oauth.initTokenClient({client_id:clientId.trim(),scope:SCOPE,callback:async response=>{
   if(response.error||!response.access_token||!(response.scope||"").includes(SCOPE)){setStatus("Drive no autorizado");hooks.toast("Permiso de Drive rechazado");return}
   token=response.access_token;expiration=Date.now()+Number(response.expires_in||3500)*1000;
   password=passphrase;
   const input=document.getElementById("drive-pass");if(input)input.value="";
   await sync();
  },error_callback:()=>{setStatus("No se completó la ventana de Google");hooks.toast("No se pudo abrir o completar la autorización de Google")}});
  client.requestAccessToken({prompt:"consent"});
 }catch(error){console.error(error);setStatus("No fue posible conectar");hooks.toast("Error de autorización Google")}
}
function disconnect(){clearTimeout(timer);token="";password="";expiration=0;setStatus("Desconectado. Los archivos de Drive se conservan.");hooks.render()}
function init(api){
 hooks=api;
 window.addEventListener("online",schedule);
 document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")schedule()});
 setInterval(()=>{if(connected()&&navigator.onLine&&document.visibilityState==="visible")sync()},180000);
 return {connect,sync,schedule,disconnect,connected,status:()=>statusText,restoreProtection};
}
window.MiPanelCloud={init};
})();
