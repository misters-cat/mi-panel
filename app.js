/* Mi Panel · PWA local-first. No se suben tareas a GitHub. */
"use strict";
(function(){
const $=(q,p=document)=>p.querySelector(q);
const $$=(q,p=document)=>[...p.querySelectorAll(q)];
const DEFAULT_CATEGORIES=[
{id:"congregacion",name:"Congregación",emoji:"",description:"Funciones y asignaciones",builtIn:true,updatedAt:"2025-01-01T00:00:00Z"},
{id:"autowallet",name:"MiAuto Wallet",emoji:"🚗",description:"Proyecto",builtIn:true,updatedAt:"2025-01-01T00:00:00Z"},
{id:"trabajo",name:"Trabajo",emoji:"🏛️",description:"Gestiones",builtIn:true,updatedAt:"2025-01-01T00:00:00Z"},
{id:"personal",name:"Personal",emoji:"🏡",description:"Vida personal",builtIn:true,updatedAt:"2025-01-01T00:00:00Z"},
{id:"grandes-metas",name:"GRANDES METAS",emoji:"🎯",description:"Objetivos importantes a largo plazo",builtIn:true,updatedAt:"2025-01-01T00:00:00Z"}
];
function getCat(id){return state.categories.find(c=>c.id===id)||DEFAULT_CATEGORIES.find(c=>c.id===id)}
function catId(t){return t.areaId||DEFAULT_CATEGORIES.find(c=>c.name===t.area)?.id||state.categories.find(c=>c.name===t.area)?.id||"personal"}
function catName(t){return getCat(catId(t))?.name||t.area||"Personal"}
function categoryIcon(c){return c.id==="congregacion"?'<img src="https://upload.wikimedia.org/wikipedia/commons/c/c9/JW_Logo.svg" alt="JW.ORG" class="jw-logo" width="40" height="40" decoding="async">':esc(c.emoji||"🗂️")}
function migrateState(x){
 const fresh=getState(),saved=x&&Array.isArray(x.tasks)?x:{};
 const cats=Array.isArray(saved.categories)?saved.categories.map(c=>({...c})):fresh.categories;
 const deletedCats=Array.isArray(saved.deletedCategories)?saved.deletedCategories:[];
 for(const base of DEFAULT_CATEGORIES)if(!cats.some(c=>c.id===base.id)&&!deletedCats.some(t=>t.id===base.id))cats.push({...base});
 return {...fresh,...saved,version:2,categories:cats,deletedCategories:deletedCats,
 tasks:(saved.tasks||[]).map(t=>({...t,areaId:t.areaId||cats.find(c=>c.name===t.area)?.id||DEFAULT_CATEGORIES.find(c=>c.name===t.area)?.id||"personal",updatedAt:t.updatedAt||t.createdAt||"2025-01-01T00:00:00Z"})),
 deletedTasks:Array.isArray(saved.deletedTasks)?saved.deletedTasks:[],trash:Array.isArray(saved.trash)?saved.trash.filter(t=>!t.trashedAt||Date.now()-Date.parse(t.trashedAt)<30*86400000):[],
 settings:{...fresh.settings,...saved.settings,googleClientId:saved.settings?.googleClientId?.trim()||GOOGLE_CLIENT_ID}};
}

const S=["Anciano","Superintendente de servicio","Asignaciones"];
const STAGES=["Recibida","Preparando","Lista","Realizada"];
const GOOGLE_CLIENT_ID="305697567217-ir52gouobhlnst0mgsstl9orf8s7m77a.apps.googleusercontent.com";
const APP_VERSION="1.5.0";
const TODAY=()=>iso(new Date());
const uid=()=>crypto.randomUUID ? crypto.randomUUID() : String(Date.now())+Math.random().toString(36).slice(2);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function iso(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function parseLocal(s){if(!s)return null;const a=s.split("-").map(Number);return new Date(a[0],a[1]-1,a[2])}
function addDays(s,n){const d=parseLocal(s);if(!d)return "";d.setDate(d.getDate()+n);return iso(d)}
function display(s){const d=parseLocal(s);return d?d.toLocaleDateString("es-CL",{day:"numeric",month:"short"}):"Sin fecha"}
function rangeStart(){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-(d.getDay()+6)%7);return iso(d)}
function weekEnd(){return addDays(TODAY(),6)}
function getState(){return {version:2,tasks:[],trash:[],categories:DEFAULT_CATEGORIES.map(c=>({...c})),deletedTasks:[],deletedCategories:[],settings:{theme:"auto",googleClientId:GOOGLE_CLIENT_ID,lastBackup:null,lastSynced:null,weeklyPicks:[]},updatedAt:new Date().toISOString()}}
let state=getState(),view="semana",filter="Todas",search="",connected=false,token="",googleEvents=[],hiding=false,lastScroll=0,lastSavedId=null,lastDeletedId=null,agendaOffset=0,globalQuery="";
let db,cloudClient=null,storageError="",lastRenderedDay=TODAY();
let homeMode="focus",homeSelectedDay=TODAY(),agendaSelectedDay=TODAY();
function openDB(){return new Promise((ok,fail)=>{const r=indexedDB.open("mi-panel-db",1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains("kv"))r.result.createObjectStore("kv")};r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error)})}
async function readState(){try{db=await openDB();const x=await new Promise((ok,fail)=>{const t=db.transaction("kv","readonly").objectStore("kv").get("state");t.onsuccess=()=>ok(t.result);t.onerror=()=>fail(t.error)});state=migrateState(x)}catch(err){storageError="No se pudo abrir el almacenamiento local. Tus cambios no se guardarán hasta resolverlo.";console.warn("IndexedDB no disponible",err);toast("⚠️ No se pudo abrir el almacenamiento local")}}
async function save(options={}){
 if(!db){storageError="Almacenamiento local no disponible. No se podrán guardar pendientes.";renderStorageWarning();throw Error("Almacenamiento local IndexedDB no disponible")}
 if(!options.preserveDate)state.updatedAt=new Date().toISOString();
 state.trash=(state.trash||[]).filter(t=>!t.trashedAt||Date.now()-Date.parse(t.trashedAt)<30*86400000);
 try{await new Promise((ok,fail)=>{const tx=db.transaction("kv","readwrite");tx.objectStore("kv").put(state,"state");tx.oncomplete=()=>ok();tx.onabort=()=>fail(tx.error||new Error("Se canceló la escritura"));tx.onerror=()=>fail(tx.error||new Error("Falló la escritura"))});storageError="";renderStorageWarning()}catch(err){storageError="No se pudo guardar en este navegador. Comprueba espacio disponible y permisos del sitio.";renderStorageWarning();throw err}
 if(!options.skipSync)cloudClient?.schedule();
 return true;
}
function renderStorageWarning(){const e=$("#storage-warning");if(e){e.textContent=storageError;e.classList.toggle("hidden",!storageError)}}
function toast(s){const el=$("#toast");el.textContent=s;el.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove("show"),3300)}
function theme(){const t=state.settings.theme;document.documentElement.dataset.theme=t==="auto"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t}
function taskKind(t){return catId(t)==="congregacion"&&t.subarea==="Asignaciones"?"Asignación":t.type==="seguimiento"?"Seguimiento":"Pendiente"}
function isDone(t){return t.status==="Terminada"||(taskKind(t)==="Asignación"&&t.status==="Realizada")}
function active(){return state.tasks.filter(x=>!isDone(x))}
function sortTasks(ts){return [...ts].sort((a,b)=>((a.due||"9999")>(b.due||"9999")?1:(a.due||"9999")<(b.due||"9999")?-1:0)||({Alta:0,Normal:1,Baja:2}[a.priority]??1)-({Alta:0,Normal:1,Baja:2}[b.priority]??1))}
function counts(){const t=active(),end=weekEnd();return {priority:t.filter(x=>x.priority==="Alta"||x.due&&x.due<=end).length,assign:t.filter(x=>taskKind(x)==="Asignación"&&x.due&&x.due<=addDays(TODAY(),14)).length,waiting:t.filter(x=>x.type==="seguimiento").length}}
function heading(k,sub){return '<div class="page-head"><h1>'+esc(k)+'</h1><p class="muted">'+esc(sub)+'</p></div>'}
function card(title,body,action){return '<section class="card"><div class="cardhead"><h2>'+esc(title)+'</h2>'+(action||"")+'</div>'+body+'</section>'}

function goalProgress(t){
 const steps=Array.isArray(t.milestones)?t.milestones:[];
 const done=steps.filter(s=>s.done).length;
 return {done,total:steps.length,percent:steps.length?Math.round(done*100/steps.length):0};
}
function parseGoalSteps(source,previous=[]){
 const original=new Map((previous||[]).map(step=>[String(step.text||"").trim().toLocaleLowerCase("es"),step]));
 return String(source||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,20).map(text=>{
  const old=original.get(text.toLocaleLowerCase("es"));
  return {id:old?.id||uid(),text,done:!!old?.done};
 });
}
function goalStepsMarkup(t){
 if(catId(t)!=="grandes-metas")return "";
 const {done,total,percent}=goalProgress(t);
 if(!total)return '<div class="tiny muted">🎯 Agrega etapas para medir esta meta</div>';
 return '<div class="goal-block"><div class="goal-status"><span>🎯 '+done+' de '+total+' etapas</span><b>'+percent+'%</b></div>'+
  '<div class="goal-track" role="progressbar" aria-label="Avance de la meta" aria-valuenow="'+percent+'" aria-valuemin="0" aria-valuemax="100"><span style="width:'+percent+'%"></span></div>'+
  '<div class="goal-steps">'+t.milestones.map(m=>'<button class="goal-step '+(m.done?"step-done":"")+'" type="button" data-step-toggle="'+esc(t.id)+'" data-step-id="'+esc(m.id)+'" aria-pressed="'+(m.done?"true":"false")+'">'+(m.done?"✅":"◯")+' '+esc(m.text)+'</button>').join("")+'</div></div>';
}
async function toggleMilestone(id,stepId){
 const index=state.tasks.findIndex(t=>t.id===id);if(index<0)return;
 const before=state.tasks,task=before[index];
 const milestones=(task.milestones||[]).map(m=>m.id===stepId?{...m,done:!m.done}:m);
 state.tasks=before.map(t=>t.id===id?{...t,milestones,updatedAt:new Date().toISOString()}:t);
 try{await save();render()}catch(err){state.tasks=before;toast("No se pudo guardar el avance");console.error(err)}
}

