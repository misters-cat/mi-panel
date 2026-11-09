/* Mi Panel: sincronización cifrada con Google Drive appDataFolder.
   El usuario debe habilitar Google Drive API y autorizar con OAuth.
   Un archivo por dispositivo evita sobrescrituras directas entre iPhone y PC. */
(function(){
"use strict";
const SCOPE="https://www.googleapis.com/auth/drive.appdata";
const PREFIX="mi-panel-sync-v1-";
const enc=new TextEncoder();
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
 if(!res.ok){const detail=(await res.text()).slice(0,180);if(res.status===401){token="";password="";expiration=0;setStatus("Sesión caducada: reconecta Drive")}throw Error("Google Drive "+res.status+" "+detail)}
 return res;
}
async function list(){
 let page="",files=[],n=0;
 do{
  const p=new URLSearchParams({spaces:"appDataFolder",fields:"nextPageToken,files(id,name,modifiedTime)",pageSize:"1000"});
  if(page)p.set("pageToken",page);
  const data=await(await call("/files?"+p)).json();
  files.push(...(data.files||[]).filter(f=>f.name&&f.name.startsWith(PREFIX)));
  page=data.nextPageToken||"";if(++n>10)throw Error("Hay demasiados archivos para sincronizar");
 }while(page);
 return files;
}
function shared(snapshot){
 const d=hooks.normalize(snapshot);
 return {version:2,tasks:d.tasks,categories:d.categories,deletedTasks:d.deletedTasks,deletedCategories:d.deletedCategories};
}
function decryptionFailure(error){
 return error?.name==="OperationError"||error?.name==="DataError"||/Formato de respaldo|Respaldo inválido|Respaldo no reconocido/.test(String(error?.message||""));
}
async function fetchFile(file){
 const pkg=await(await call("/files/"+encodeURIComponent(file.id)+"?alt=media")).json();
 try{
  return shared(await hooks.decrypt(pkg,password));
 }catch(error){
  if(!decryptionFailure(error))throw error;
  const issue=new Error("No fue posible descifrar un archivo de Drive. La clave puede ser distinta de la del computador o el archivo puede estar dañado.");
  issue.code="DRIVE_DECRYPT_FAILED";
  throw issue;
 }
}
async function upload(file,snapshot,id){
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
 let conflicts=0;
 for(const snapshot of all){
  for(const x of snapshot.categories||[]){const y=cats.get(x.id);if(!y||x.updatedAt>y.updatedAt)cats.set(x.id,x)}
  for(const x of snapshot.deletedTasks||[]){const y=removed.get(x.id);if(!y||x.deletedAt>y.deletedAt)removed.set(x.id,x)}
  for(const x of snapshot.deletedCategories||[]){const y=removedCats.get(x.id);if(!y||x.deletedAt>y.deletedAt)removedCats.set(x.id,x)}
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
  deletedCategories:[...removedCats.values()].sort((a,b)=>a.id.localeCompare(b.id))
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
  const result=merge([before,...cloud.map(c=>c.content)],s.settings.lastSynced||"2025-01-01T00:00:00Z");
  const updated={...s,...result.snapshot,settings:{...s.settings}};
  hooks.setState(updated);
  try{await hooks.persist({skipSync:true,preserveDate:true})}catch(e){hooks.setState(s);throw e}
  const current=shared(hooks.getState()),own=cloud.find(c=>c.file.name===PREFIX+id+".json");
  if(!own||JSON.stringify(own.content)!==JSON.stringify(current))await upload(own?.file,current,id);
  hooks.getState().settings.lastSynced=new Date().toISOString();
  await hooks.persist({skipSync:true,preserveDate:true});
  setStatus("Sincronizado: "+new Date().toLocaleString("es-CL")+(result.conflicts?" · ⚠️ Revisa conflictos":""));
  hooks.render();
  if(result.conflicts)hooks.toast("Se conservaron versiones en conflicto para revisar");
 }catch(error){
  console.error(error);
  if(error?.code==="DRIVE_DECRYPT_FAILED"){
   // Nunca se intenta crear ni sobrescribir archivos si falla el descifrado.
   token="";password="";expiration=0;
   setStatus("No se pudo abrir Drive: verifica la misma clave usada en el computador. No se borró nada.");
   hooks.toast("No se sincronizó: comprueba la clave de Drive. Los datos siguen guardados.");
   hooks.render();
  }else{
   setStatus("Error: "+String(error.message||error).slice(0,90));
   hooks.toast("No se sincronizó. Tus datos locales están conservados.");
  }
 }
 finally{busy=false}
}
function schedule(){if(!connected()||!navigator.onLine)return;clearTimeout(timer);timer=setTimeout(()=>sync(),4000)}
function connect(pass,clientId){
 if(!clientId){hooks.toast("Primero guarda el Client ID OAuth");return}
 if(pass.length<12){hooks.toast("Necesitas una clave de 12 caracteres o más");return}
 if(!navigator.onLine){hooks.toast("Para autorizar Drive se necesita internet");return}
 try{
  // requestAccessToken debe ejecutarse en el clic del usuario: Safari/iOS bloquea ventanas tardías.
  const oauth=window.google?.accounts?.oauth2;
  if(!oauth){setStatus("Cargando autorización Google…");hooks.loadGIS().then(()=>{setStatus("Google listo: pulsa Conectar Drive otra vez");hooks.toast("Google está listo. Pulsa Conectar Drive otra vez.")}).catch(()=>{setStatus("No se pudo cargar Google");hooks.toast("Comprueba tu conexión e inténtalo nuevamente")});return}
  const client=oauth.initTokenClient({client_id:clientId.trim(),scope:SCOPE,callback:async response=>{
   if(response.error||!response.access_token||!(response.scope||"").includes(SCOPE)){setStatus("Drive no autorizado");hooks.toast("Permiso de Drive rechazado");return}
   token=response.access_token;expiration=Date.now()+Number(response.expires_in||3500)*1000;password=pass;
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
 return {connect,sync,schedule,disconnect,connected,status:()=>statusText};
}
window.MiPanelCloud={init};
})();