function rowTask(t){
 const due=t.due?display(t.due):"Sin fecha";
 const label=catName(t)+(t.subarea?" · "+t.subarea:"");
 return '<div class="task '+(lastSavedId===t.id?"just-saved":"")+'">'+
  '<button class="check" data-toggle="'+esc(t.id)+'" title="Marcar realizado" aria-label="Marcar realizado">'+(isDone(t)?"✓":"")+'</button>'+
  '<div class="task-body"><div class="task-title '+(isDone(t)?"done":"")+'">'+esc(t.title)+'</div>'+
  '<div class="meta"><span>'+esc(label)+'</span><span>· '+esc(due)+'</span>'+
  (t.time?'<span>🕘 '+esc(t.time)+'</span>':"")+
  (t.priority==="Alta"?'<span class="tag warn">Prioritario</span>':"")+
  (t.repeat&&t.repeat!=="none"?'<span>🔁 '+esc(t.repeat)+'</span>':"")+
  (taskKind(t)==="Asignación"?'<span class="tag">'+esc(t.status)+'</span>':"")+
  '</div>'+goalStepsMarkup(t)+'</div>'+
  '<button class="btn small" data-edit="'+esc(t.id)+'">Ver</button></div>';
}
function listTask(ts,msg){return ts.length?'<div>'+ts.map(rowTask).join("")+'</div>':'<div class="empty">'+esc(msg||"No hay tareas en esta sección")+'</div>'}
function rollingDays(start){return Array.from({length:7},(_,i)=>addDays(start,i))}
function days(){const today=TODAY();return '<div class="days">'+rollingDays(today).map(day=>{const d=parseLocal(day);return '<div class="day '+(day===today?"today":"")+'" data-date="'+day+'">'+["D","L","M","M","J","V","S"][d.getDay()]+'<b>'+d.getDate()+'</b></div>'}).join("")+'</div>'}
function areas(){return '<div class="areas">'+state.categories.map(c=>'<button class="area" data-area="'+esc(c.id)+'"><span class="area-icon'+(c.id==="congregacion"?" jw-area-icon":"")+'">'+categoryIcon(c)+'</span><span><b>'+esc(c.name)+'</b><small>'+esc(c.description||"Organización personal")+'</small></span></button>').join("")+'</div>'}

function dayTitle(date){
 return new Intl.DateTimeFormat("es-CL",{weekday:"long",day:"numeric",month:"long"}).format(parseLocal(date));
}
function sortSchedule(items){
 return [...items].sort((a,b)=>{
  const date=(a.due||"9999").localeCompare(b.due||"9999");
  if(date)return date;
  if(a.time&&b.time&&a.time!==b.time)return a.time.localeCompare(b.time);
  if(a.time&&!b.time)return -1;
  if(!a.time&&b.time)return 1;
  return ({Alta:0,Normal:1,Baja:2}[a.priority]??1)-({Alta:0,Normal:1,Baja:2}[b.priority]??1);
 });
}
function nextAppointment(){
 const today=TODAY(),clock=new Date(),hour=String(clock.getHours()).padStart(2,"0")+":"+String(clock.getMinutes()).padStart(2,"0");
 const tasks=active().filter(t=>t.due&&t.time&&t.due>=today&&(t.due>today||t.time>=hour))
  .map(t=>({date:t.due,time:t.time,title:t.title,area:catName(t),id:t.id,external:false}));
 const external=connected?googleEvents.filter(e=>e.start?.dateTime).map(e=>{
  const timestamp=e.start.dateTime;
  const d=new Date(timestamp),valid=!Number.isNaN(d.getTime());
  const date=valid?iso(d):timestamp.slice(0,10);
  const time=valid?String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"):timestamp.slice(11,16);
  return {date,time,title:e.summary||"Compromiso",area:"Google Calendar",external:true};
 }).filter(e=>e.date>=today&&(e.date>today||e.time>=hour)):[];
 return [...tasks,...external].sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))[0]||null;
}
function compactTask(t){
 const day=t.due?(t.due<TODAY()?"Atrasado · "+display(t.due):t.due===TODAY()?"Hoy":display(t.due)):"Sin fecha";
 return '<div class="dash-task">'+
  '<button class="check" data-toggle="'+esc(t.id)+'" aria-label="Marcar como realizada: '+esc(t.title)+'" title="Marcar realizada"></button>'+
  '<div class="dash-task-main"><div class="dash-task-title">'+esc(t.title)+'</div>'+
  '<div class="dash-task-detail">'+esc(catName(t))+' · '+(t.time?esc(t.time)+' · ':"")+esc(day)+
  (t.priority==="Alta"?'<span class="priority-mark">Prioridad alta</span>':"")+'</div></div>'+
  '<button class="open-task" data-edit="'+esc(t.id)+'" aria-label="Abrir '+esc(t.title)+'">Abrir</button></div>';
}
function dashboardRows(items){
 return items.length?'<div class="dash-task-list">'+items.map(compactTask).join("")+'</div>':
 '<div class="dash-empty"><p>No hay pendientes para esta selección.</p><button class="btn small" id="add-list">Crear pendiente</button></div>';
}
function homeFocusItems(){
 const all=active(),now=TODAY(),end=addDays(now,6);
 const late=sortSchedule(all.filter(t=>t.due&&t.due<now));
 const today=sortSchedule(all.filter(t=>t.due===now));
 const upcoming=sortSchedule(all.filter(t=>t.due&&t.due>now&&t.due<=end));
 const picks=(state.settings.weeklyPicks||[]).map(id=>all.find(t=>t.id===id)).filter(Boolean);
 let items,title;
 if(homeMode==="overdue"){items=late;title="Atrasados"}
 else if(homeMode==="today"){items=today;title="Para hoy"}
 else if(homeMode==="week"){items=upcoming;title="Próximos 7 días"}
 else if(homeMode==="day"){items=sortSchedule(all.filter(t=>t.due===homeSelectedDay));title="Para "+dayTitle(homeSelectedDay)}
 else{
  const seen=new Set();
  items=[...late,...today,...picks,...upcoming].filter(t=>{
   if(seen.has(t.id))return false;seen.add(t.id);return true;
  });
  title="Qué hacer ahora";
 }
 return {items:items.slice(0,5),count:items.length,title};
}
function quickSync(){
 const linked=Boolean(cloudClient?.connected()),last=state.settings.lastAutoSynced;
 const short=last&&!Number.isNaN(Date.parse(last))?new Date(last).toLocaleDateString("es-CL",{day:"numeric",month:"short"}):"Pendiente";
 return '<div class="quick-sync" aria-label="Estado de Google Drive">'+
 '<span class="sync-indicator '+(linked?"sync-ready":"")+'" aria-hidden="true"></span>'+
 '<span class="quick-sync-info"><span class="quick-sync-title">Google Drive</span>'+
 '<span class="quick-sync-detail">'+(linked?"Última: "+esc(short):"Sin conectar")+'</span></span>'+
 '<button class="quick-sync-link" data-view="ajustes">'+(linked?"Configurar":"Conectar Google")+'</button></div>';
}
function homeDayStrip(){
 const today=TODAY(),selected=homeMode==="day"?homeSelectedDay:today;
 return '<div class="home-day-header"><h2>Próximos siete días</h2><button class="text-action" data-view="agenda">Abrir agenda</button></div>'+
 '<div class="home-days" aria-label="Elegir día">'+rollingDays(today).map(date=>{
  const d=parseLocal(date),count=active().filter(t=>t.due===date).length;
  return '<button class="home-day '+(date===today?"is-today ":"")+(date===selected?"is-selected":"")+'" data-home-day="'+date+'" aria-pressed="'+(homeMode==="day"&&date===homeSelectedDay?"true":"false")+'">'+
   '<span>'+["dom","lun","mar","mié","jue","vie","sáb"][d.getDay()]+'</span>'+
   '<b>'+d.getDate()+'</b>'+
   '<i class="'+(count?"has-items":"")+'" aria-label="'+count+' tareas"></i></button>';
 }).join("")+'</div>';
}
function homeAreaSummary(){
 return '<details class="home-disclosure"><summary>Mis áreas <span>Ver categorías</span></summary>'+
 '<div class="home-area-grid">'+state.categories.map(c=>
 '<button class="home-area" data-area="'+esc(c.id)+'"><span class="home-area-icon">'+categoryIcon(c)+'</span><span>'+esc(c.name)+'</span><b>'+active().filter(t=>catId(t)===c.id).length+'</b></button>'
 ).join("")+'</div></details>';
}
function week(){
 const now=TODAY(),all=active(),end=addDays(now,6);
 const late=all.filter(t=>t.due&&t.due<now),today=all.filter(t=>t.due===now);
 const upcoming=all.filter(t=>t.due&&t.due>now&&t.due<=end),undated=all.filter(t=>!t.due);
 const focus=homeFocusItems(),appointment=nextAppointment();
 const stat=(mode,value,label)=>'<button class="dash-stat '+(homeMode===mode?"dash-stat-selected":"")+'" data-home-mode="'+mode+'" aria-pressed="'+(homeMode===mode?"true":"false")+'"><b>'+value+'</b><span>'+label+'</span></button>';
 const appointmentHtml=appointment?'<section class="next-appointment"><div class="section-kicker">Próximo compromiso</div>'+
 '<div class="next-appointment-main"><div class="appointment-time">'+esc(appointment.time)+'</div>'+
 '<div class="appointment-details"><strong>'+esc(appointment.title)+'</strong><span>'+esc(appointment.area)+' · '+esc(appointment.date===now?"Hoy":display(appointment.date))+'</span></div>'+
 (appointment.external?'': '<button class="text-action" data-edit="'+esc(appointment.id)+'">Abrir</button>')+'</div></section>':"";
 return '<div class="dashboard-head"><div><div class="dash-date">'+esc(dayTitle(now))+'</div><h1>Mi día</h1>'+
 '<p>Todo lo importante, a la vista.</p></div>'+quickSync()+'</div>'+
 '<section class="dashboard-stats" aria-label="Resumen de pendientes">'+
 stat("today",today.length,"Para hoy")+stat("overdue",late.length,"Atrasados")+stat("week",upcoming.length,"Siguientes 7 días")+'</section>'+
 appointmentHtml+
 '<section class="focus-panel"><div class="focus-title"><div><div class="section-kicker">Tus pendientes</div><h2>'+esc(focus.title)+'</h2></div>'+
 (homeMode!=="focus"?'<button class="text-action" data-home-mode="focus">Ver lo importante</button>':
 '<span class="counter-label">'+focus.count+' en total</span>')+'</div>'+
 dashboardRows(focus.items)+(focus.count>5?'<button class="text-action" data-view="pendientes">Ver todos los pendientes</button>':"")+'</section>'+
 homeDayStrip()+
 (undated.length?'<div class="unscheduled-strip"><div><strong>Sin programar</strong><span>'+undated.length+' tareas sin fecha</span></div><button class="text-action" data-home-unscheduled>Organizar</button></div>':"")+
 '<details class="home-disclosure"><summary>Revisión semanal <span>Tres prioridades y avances</span></summary><div class="home-review">'+weeklyReview()+'</div></details>'+
 homeAreaSummary();
}

function weeklyReview(){
 const today=TODAY(),completed=state.tasks.filter(t=>isDone(t)&&t.completedAt&&t.completedAt.slice(0,10)>=addDays(today,-7));
 const delayed=active().filter(t=>t.due&&t.due<today);
 const picks=(state.settings.weeklyPicks||[]).filter(id=>state.tasks.some(t=>t.id===id&&!isDone(t))).slice(0,3);
 const options=sortTasks(active()).filter(t=>!picks.includes(t.id)).slice(0,8);
 const headingText=new Date().getDay()===0?"🌤️ Hoy es domingo: revisa tus avances y define hasta 3 prioridades.":"Elige hasta 3 prioridades para concentrarte esta semana.";
 return '<div class="row between"><span class="muted small">Completadas últimos 7 días</span><b>'+completed.length+'</b></div>'+
 '<div class="row between" style="margin:11px 0"><span class="muted small">Pendientes atrasados</span><b>'+delayed.length+'</b></div>'+
 '<p class="small muted">'+headingText+'</p><div class="review-picks"><strong>Mis 3 prioridades ('+picks.length+'/3)</strong>'+
 (picks.length?picks.map(id=>{
  const t=state.tasks.find(x=>x.id===id);
  return '<div class="review-line"><span>'+esc(t.title)+'</span><button class="btn small" data-week-pick="'+esc(id)+'" title="Quitar prioridad">×</button></div>';
 }).join(""):'<p class="tiny muted">Todavía no elegiste prioridades.</p>')+
 '</div>'+
 (picks.length<3&&options.length?'<p class="tiny muted">Agregar una prioridad:</p><div class="review-options">'+options.map(t=>
 '<button class="btn small" data-week-pick="'+esc(t.id)+'">＋ '+esc(t.title)+'</button>').join("")+'</div>':"");
}
async function toggleWeeklyPick(id){
 const old=state.settings.weeklyPicks||[],current=old.filter(x=>state.tasks.some(t=>t.id===x&&!isDone(t)));
 if(current.includes(id))state.settings.weeklyPicks=current.filter(x=>x!==id);
 else if(current.length>=3){toast("Puedes seleccionar hasta tres prioridades");return}
 else state.settings.weeklyPicks=[...current,id];
 try{await save();render();toast("Prioridades semanales actualizadas")}
 catch(e){state.settings.weeklyPicks=old;toast("No se pudieron guardar las prioridades");console.error(e)}
}
function congregation(){const group=sub=>sortTasks(active().filter(t=>catId(t)==="congregacion"&&t.subarea===sub));const name=getCat("congregacion")?.name||"Congregación";return heading(name,"Responsabilidades organizadas por función").replace("<h1>"+esc(name)+"</h1>",'<h1 class="congregation-title"><img src="https://upload.wikimedia.org/wikipedia/commons/c/c9/JW_Logo.svg" alt="JW.ORG" width="34" height="34" decoding="async">'+esc(name)+'</h1>')+S.map((sub,i)=>card((["📖 ","🧭 ","🎙️ "][i])+sub,listTask(group(sub),"No hay pendientes registrados."),'<button class="btn small" data-new-sub="'+esc(sub)+'">+ Agregar</button>')).join("")+'<div class="note">Registra recordatorios generales. No guardes datos pastorales confidenciales ni información privada de otras personas.</div>'}
function pending(){
 let all=sortTasks(state.tasks.filter(t=>{
  if(filter==="Terminadas")return isDone(t);
  if(isDone(t))return false;
  if(filter==="Todas")return true;
  if(filter==="En espera")return t.type==="seguimiento";
  if(filter==="Sin fecha")return !t.due;
  return catId(t)===filter;
 }));
 if(search)all=all.filter(t=>(t.title+" "+t.notes+" "+catName(t)).toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es")));
 const labels={"Todas":"Todos los pendientes","En espera":"En espera","Terminadas":"Terminadas","Sin fecha":"Sin programar"};
 const title=labels[filter]||state.categories.find(c=>c.id===filter)?.name||"Pendientes";
 const count=id=>active().filter(t=>catId(t)===id).length;
 const catButtons=state.categories.map(c=>
 '<button class="category-choice '+(filter===c.id?"chosen":"")+'" data-filter="'+esc(c.id)+'" aria-pressed="'+(filter===c.id?"true":"false")+'"><span class="category-choice-icon">'+categoryIcon(c)+'</span>'+
 '<span>'+esc(c.name)+'</span><b>'+count(c.id)+'</b></button>').join("");
 const statusButtons=[{id:"Todas",label:"Todos"},{id:"En espera",label:"En espera"},{id:"Terminadas",label:"Terminadas"},{id:"Sin fecha",label:"Sin fecha"}].map(opt=>
 '<button class="status-choice '+(filter===opt.id?"chosen":"")+'" data-filter="'+opt.id+'" aria-pressed="'+(filter===opt.id?"true":"false")+'">'+opt.label+'</button>').join("");
 return heading("Pendientes","Organizados por área y estado")+
 (lastDeletedId&&state.trash.some(x=>x.id===lastDeletedId)?'<div class="save-banner"><span>Pendiente eliminado</span><button class="btn small" data-restore-task="'+esc(lastDeletedId)+'">Deshacer</button></div>':"")+
 (lastSavedId&&state.tasks.some(t=>t.id===lastSavedId)?'<div class="save-banner" role="status"><span>Guardado en este dispositivo</span><button class="btn small" data-edit="'+esc(lastSavedId)+'">Ver registro</button></div>':"")+
 '<div class="pending-toolbar"><input type="search" class="search" id="search" placeholder="Buscar pendientes…" value="'+esc(search)+'" aria-label="Buscar pendientes">'+
 '<button class="btn primary" id="add-list">Añadir tarea</button></div>'+
 '<div class="section-label">Mis áreas</div><div class="category-choices">'+catButtons+'</div>'+
 '<div class="status-choices">'+statusButtons+'</div>'+
 '<section class="pending-list-panel"><div class="pending-list-title"><h2>'+esc(title)+'</h2><span>'+all.length+' registro'+(all.length===1?"":"s")+'</span></div>'+
 listTask(all,"No tienes pendientes en esta selección.")+'</section>'+
 '<div class="pending-links"><button class="text-action" id="manage-categories">Editar categorías</button><button class="text-action" data-view="papelera">Papelera ('+(state.trash?.length||0)+')</button></div>';
}
function agenda(){
 const first=addDays(TODAY(),agendaOffset*7),weekDates=Array.from({length:7},(_,i)=>addDays(first,i)),last=weekDates[6];
 const dated=sortSchedule(active().filter(t=>t.due));
 const google=connected?googleEvents:[],labels=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
 if(!weekDates.includes(agendaSelectedDay))agendaSelectedDay=first;
 const eventsFor=day=>{
  const personal=dated.filter(t=>t.due===day).map(t=>({time:t.time||"",title:t.title,area:catName(t),id:t.id,external:false}));
  const external=google.filter(e=>(e.start?.date||e.start?.dateTime?.slice(0,10))===day).map(e=>({
   time:e.start?.dateTime?.slice(11,16)||"",title:e.summary||"Evento",area:"Google Calendar",external:true
  }));
  return [...personal,...external].sort((a,b)=>(a.time||"99:99").localeCompare(b.time||"99:99"));
 };
 const days='<div class="agenda-week-grid">'+weekDates.map(day=>{
  const d=parseLocal(day),items=eventsFor(day);
  return '<div class="agenda-day '+(day===TODAY()?"agenda-today ":"")+(day===agendaSelectedDay?"agenda-selected":"")+'">'+
   '<button class="agenda-day-select" data-agenda-day="'+day+'" aria-pressed="'+(day===agendaSelectedDay?"true":"false")+'"><span>'+labels[d.getDay()]+'</span><b>'+d.getDate()+'</b><small>'+items.length+' evento'+(items.length===1?"":"s")+'</small></button>'+
   '<div class="agenda-day-events">'+items.slice(0,2).map(e=>
    e.external?'<div class="agenda-event agenda-external"><small>'+esc(e.time||"Todo el día")+'</small><span>'+esc(e.title)+'</span></div>':
    '<button class="agenda-event" data-edit="'+esc(e.id)+'"><small>'+esc(e.time||"Sin hora")+'</small><span>'+esc(e.title)+'</span></button>').join("")+
   (items.length>2?'<button class="agenda-more" data-agenda-day="'+day+'">+'+(items.length-2)+' más</button>':"")+'</div></div>';
 }).join("")+'</div>';
 const selected=eventsFor(agendaSelectedDay);
 const timeline=selected.length?'<div class="agenda-timeline">'+selected.map(e=>
  '<div class="timeline-item"><div class="timeline-hour">'+esc(e.time||"Flexible")+'</div>'+
  '<div class="timeline-body"><strong>'+esc(e.title)+'</strong><span>'+esc(e.area)+'</span></div>'+
  (e.external?'':'<button class="text-action" data-edit="'+esc(e.id)+'">Abrir</button>')+'</div>').join("")+'</div>':
 '<div class="dash-empty"><p>Este día no tiene compromisos.</p><button class="btn small" id="add-list">Añadir tarea</button></div>';
 return heading("Agenda","Organiza tus compromisos por día y hora")+
 '<div class="agenda-nav"><button class="btn small" data-agenda="-1" aria-label="Semana anterior">← Anterior</button>'+
 '<span>'+esc(display(first))+' — '+esc(display(last))+'</span>'+
 '<button class="btn small" data-agenda="1" aria-label="Semana siguiente">Siguiente →</button>'+
 '<button class="text-action" data-agenda="today">Hoy</button></div>'+
 days+
 '<section class="agenda-selected-panel"><div class="focus-title"><div><div class="section-kicker">Agenda seleccionada</div><h2>'+esc(dayTitle(agendaSelectedDay))+'</h2></div><span class="counter-label">'+selected.length+' eventos</span></div>'+timeline+'</section>'+
 '<details class="home-disclosure"><summary>Próximos compromisos <span>Ver lista completa</span></summary>'+listTask(dated.filter(t=>t.due>=TODAY()).slice(0,18),"No hay próximas fechas.")+'</details>'+
 (!connected?'<div class="agenda-calendar-note"><span>Google Calendar no conectado</span><button class="text-action" data-view="ajustes">Configurar</button></div>':"");
}
const RELEASE_HISTORY=[{"version":"1.5.0","date":"10 de noviembre de 2026","name":"Tablero y diseño profesional","changes":["El inicio Mi día prioriza lo vencido, lo de hoy y los próximos siete días sin repetir pendientes.","Puedes seleccionar días, abrir el próximo compromiso y consultar tareas sin fecha desde el tablero.","Agenda presenta una vista cronológica por día y Pendientes organiza las áreas y estados.","Inter, iconos lineales y una identidad visual más limpia y consistente en iPhone y computador."]},{"version":"1.4.0","date":"10 de noviembre de 2026","name":"Organización y recuperación","changes":["Papelera de recuperación durante 30 días y opción de deshacer.","Grandes Metas con etapas y avance visual.","Avisos dentro de Mi Panel, agenda de siete días, búsqueda y prioridades semanales."]},{"version":"1.3.0","date":"10 de noviembre de 2026","name":"Seguridad de sincronización","changes":["Todos los archivos nuevos de Google Drive se cifran con clave AES-GCM antes de subirse.","Migración protegida de archivos antiguos sin cifrar y eliminación posterior a la verificación.","La misma clave debe introducirse en cada dispositivo; nunca se almacena en el repositorio."]},{"version":"1.2.9","date":"10 de noviembre de 2026","name":"Siete días desde hoy","changes":["La franja de días de Mi semana comienza en la fecha actual y avanza hasta seis días después.","El rango superior y las prioridades utilizan los mismos siete días consecutivos.","La vista se actualiza al cambiar de día, al volver a la aplicación o durante su uso."]},{"version":"1.2.8","date":"10 de noviembre de 2026","name":"Sincronización al alcance","changes":["Acceso directo a Actualizar ahora en Mi semana, sin entrar a Ajustes.","Estado de conexión Google y última sincronización visibles en la pantalla principal.","Acceso a Conectar Google desde Mi semana cuando la sesión no está activa."]},{"version":"1.2.7","date":"10 de noviembre de 2026","name":"Actualizar sincronización al instante","changes":["Nuevo botón Actualizar ahora en Ajustes → Sincronización automática.","Indicador Sincronizando mientras se intercambian datos; fecha y hora de la última sincronización al finalizar.","La sincronización automática continúa funcionando sin intervención."]},{"version":"1.2.6","date":"9 de noviembre de 2026","name":"Sincronización sencilla con Google","changes":["Google Drive se conecta sin contraseñas adicionales y sincroniza mientras Mi Panel está abierto y autorizado.","Los archivos cifrados anteriores permanecen intactos; se utiliza una nueva área de sincronización.","Copia de protección local antes de mezclar información entre dispositivos."]},{"version":"1.2.5","date":"9 de noviembre de 2026","name":"Conexión Drive más clara","changes":["Explicación del error de descifrado en iPhone sin sobrescribir los archivos de Drive.","Campo de clave con botón mostrar/ocultar y ayuda para escribir la misma clave en ambos dispositivos.","Desconexión segura tras error de clave para reintentar sin mezclar datos."]},{"version":"1.2.4","date":"9 de noviembre de 2026","name":"Google Drive y transparencia","changes":["Client ID OAuth de Mi Panel preconfigurado para Google Drive y Calendar.","Respaldo cifrado reciente antes de la primera sincronización en dispositivos con tareas.","Mejoras de autorización en Safari/iPhone y fechas de actualización de las tareas.","Historial de versiones incorporado en Ajustes."]},{"version":"1.2.2","date":"9 de noviembre de 2026","name":"Guardado verificable y PWA","changes":["Verificación del guardado de pendientes y categorías en IndexedDB.","Diagnóstico del almacenamiento y actualización de la aplicación sin borrar datos.","Categorías personalizables, Grandes Metas y primera sincronización cifrada con Drive."]},{"version":"0.1","date":"9 de noviembre de 2026","name":"Primera versión funcional","changes":["Organizador personal con semana, pendientes y agenda.","Respaldo local cifrado y recuperación protegida.","Base PWA publicada mediante GitHub Pages."]}];
function releaseHistory(){
 const item=r=>'<li class="release-entry"><div class="release-meta"><span class="release-version">v'+esc(r.version)+'</span><span class="muted small">'+esc(r.date)+'</span></div><strong>'+esc(r.name)+'</strong><ul>'+r.changes.map(change=>'<li>'+esc(change)+'</li>').join("")+'</ul></li>';
 return card("📜 Historial de versiones",'<p class="small muted">Consulta las novedades de Mi Panel y las mejoras incorporadas.</p>'+
 '<ol class="release-list release-latest">'+item(RELEASE_HISTORY[0])+'</ol>'+
 '<details class="release-older" id="release-history"><summary>Ver versiones anteriores</summary><ol class="release-list">'+RELEASE_HISTORY.slice(1).map(item).join("")+'</ol></details>');
}
function settings(){const bk=state.settings.lastBackup?new Date(state.settings.lastBackup).toLocaleString("es-CL"):"Ninguno";return heading("Ajustes","Datos locales y sincronización opcional")+card("🩺 Estado de Mi Panel",'<p class="small muted">Versión <b>'+APP_VERSION+'</b>. Hay <b>'+state.tasks.length+'</b> registros cargados en este dispositivo.</p><p class="small muted">Los datos del iPhone instalado y los de Safari pueden estar separados hasta completar la sincronización.</p><div class="actions"><button class="btn" id="storage-check">Comprobar guardado</button><button class="btn primary" id="force-refresh">Actualizar aplicación</button></div><p id="storage-diagnostic" class="small muted">La comprobación lee directamente la base local sin modificarla.</p>')+card("🔐 Respaldo cifrado",'<p class="small muted">Última exportación: '+esc(bk)+'. Sin sincronización activa, importa el archivo más reciente en el otro dispositivo.</p><div class="actions"><button class="btn primary" id="export">↓ Exportar respaldo</button><button class="btn" id="restore">↑ Restaurar archivo</button></div><p class="tiny muted">Antes de restaurar se descargará una copia cifrada de protección de los datos actuales. Guardarás ambas copias manualmente.</p>')+card("📅 Google Calendar",'<p class="small muted">Opcional: autoriza Google Calendar para consultar eventos y crear asignaciones.</p><button class="btn" id="google-connect" type="button">'+(connected?"Volver a conectar Calendar":"Conectar Google Calendar")+'</button><details style="margin-top:12px"><summary class="small muted">Opciones avanzadas de Google</summary><form id="google-config" style="margin-top:12px"><div class="field"><label>Client ID OAuth (aplicación web)</label><input name="clientId" autocomplete="off" value="'+esc(state.settings.googleClientId)+'"></div><button class="btn small" type="submit">Guardar Client ID</button></form></details>')+card("🗑️ Papelera",'<p class="small muted">Puedes recuperar pendientes borrados durante 30 días. Las eliminaciones se marcan para evitar que vuelvan a aparecer al sincronizar.</p><button class="btn" data-view="papelera">Abrir Papelera ('+(state.trash?.length||0)+')</button>')+card("🗂️ Mis categorías",'<p class="small muted">Renombra categorías, cambia sus emojis y agrega otras nuevas. Los pendientes se mantienen asociados aunque cambies el nombre.</p><button class="btn" id="manage-categories">Administrar categorías</button>')+card("☁️ Sincronización automática",
 '<p class="small muted">Tus pendientes y categorías se comparten entre el PC y el iPhone al abrir Mi Panel o guardar cambios, mientras Google esté autorizado.</p>'+
 '<p class="small muted"><b>Protegido por cifrado AES-GCM.</b> Utiliza la misma cuenta Google y exactamente la misma clave en todos los dispositivos. La clave no se guarda ni se envía a GitHub o Drive.</p>'+
 '<div class="field"><label>Clave privada de cifrado (mínimo 12 caracteres)</label><input id="drive-pass" type="password" autocomplete="off" minlength="12" placeholder="La misma en iPhone y computador"></div><div class="actions">'+(cloudClient?.connected()?'<span class="note">🔐 Conectado y protegido</span>':'<button class="btn primary" id="drive-connect">Conectar cuenta de Google</button>')+'<button class="btn" id="drive-now" '+(cloudClient?.connected()?"":"disabled")+'>🔄 Actualizar ahora</button></div>'+
 '<p id="drive-status" class="small muted" role="status">'+esc(cloudClient?.status()||"Sin conectar")+'</p>'+
 '<p class="tiny muted">Las tareas se cifran <b>antes</b> de subirse a Drive. Al conectar, Mi Panel intenta retirar archivos antiguos sin cifrar después de verificar una copia nueva. Revisa el estado para confirmar la limpieza. Requiere volver a ingresar la clave y autorizar Google al reiniciar la app.</p>'+
 '<details style="margin-top:12px"><summary class="small muted">Seguridad y recuperación</summary><div class="actions"><button class="btn small" id="drive-restore-protection">Recuperar copia local anterior</button><button class="btn small" id="drive-disconnect">Desconectar Google Drive</button></div><p class="tiny muted">La primera vez se conserva una copia local antes de combinar las tareas. Los respaldos manuales siguen cifrados.</p></details>')+
 card("🎨 Apariencia",'<div class="actions">'+["auto","light","dark"].map(x=>'<button class="btn small '+(state.settings.theme===x?"primary":"")+'" data-theme="'+x+'">'+({auto:"Automático",light:"Claro",dark:"Oscuro"}[x])+'</button>').join("")+'</div>')+card("🔒 Privacidad",'<p class="small muted">Mi Panel no publica tareas en GitHub. Cada navegador guarda sus datos localmente; si autorizas Google Drive, sincroniza los datos en su espacio privado sin contraseña de cifrado adicional, mientras la aplicación está abierta y con permiso vigente. La página GitHub Pages es pública, pero no contiene tus tareas.</p>')+releaseHistory()}
function render(){lastRenderedDay=TODAY();theme();renderStorageWarning();$("#app").innerHTML=view==="semana"?week():view==="congregacion"?congregation():view==="pendientes"?pending():view==="agenda"?agenda():view==="buscar"?globalSearch():view==="papelera"?trashView():settings();$$("[data-view].nav-btn").forEach(b=>b.classList.toggle("chosen",b.dataset.view===view));$("#connection").textContent=navigator.onLine?"● En línea":"● Sin conexión";$("#connection").classList.toggle("offline",!navigator.onLine)}
function navigate(v){view=v;filter=v==="pendientes"?filter:"Todas";search="";if(v!=="buscar")globalQuery="";render();window.scrollTo(0,0)}
function updateDateIfNeeded(){if(view==="semana"&&TODAY()!==lastRenderedDay)render()}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")updateDateIfNeeded()});
setInterval(updateDateIfNeeded,60000);
function suggest(s){const t=s.toLowerCase();let area="Personal",sub="",type="tarea",repeat="none";if(/reuni[oó]n|asignaci[oó]n|discurso|lectura b[ií]blica|presidencia|oraci[oó]n/.test(t)){area="Congregación";sub="Asignaciones"}else if(/territorio|predicaci[oó]n|servicio|grupo de predicaci[oó]n/.test(t)){area="Congregación";sub="Superintendente de servicio"}else if(/congregaci[oó]n|sal[oó]n del reino|ancianos|climatizaci[oó]n/.test(t)){area="Congregación";sub="Anciano"}else if(/autowallet|mi.?auto|github|supabase|mercado pago|netlify|plus/.test(t))area="MiAuto Wallet";else if(/municipalidad|empleo|postulaci[oó]n|oficina|trabajo/.test(t))area="Trabajo";
if(/respuesta|respondi[oó]|seguimiento|consultar|reclamo/.test(t))type="seguimiento";
if(/cada semana|semanal|todos los lunes|todos los martes|todos los mi[eé]rcoles|todos los jueves|todos los viernes|todos los s[aá]bados|todos los domingos/.test(t))repeat="weekly";
if(/cada mes|mensual|todos los meses/.test(t))repeat="monthly";
if(/cada a[ñn]o|anual/.test(t))repeat="yearly";
let due="";if(/\bma[ñn]ana\b/.test(t))due=addDays(TODAY(),1);else if(/\bhoy\b/.test(t))due=TODAY();
const names=["domingo","lunes","martes","miércoles","miercoles","jueves","viernes","sábado","sabado"];if(!due){for(let i=0;i<names.length;i++)if(t.includes(names[i])){const d=new Date();const delta=(((i-d.getDay())+7)%7)||7;due=addDays(TODAY(),delta);break}}
const ms=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];const re=t.match(/\b(\d{1,2})\s+de\s+([a-záéíóú]+)(?:\s+de\s+(\d{4}))?/);if(re){const mi=ms.indexOf(re[2]);if(mi>=0){let y=re[3]?Number(re[3]):new Date().getFullYear();const date=iso(new Date(y,mi,Number(re[1])));if(!re[3]&&date<TODAY())y++;due=iso(new Date(y,mi,Number(re[1])))}}return {area,subarea:sub,type,due,repeat}}
function field(label,control){return '<div class="field"><label>'+label+'</label>'+control+'</div>'}
function modal(html){$("#modal").innerHTML='<div class="overlay" id="overlay"><div class="sheet" role="dialog" aria-modal="true">'+html+'</div></div>'}
function close(){ $("#modal").innerHTML=""}
function form(t,areaHint){const x=t||{id:"",title:"",areaId:S.includes(areaHint)?"congregacion":getCat(areaHint)?.id||filter&&getCat(filter)?.id||"personal",subarea:S.includes(areaHint)?areaHint:"",type:"tarea",due:"",time:"",priority:"Normal",status:"Pendiente",notes:"",repeat:"none"};const currentArea=catId(x);const sub=currentArea==="congregacion"?x.subarea:"";modal('<div class="sheethead"><h2>'+(t?"Editar pendiente":"Nuevo pendiente")+'</h2><button class="x" data-close aria-label="Cerrar">×</button></div><form id="task-form"><input type="hidden" name="id" value="'+esc(x.id)+'">'+field("Escribe tu pendiente o asignación",'<textarea name="title" id="title" required placeholder="Por ejemplo: preparar discurso el próximo sábado">'+esc(x.title)+'</textarea>')+'<div class="note" id="smart">'+(t?"Puedes modificar los datos.":"Mientras escribes, Mi Panel sugerirá categoría, fecha y recurrencia.")+'</div>'+field("Categoría",'<select name="areaId" id="area">'+state.categories.map(c=>'<option value="'+esc(c.id)+'" '+(c.id===currentArea?"selected":"")+'>'+esc((c.emoji||"")+" "+c.name)+'</option>').join("")+'</select>')+'<div id="subwrap">'+field("Función congregacional",'<select name="subarea" id="sub">'+['',...S].map(s=>'<option value="'+esc(s)+'" '+(s===sub?"selected":"")+'>'+(s?esc(s):"Sin función")+'</option>').join("")+'</select>')+'</div><div class="two">'+field("Fecha",'<input type="date" name="due" id="due" value="'+esc(x.due)+'">')+field("Hora (opcional)",'<input type="time" name="time" value="'+esc(x.time||"")+'">')+'</div><div class="two">'+field("Tipo",'<select name="type" id="type"><option value="tarea" '+(x.type==="tarea"?"selected":"")+'>Tarea</option><option value="seguimiento" '+(x.type==="seguimiento"?"selected":"")+'>En espera / seguimiento</option></select>')+field("Prioridad",'<select name="priority"><option '+(x.priority==="Normal"?"selected":"")+'>Normal</option><option '+(x.priority==="Alta"?"selected":"")+'>Alta</option><option '+(x.priority==="Baja"?"selected":"")+'>Baja</option></select>')+'</div>'+field("🔔 Avisar dentro de Mi Panel",'<select name="remindDays">'+[[-1,"Sin aviso"],[0,"El mismo día"],[1,"1 día antes"],[3,"3 días antes"],[7,"7 días antes"],[30,"30 días antes"]].map(p=>'<option value="'+p[0]+'" '+(Number(x.remindDays??1)===p[0]?"selected":"")+'>'+p[1]+'</option>').join("")+'</select>')+field("🔁 Repetición",'<select id="repeat" name="repeat">'+[["none","No se repite"],["weekly","Semanal"],["monthly","Mensual"],["yearly","Anual"]].map(o=>'<option value="'+o[0]+'" '+(x.repeat===o[0]?"selected":"")+'>'+o[1]+'</option>').join("")+'</select>')+'<div id="status-wrap"></div><div id="goalwrap">'+field("🎯 Etapas de esta meta (una por línea)",'<textarea id="goal-steps" name="goalSteps" placeholder="Investigar opciones&#10;Preparar presupuesto&#10;Alcanzar la meta">'+esc((x.milestones||[]).map(m=>m.text).join("\n"))+'</textarea>')+'</div>'+field("Notas personales (sin información confidencial)",'<textarea name="notes" placeholder="Opcional">'+esc(x.notes||"")+'</textarea>')+'<div class="actions"><button class="btn primary" type="submit">💾 Guardar en Mi Panel</button><button type="button" class="btn" data-close>Cancelar</button>'+(t?'<button type="button" class="btn danger" data-delete="'+esc(t.id)+'">Eliminar</button>':"")+'</div></form><div class="line"><h2>Importar una captura</h2><p class="small muted">Reconocimiento de texto en el navegador. La primera vez requiere internet para cargar el motor OCR en español. Verifica cada dato extraído.</p><input id="ocr-file" type="file" accept="image/*"><button class="btn small" style="margin-top:10px" id="ocr">Reconocer texto</button><div id="ocr-result" class="tiny muted"></div></div>');updateSub();updateStatus(x.status);if(!t){if(getCat(areaHint)||S.includes(areaHint))$("#area").dataset.manual="1";$("#title").addEventListener("input",autoSuggest);$("#title").focus()}$("#area").addEventListener("change",()=>{$("#area").dataset.manual="1";updateSub();updateStatus()});$("#due").addEventListener("change",()=>{$("#due").dataset.manual="1"});$("#sub").addEventListener("change",()=>updateStatus());}
function manageCategories(){
 modal('<div class="sheethead"><h2>🗂️ Mis categorías</h2><button class="x" data-close>×</button></div>'+
 '<p class="muted small">Puedes agregar, renombrar o cambiar el emoji. Los pendientes existentes siguen en su categoría.</p>'+
 '<div class="cat-list">'+state.categories.map(c=>'<div class="strip"><span class="row"><span class="cat-symbol">'+categoryIcon(c)+'</span><span><b>'+esc(c.name)+'</b><span class="muted small" style="display:block">'+state.tasks.filter(t=>catId(t)===c.id).length+' registros</span></span></span><button class="btn small" data-cat-edit="'+esc(c.id)+'">Editar</button></div>').join("")+'</div><div class="actions line"><button id="cat-new" class="btn primary">➕ Nueva categoría</button><button class="btn" data-close>Volver</button></div>');
}
function categoryForm(id){
 const c=state.categories.find(x=>x.id===id);
 modal('<div class="sheethead"><h2>'+(c?"Editar categoría":"Nueva categoría")+'</h2><button class="x" data-close>×</button></div>'+
 '<form id="category-form"><input type="hidden" name="id" value="'+esc(c?.id||"")+'">'+
 field("Nombre",'<input name="name" maxlength="45" required value="'+esc(c?.name||"")+'" placeholder="Ej.: Estudios">')+
 field("Emoji",'<input name="emoji" maxlength="12" value="'+esc(c?.emoji||"")+'" placeholder="🎓" '+(c?.id==="congregacion"?"disabled":"")+'>')+
 field("Descripción corta",'<input name="description" maxlength="95" value="'+esc(c?.description||"")+'" placeholder="Para qué usarás esta categoría">')+
 '<p class="note">'+(c?.id==="congregacion"?"El logo de Congregación se conserva aunque cambies su nombre.":"Las categorías son privadas y se guardan en este dispositivo.")+'</p>'+
 '<div class="actions"><button class="btn primary" type="submit">Guardar categoría</button><button class="btn" type="button" id="back-categories">Volver</button>'+(c&&!c.builtIn?'<button type="button" class="btn danger" data-cat-delete="'+esc(c.id)+'">Eliminar</button>':"")+'</div></form>');
}
async function saveCategory(form){
 const x=Object.fromEntries(new FormData(form).entries()),name=(x.name||"").trim(),id=x.id||"custom-"+uid();
 if(!name||name.length>45){toast("Ingresa un nombre válido");return}
 if(state.categories.some(c=>c.id!==id&&c.name.toLocaleLowerCase("es")===name.toLocaleLowerCase("es"))){toast("Ya existe una categoría con ese nombre");return}
 const old=state.categories.find(c=>c.id===id),prev=state.categories,prevTasks=state.tasks;
 const updatedAt=new Date().toISOString();
 const current={id,name,emoji:old?.id==="congregacion"?"":(x.emoji||"🗂️").trim().slice(0,12),description:(x.description||"").trim().slice(0,95),builtIn:old?.builtIn||false,updatedAt};
 state.categories=old?prev.map(c=>c.id===id?current:c):[...prev,current];
 if(old)state.tasks=state.tasks.map(t=>catId(t)===id?{...t,area:name}:t);
 try{const submit=form.querySelector("button[type=submit]");if(submit)submit.disabled=true;await save();manageCategories();toast("✓ Categoría guardada correctamente")}catch(e){state.categories=prev;state.tasks=prevTasks;const submit=form.querySelector("button[type=submit]");if(submit)submit.disabled=false;console.error(e);toast("Error al guardar categoría")}}
async function deleteCategory(id){
 const c=state.categories.find(x=>x.id===id);if(!c||c.builtIn)return;
 const used=state.tasks.filter(t=>catId(t)===id).length;
 if(used){toast("Mueve sus "+used+" pendientes a otra categoría antes de eliminarla");return}
 if(!confirm("¿Eliminar la categoría "+c.name+"?"))return;
 const old=state.categories;state.categories=old.filter(x=>x.id!==id);
 state.deletedCategories.push({id,deletedAt:new Date().toISOString()});
 try{await save();manageCategories();toast("Categoría eliminada")}catch(e){state.categories=old;console.error(e);toast("No se pudo eliminar")}}

function updateSub(){const sh=$("#area")?.value==="congregacion";$("#subwrap")?.classList.toggle("hidden",!sh);$("#goalwrap")?.classList.toggle("hidden",$("#area")?.value!=="grandes-metas");if(!sh&&$("#sub"))$("#sub").value=""}
function updateStatus(value){const assignment=$("#area")?.value==="congregacion"&&$("#sub")?.value==="Asignaciones";const opts=assignment?STAGES:["Pendiente","En proceso","Terminada"];$("#status-wrap").innerHTML=field("Estado",'<select name="status">'+opts.map(x=>'<option '+(x===(value||opts[0])?"selected":"")+'>'+x+'</option>').join("")+'</select>')}
function autoSuggest(){const p=suggest($("#title").value);if($("#area").dataset.manual!=="1"){$("#area").value=state.categories.find(c=>c.name===p.area)?.id||DEFAULT_CATEGORIES.find(c=>c.name===p.area)?.id||"personal";updateSub();$("#sub").value=p.subarea;updateStatus()}if(p.due&&$("#due").dataset.manual!=="1")$("#due").value=p.due;$("#type").value=p.type;$("#repeat").value=p.repeat;$("#smart").innerHTML="Sugerencia: <b>"+esc((state.categories.find(c=>c.name===p.area)?.name||p.area)+(p.subarea?" / "+p.subarea:""))+"</b>"+(p.due?" · "+esc(display(p.due)):"")+(p.repeat!=="none"?" · Repetición "+esc(p.repeat):"")+". Confirma o cambia los campos antes de guardar."}
async function readSavedTask(id){
 if(!db)throw new Error("IndexedDB no disponible");
 const stored=await new Promise((ok,fail)=>{
  const tx=db.transaction("kv","readonly"),request=tx.objectStore("kv").get("state");
  request.onsuccess=()=>ok(request.result);
  request.onerror=()=>fail(request.error||new Error("Fallo en lectura de comprobación"));
 });
 return stored?.tasks?.find(t=>t.id===id)||null;
}
async function saveForm(f){
 const data=Object.fromEntries(new FormData(f).entries()),title=String(data.title||"").trim();
 if(!title){toast("Escribe un título");return}
 if(!db){toast("No se guardó: almacenamiento no disponible");return}
 const previous=state.tasks,old=state.tasks.find(t=>t.id===data.id);
 const x={...data,title,id:old?.id||uid(),areaId:getCat(data.areaId)?.id||"personal"};
 x.area=getCat(x.areaId)?.name||"Personal";
 x.subarea=x.areaId==="congregacion"&&S.includes(data.subarea)?data.subarea:"";
 x.status=x.areaId==="congregacion"&&x.subarea==="Asignaciones"?data.status||"Recibida":data.status||"Pendiente";
 x.milestones=x.areaId==="grandes-metas"?parseGoalSteps(data.goalSteps,old?.milestones):old?.milestones||[];delete x.goalSteps;
 x.createdAt=old?.createdAt||new Date().toISOString();
 x.updatedAt=new Date().toISOString();
 x.completedAt=isDone(x)?old?.completedAt||new Date().toISOString():null;
 x.googleEventId=old?.googleEventId||null;
 const submit=f.querySelector('button[type="submit"]');
 if(submit){submit.disabled=true;submit.textContent="Guardando…"}
 state.tasks=old?state.tasks.map(t=>t.id===x.id?x:t):[x,...state.tasks];
 try{
  await save();
 }catch(e){
  state.tasks=previous;
  if(submit){submit.disabled=false;submit.textContent="💾 Guardar en Mi Panel"}
  console.error("Error de escritura en IndexedDB",e);
  toast("No se guardó: revisa el almacenamiento del navegador");
  return;
 }
 try{
  const persisted=await readSavedTask(x.id);
  if(!persisted||persisted.updatedAt!==x.updatedAt)throw new Error("No coincide la lectura después de guardar");
 }catch(e){
  console.warn("No se pudo confirmar la lectura posterior al guardado",e);
  toast("El dispositivo no confirmó el guardado. Revisa Ajustes.");
  if(submit){submit.disabled=false;submit.textContent="Reintentar guardar"}
  return;
 }
 lastSavedId=x.id;
 close();
 view="pendientes";filter=x.areaId;search="";
 render();window.scrollTo(0,0);
 toast("✅ Guardado y verificado: "+x.title.slice(0,48));
}
function nextDue(d,repeat){const dt=parseLocal(d);if(!dt)return "";if(repeat==="weekly")dt.setDate(dt.getDate()+7);if(repeat==="monthly")dt.setMonth(dt.getMonth()+1);if(repeat==="yearly")dt.setFullYear(dt.getFullYear()+1);return iso(dt)}
async function toggle(id){const t=state.tasks.find(x=>x.id===id);if(!t)return;const modifiedAt=new Date().toISOString();t.updatedAt=modifiedAt;if(isDone(t)){t.status=taskKind(t)==="Asignación"?"Recibida":"Pendiente";t.completedAt=null}else{t.status=taskKind(t)==="Asignación"?"Realizada":"Terminada";t.completedAt=new Date().toISOString();if(t.repeat&&t.repeat!=="none"&&t.due){const d=nextDue(t.due,t.repeat);if(!state.tasks.some(x=>x.originId===t.id)){state.tasks.unshift({...t,id:uid(),due:d,status:taskKind(t)==="Asignación"?"Recibida":"Pendiente",completedAt:null,createdAt:modifiedAt,updatedAt:modifiedAt,originId:t.id,googleEventId:null})}}}await save();render()}
async function del(id){
 const t=state.tasks.find(x=>x.id===id);if(!t)return;
 if(!confirm('¿Enviar "'+t.title+'" a la Papelera durante 30 días?'))return;
 const oldTasks=state.tasks,oldTrash=state.trash,oldDeleted=state.deletedTasks;
 const deletedAt=new Date().toISOString();
 state.tasks=oldTasks.filter(x=>x.id!==id);
 state.trash=[{...t,trashedAt:deletedAt},...(state.trash||[]).filter(x=>x.id!==id)];
 state.deletedTasks=[...oldDeleted,{id,deletedAt}];
 try{await save();lastDeletedId=id;close();view="pendientes";filter="Todas";render();toast("Pendiente enviado a Papelera; puedes deshacerlo")}
 catch(err){state.tasks=oldTasks;state.trash=oldTrash;state.deletedTasks=oldDeleted;toast("No se pudo eliminar. Tu pendiente sigue disponible.");console.error(err)}
}
async function restoreDeleted(id){
 const t=(state.trash||[]).find(x=>x.id===id);
 if(!t){toast("No se encontró ese registro en la Papelera");return}
 const oldTasks=state.tasks,oldTrash=state.trash;
 const now=new Date().toISOString(),{trashedAt,...original}=t;
 const restored={...original,id:uid(),createdAt:now,updatedAt:now,googleEventId:null};
 state.tasks=[restored,...oldTasks];state.trash=oldTrash.filter(x=>x.id!==id);
 try{await save();lastDeletedId=null;lastSavedId=restored.id;view="pendientes";filter=restored.areaId||"Todas";render();toast("✅ Pendiente recuperado")}
 catch(err){state.tasks=oldTasks;state.trash=oldTrash;toast("No se pudo recuperar el registro");console.error(err)}
}
async function emptyTrash(){
 if(!state.trash?.length)return;
 if(!confirm("¿Eliminar definitivamente los registros de Papelera? Esta acción no se puede deshacer."))return;
 const before=state.trash;
 state.trash=[];try{await save();render();toast("Papelera vaciada")}catch(e){state.trash=before;toast("No se pudo vaciar la Papelera")}
}
function trashView(){
 const items=[...(state.trash||[])].sort((a,b)=>(b.trashedAt||"").localeCompare(a.trashedAt||""));
 return heading("🗑️ Papelera","Recupera tus pendientes eliminados durante 30 días")+
 card("Registros eliminados",items.length?'<div class="stack">'+items.map(t=>
 '<div class="trash-item"><div><b>'+esc(t.title)+'</b><p class="tiny muted">'+esc(catName(t))+' · Eliminado: '+(t.trashedAt?new Date(t.trashedAt).toLocaleDateString("es-CL"):"Fecha desconocida")+'</p></div><button class="btn small" data-restore-task="'+esc(t.id)+'">↩ Recuperar</button></div>').join("")+'</div>':'<div class="empty">No hay pendientes eliminados recientemente.</div>',
 items.length?'<button class="btn small danger" id="empty-trash">Vaciar</button>':'')+
 '<button class="btn" data-view="pendientes">Volver a Pendientes</button>';
}
async function ocr(){const f=$("#ocr-file")?.files?.[0];if(!f){toast("Selecciona una imagen");return}$("#ocr-result").textContent="Reconociendo texto...";try{if(!window.Tesseract){const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";s.crossOrigin="anonymous";await new Promise((ok,fail)=>{s.onload=ok;s.onerror=fail;document.head.append(s)})}const out=await Tesseract.recognize(f,"spa");const detected=(out.data.text||"").trim();if(!detected)throw Error("No se detectó texto");$("#title").value=detected.slice(0,1800);autoSuggest();$("#ocr-result").textContent="Texto reconocido. Comprueba la fecha, el tipo y el título antes de guardar.";toast("Imagen procesada en el navegador")}catch(err){console.error(err);$("#ocr-result").textContent="No fue posible leer la imagen. Puedes escribir los datos manualmente.";toast("Error en reconocimiento OCR")}}
function bytesToB64(b){let s="";for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode(...b.subarray(i,i+32768));return btoa(s)}
function b64ToBytes(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
async function keyFrom(password,salt){const p=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveKey"]);return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:250000,hash:"SHA-256"},p,{name:"AES-GCM",length:256},false,["encrypt","decrypt"])}
async function encrypt(obj,password){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));const key=await keyFrom(password,salt);const data=new TextEncoder().encode(JSON.stringify(obj));const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,data);return {format:"mi-panel-encrypted",v:1,createdAt:new Date().toISOString(),salt:bytesToB64(salt),iv:bytesToB64(iv),data:bytesToB64(new Uint8Array(encrypted))}}
async function decrypt(pkg,password){if(pkg?.format!=="mi-panel-encrypted"||pkg.v!==1)throw Error("Formato de respaldo no reconocido");const key=await keyFrom(password,b64ToBytes(pkg.salt));const dec=await crypto.subtle.decrypt({name:"AES-GCM",iv:b64ToBytes(pkg.iv)},key,b64ToBytes(pkg.data));const payload=JSON.parse(new TextDecoder().decode(dec));if(!Array.isArray(payload.tasks)||(!payload.settings&&!Array.isArray(payload.categories)))throw Error("Respaldo inválido");return payload}
function download(obj,name){const blob=new Blob([JSON.stringify(obj)],{type:"application/json"});const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000)}
async function exportBackup(){const pass=prompt("Elige una contraseña para cifrar el respaldo (mínimo 8 caracteres):");if(pass===null)return;if(pass.length<8){toast("Contraseña demasiado corta");return}try{const pkg=await encrypt(state,pass);download(pkg,"mi-panel-"+TODAY()+".json");state.settings.lastBackup=new Date().toISOString();await save({preserveDate:true});render();toast("Archivo cifrado preparado. Guárdalo en un lugar seguro.")}catch(e){console.error(e);toast("No se pudo generar el respaldo")}}
async function importBackup(){const inp=document.createElement("input");inp.type="file";inp.accept=".json,application/json";inp.onchange=async()=>{const file=inp.files?.[0];if(!file)return;try{const obj=JSON.parse(await file.text());const pass=prompt("Contraseña del respaldo que vas a restaurar:");if(pass===null)return;const incoming=await decrypt(obj,pass);const count=incoming.tasks.length;if(!confirm("El respaldo contiene "+count+" registros. Antes de reemplazarlos, se descargará una copia cifrada de protección de tus datos actuales. ¿Continuar?"))return;const safe=await encrypt(state,pass);download(safe,"mi-panel-proteccion-"+TODAY()+".json");if(!confirm("Confirma que se descargó y guardaste la copia de protección. ¿Reemplazar ahora los "+state.tasks.length+" registros actuales por los "+count+" del archivo?"))return;state=migrateState({...incoming,settings:{...incoming.settings,googleClientId:state.settings.googleClientId}});await save({skipSync:true});cloudClient?.disconnect();render();toast("Restauración completada. Reconecta Drive después de revisar los datos.")}catch(e){console.error(e);alert("No se pudo restaurar. Contraseña incorrecta, archivo dañado o formato incompatible. Tus datos actuales no fueron reemplazados.")}};inp.click()}

async function storageDiagnostics(){
 const box=$("#storage-diagnostic");if(!box)return;box.textContent="Comprobando almacenamiento…";
 try{
  if(!db)throw Error("IndexedDB no está disponible");
  const stored=await new Promise((ok,fail)=>{
   const r=db.transaction("kv","readonly").objectStore("kv").get("state");
   r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error||Error("Error de lectura"));
  });
  const tasks=stored?.tasks||[];
  const mostRecent=[...tasks].sort((a,b)=>(b.updatedAt||b.createdAt||"").localeCompare(a.updatedAt||a.createdAt||""))[0];
  box.textContent="✅ IndexedDB accesible · "+tasks.length+" registro(s) guardados."+
   (mostRecent?" Último: "+mostRecent.title+" ("+new Date(mostRecent.updatedAt||mostRecent.createdAt).toLocaleString("es-CL")+").":"")+
   " Versión "+APP_VERSION+".";
 }catch(err){console.error(err);box.textContent="⚠️ No se pueden consultar los datos guardados. "+(err.message||String(err))}
}
async function refreshApp(){
 if($("#task-form")||$("#category-form")){
  if(!confirm("Hay un formulario abierto. ¿Actualizar la aplicación? Los campos que aún no hayas guardado pueden perderse."))return;
 }
 if(!navigator.onLine){toast("Para actualizar Mi Panel necesitas conexión a internet");return}
 const b=$("#force-refresh")||$("#update-now");if(b){b.disabled=true;b.textContent="Comprobando versión…"}
 try{
  if("serviceWorker" in navigator){
   const reg=await navigator.serviceWorker.getRegistration("./");
   if(reg)await reg.update();
  }
 }catch(e){console.warn("No se pudo comprobar el service worker",e)}
 const u=new URL(window.location.href);
 u.searchParams.set("actualizar",Date.now().toString());
 window.location.assign(u.toString());
}
function watchUpdates(){
 if(!("serviceWorker" in navigator))return;
 navigator.serviceWorker.addEventListener("controllerchange",()=>{
  const notice=$("#update-note");
  if(notice)notice.classList.remove("hidden");
 });
}

function loadGIS(){return new Promise((ok,fail)=>{if(window.google?.accounts?.oauth2)return ok();const script=document.createElement("script");script.src="https://accounts.google.com/gsi/client";script.onload=ok;script.onerror=fail;document.head.append(script)})}
async function googleConnect(){const clientId=state.settings.googleClientId.trim();if(!clientId){toast("Primero guarda el Client ID en Ajustes");navigate("ajustes");return}if(!navigator.onLine){toast("Google Calendar necesita conexión");return}try{await loadGIS();const client=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:"https://www.googleapis.com/auth/calendar.events",callback:async response=>{if(response.error){toast("Google no autorizó el acceso");return}token=response.access_token;connected=true;await fetchGoogleEvents();render();toast("Google Calendar conectado")}});client.requestAccessToken({prompt:"consent"})}catch(err){console.error(err);toast("No se pudo iniciar Google OAuth")}}
async function googleFetch(path,opts){if(!token)throw Error("Conecta Google Calendar");const r=await fetch("https://www.googleapis.com/calendar/v3"+path,{...opts,headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json",...(opts?.headers||{})}});if(!r.ok){if(r.status===401){connected=false;token=""}throw Error("Google Calendar: "+r.status+" "+(await r.text()).slice(0,120))}return r.json()}
async function fetchGoogleEvents(){try{const now=new Date(),until=new Date(Date.now()+30*864e5);const q="?timeMin="+encodeURIComponent(now.toISOString())+"&timeMax="+encodeURIComponent(until.toISOString())+"&singleEvents=true&orderBy=startTime&maxResults=100";const out=await googleFetch("/calendars/primary/events"+q);googleEvents=(out.items||[]).filter(ev=>!ev.summary||/reuni[oó]n|asignaci[oó]n|discurso|lectura|visita|congregaci[oó]n|ancianos|servicio|compromiso/i.test(ev.summary)).slice(0,20)}catch(e){console.error(e);toast("No se pudieron consultar eventos")}}
async function pushCalendar(id){const t=state.tasks.find(x=>x.id===id);if(!t)return;if(!t.due){toast("Primero registra una fecha");return}if(t.googleEventId){toast("Esta asignación ya está vinculada a Google Calendar");return}if(!connected){await googleConnect();if(!connected)return;return toast("Google conectado. Vuelve a pulsar Añadir a Calendar.")}if(!confirm("¿Crear esta asignación en tu Google Calendar?"))return;const start=t.time?{dateTime:new Date(t.due+"T"+t.time+":00").toISOString()}:{date:t.due};let end;if(t.time){const d=new Date(t.due+"T"+t.time+":00");d.setHours(d.getHours()+1);end={dateTime:d.toISOString()}}else end={date:addDays(t.due,1)};try{const ev=await googleFetch("/calendars/primary/events",{method:"POST",body:JSON.stringify({summary:"Asignación · "+t.title,description:"Registrada desde Mi Panel. Preparación y notas se guardan solo en el dispositivo.",start,end,visibility:"private"})});t.googleEventId=ev.id;t.updatedAt=new Date().toISOString();await save();await fetchGoogleEvents();render();toast("Asignación creada en Google Calendar")}catch(e){console.error(e);toast("No se pudo crear el evento")}}
function appendCalendarButton(t){const form=$("#task-form");if(!form||!t||t.subarea!=="Asignaciones")return;const b=document.createElement("button");b.type="button";b.className="btn";b.textContent=t.googleEventId?"✓ Ya está en Google Calendar":"Añadir a Google Calendar";b.disabled=!!t.googleEventId;b.onclick=()=>{close();pushCalendar(t.id)};form.querySelector(".actions").append(b)}
function updateNetwork(){render()}
let scrolling=false;
document.addEventListener("click",async e=>{const btn=e.target.closest("button");if(!btn)return;
 if(btn.matches('#task-form button[type="submit"], #category-form button[type="submit"]')){
  e.preventDefault();
  const form=btn.closest("form");
  if(!form||!form.reportValidity()||form.dataset.saving==="1")return;
  form.dataset.saving="1";
  try{if(form.getAttribute("id")==="task-form")await saveForm(form);else await saveCategory(form)}
  finally{form.dataset.saving=""}
  return;
 }if(btn.dataset.homeMode){homeMode=btn.dataset.homeMode;render();return}
 if(btn.dataset.homeDay){homeSelectedDay=btn.dataset.homeDay;homeMode="day";render();return}
 if(btn.dataset.homeUnscheduled!==undefined){filter="Sin fecha";navigate("pendientes");return}
 if(btn.dataset.close!==undefined){close();return}if(btn.dataset.view){navigate(btn.dataset.view);return}if(btn.id==="add"||btn.id==="add-list"){form(null,filter);return}if(btn.id==="manage-categories"){manageCategories();return}if(btn.id==="back-categories"){manageCategories();return}if(btn.dataset.catEdit){categoryForm(btn.dataset.catEdit);return}if(btn.id==="cat-new"){categoryForm(null);return}if(btn.dataset.catDelete){await deleteCategory(btn.dataset.catDelete);return}if(btn.dataset.newSub){form(null,btn.dataset.newSub);return}if(btn.dataset.area){filter=btn.dataset.area;navigate("pendientes");return}if(btn.dataset.filter){filter=btn.dataset.filter;render();return}if(btn.dataset.edit){const t=state.tasks.find(x=>x.id===btn.dataset.edit);if(t){form(t);appendCalendarButton(t)}return}if(btn.dataset.weekPick){await toggleWeeklyPick(btn.dataset.weekPick);return}if(btn.dataset.stepToggle){await toggleMilestone(btn.dataset.stepToggle,btn.dataset.stepId);return}if(btn.dataset.agendaDay){agendaSelectedDay=btn.dataset.agendaDay;render();return}if(btn.dataset.agenda){agendaOffset=btn.dataset.agenda==="today"?0:agendaOffset+Number(btn.dataset.agenda);agendaSelectedDay=btn.dataset.agenda==="today"?TODAY():addDays(TODAY(),agendaOffset*7);render();return}if(btn.dataset.toggle){await toggle(btn.dataset.toggle);return}if(btn.dataset.restoreTask){await restoreDeleted(btn.dataset.restoreTask);return}if(btn.id==="empty-trash"){await emptyTrash();return}if(btn.dataset.delete){await del(btn.dataset.delete);return}if(btn.dataset.theme){state.settings.theme=btn.dataset.theme;await save();render();return}if(btn.id==="theme"){state.settings.theme=state.settings.theme==="dark"?"light":"dark";await save();render();return}if(btn.id==="export"){await exportBackup();return}if(btn.id==="restore"){await importBackup();return}if(btn.id==="ocr"){await ocr();return}if(btn.id==="google-connect"){await googleConnect();return}if(btn.id==="drive-connect"){const pass=$("#drive-pass");if(!pass){navigate("ajustes");toast("Ingresa la clave de cifrado en Ajustes");return}await cloudClient?.connect(state.settings.googleClientId,pass.value);return}if(btn.id==="drive-now"){if(!cloudClient?.connected()){render();toast("Vuelve a conectar tu cuenta Google para actualizar");return}btn.disabled=true;btn.textContent="⏳ Sincronizando…";try{await cloudClient?.sync()}finally{const current=$("#drive-now");if(current){current.disabled=!cloudClient?.connected();current.textContent="🔄 Actualizar ahora"}}return}if(btn.id==="drive-restore-protection"){await cloudClient?.restoreProtection();return}if(btn.id==="drive-disconnect"){cloudClient?.disconnect();return}if(btn.id==="storage-check"){await storageDiagnostics();return}if(btn.id==="force-refresh"||btn.id==="update-now"){await refreshApp();return}if(btn.id==="reveal"){$("#nav").classList.remove("hide-nav");$("#reveal").classList.add("hidden");return}});
document.addEventListener("submit",async e=>{if(e.target.getAttribute("id")==="task-form"){e.preventDefault();if(e.target.dataset.saving==="1")return;e.target.dataset.saving="1";try{await saveForm(e.target)}finally{e.target.dataset.saving=""}}if(e.target.getAttribute("id")==="category-form"){e.preventDefault();if(e.target.dataset.saving==="1")return;e.target.dataset.saving="1";try{await saveCategory(e.target)}finally{e.target.dataset.saving=""}}if(e.target.getAttribute("id")==="google-config"){e.preventDefault();state.settings.googleClientId=new FormData(e.target).get("clientId").trim();await save();render();toast("Client ID guardado en este dispositivo")}});
document.addEventListener("input",e=>{if(e.target.id==="global-search"){const position=e.target.selectionStart;globalQuery=e.target.value;render();const el=$("#global-search");el?.focus();el?.setSelectionRange(position,position)}if(e.target.id==="search"){const position=e.target.selectionStart;search=e.target.value;render();const s=$("#search");s.focus();s.setSelectionRange(position,position)}});
document.addEventListener("click",e=>{if(e.target?.id==="overlay")close()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")close()});
window.addEventListener("scroll",()=>{if(scrolling)return;scrolling=true;requestAnimationFrame(()=>{const y=window.scrollY;if(y>130&&y>lastScroll+8){$("#nav").classList.add("hide-nav");$("#reveal").classList.remove("hidden")}else if(y<lastScroll-8||y<70){$("#nav").classList.remove("hide-nav");$("#reveal").classList.add("hidden")}lastScroll=y;scrolling=false})},{passive:true});
window.addEventListener("online",updateNetwork);window.addEventListener("offline",updateNetwork);
readState().then(()=>{watchUpdates();renderStorageWarning();cloudClient=window.MiPanelCloud?.init({getState:()=>state,setState:x=>{state=x},getDb:()=>db,persist:save,normalize:migrateState,defaultCategories:()=>DEFAULT_CATEGORIES,encrypt,decrypt,loadGIS,render,toast});render();if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(console.warn)});
})();