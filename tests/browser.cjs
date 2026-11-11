"use strict";
const fs=require("node:fs");
const http=require("node:http");
const path=require("node:path");
const assert=require("node:assert/strict");
const {chromium}=require("playwright-core");
const root=path.join(__dirname,"..");
const map={".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml",".webmanifest":"application/manifest+json"};
const server=http.createServer((req,res)=>{
 const requested=new URL(req.url,"http://localhost").pathname;
 const file=path.resolve(root,"."+decodeURIComponent(requested==="/"?"/index.html":requested));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
 fs.readFile(file,(err,buf)=>{if(err){res.writeHead(404);res.end("Not found");return}
 res.writeHead(200,{"Content-Type":map[path.extname(file)]||"text/plain","Cache-Control":"no-store"});res.end(buf)});
});
function timeout(ms){return new Promise((_,reject)=>setTimeout(()=>reject(new Error("Timeout test "+ms)),ms))}
(async()=>{
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const port=server.address().port;
 const executablePath=["/usr/bin/google-chrome","/usr/bin/google-chrome-stable","/usr/bin/chromium"].find(fs.existsSync);
 if(!executablePath)throw new Error("No se encontró Chromium/Chrome en el ejecutor");
 const browser=await chromium.launch({headless:true,executablePath,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("http://127.0.0.1:"+port+"/",{waitUntil:"domcontentloaded"});
  await page.locator("#nav #add").click();
  await page.locator("#title").fill("Organizar documentos para mi meta");
  await page.locator("#area").selectOption("grandes-metas");
  await page.locator("#due").fill("2026-12-04");
  await page.locator("#task-form button[type=submit]").click();
  const debug=await page.evaluate(async()=>{
   const out={view:document.querySelector("#app")?.innerText?.slice(0,600),
    modal:document.querySelector("#modal")?.innerText?.slice(0,400),
    toast:document.querySelector("#toast")?.textContent,
    form:!!document.querySelector("#task-form")};
   try{
    out.persisted=await new Promise((ok,fail)=>{
      const r=indexedDB.open("mi-panel-db",1);
      r.onsuccess=()=>{const q=r.result.transaction("kv").objectStore("kv").get("state");q.onsuccess=()=>ok(q.result?.tasks?.map(t=>({id:t.id,title:t.title,areaId:t.areaId})));q.onerror=()=>fail(q.error)};
      r.onerror=()=>fail(r.error);
    });
   }catch(e){out.dbError=String(e)}
   return out;
  });
  console.log("DIAGNÓSTICO REAL:",JSON.stringify(debug),"PAGE ERRORS:",errors);
  await page.locator(".save-banner").waitFor({timeout:8000});
  assert.match(await page.locator("#app").innerText(),/Guardado en este dispositivo/);
  assert.match(await page.locator("#app").innerText(),/Organizar documentos para mi meta/);
  assert.equal(await page.locator("#modal").innerHTML(),"");
  await page.reload({waitUntil:"domcontentloaded"});
  await page.locator('button[data-view="pendientes"]').first().click();
  await page.locator('button[data-filter="grandes-metas"]').click();
  assert.match(await page.locator("#app").innerText(),/Organizar documentos para mi meta/);
  await page.locator('button[data-view="semana"]').first().click();
  assert.match(await page.locator("#app").innerText(),/Mi día/);
  assert.match(await page.locator("#app").innerText(),/Próximos siete días/);
  assert.equal(await page.locator(".dashboard-stats .dash-stat").count(),3);
  console.log("OK: inicio compacto sin duplicar tareas futuras que todavía no vencen");
  console.log("OK: Guardar y persistir registro tras recarga en Chromium");

  await page.locator('button[data-view="pendientes"]').first().click();
  await page.locator("#manage-categories").click();
  await page.locator("#cat-new").click();
  await page.locator('#category-form input[name=name]').fill("Estudios");
  await page.locator('#category-form input[name=emoji]').fill("📚");
  await page.locator('#category-form button[type=submit]').click();
  await page.locator("#modal .cat-list").waitFor({state:"visible",timeout:8000});
  assert.match(await page.locator("#modal").innerText(),/Estudios/);
  await page.reload({waitUntil:"domcontentloaded"});
  await page.locator('button[data-view="pendientes"]').first().click();
  assert.match(await page.locator("#app").innerText(),/Estudios/);
  console.log("OK: Guardar categoría y recuperar tras recarga");

  await page.locator("#nav #add").click();
  await page.locator("#area").selectOption("grandes-metas");
  await page.locator("#title").fill("Revisar el trabajo mañana");
  assert.equal(await page.locator("#area").inputValue(),"grandes-metas","La sugerencia no debe cambiar la categoría elegida manualmente");
  await page.locator("#task-form button[type=submit]").click();
  await page.locator(".save-banner").waitFor({timeout:8000});
  assert.match(await page.locator("#app").innerText(),/Revisar el trabajo mañana/);
  console.log("OK: respetar elección de categoría manual");

  assert.equal(await page.locator("#release-chip").innerText(),"v1.6.1");
  // La sincronización debe estar accesible desde la pantalla principal, incluso desconectada.
  await page.locator('button[data-view="semana"]').first().click();
  assert.equal(await page.locator(".quick-sync").count(),1);
  const rolling=await page.locator(".home-days .home-day").evaluateAll(nodes=>nodes.map(n=>n.getAttribute("data-home-day")));
  assert.equal(rolling.length,7);
  const expected=await page.evaluate(()=>{
   const d=new Date(),local=x=>x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0");
   const out=[];for(let n=0;n<7;n++){const next=new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);out.push(local(next))}
   return out;
  });
  assert.deepEqual(rolling,expected,"La franja debe ir desde hoy hasta seis días más tarde");
  assert.equal(await page.locator(".home-days .home-day.is-today").count(),1);
  console.log("OK: semana móvil comienza hoy y conserva siete días consecutivos");
  assert.match(await page.locator(".quick-sync").innerText(),/Google Drive/);
  assert.match(await page.locator(".quick-sync").innerText(),/Conectar Google/);
  await page.locator('button[data-view="ajustes"]').first().click();
  assert.equal(await page.locator(".quick-sync").count(),0);
  assert.equal(await page.locator("#drive-pass").count(),1);
  assert.equal(await page.locator("#drive-connect").count(),1);
  assert.equal(await page.locator("#drive-now").count(),1);
  assert.equal(await page.locator("#drive-now").isDisabled(),true);
  assert.match(await page.locator("#drive-now").innerText(),/Actualizar ahora/);
  assert.match(await page.locator("#app").innerText(),/Sincronización automática/);
  assert.equal(await page.locator("#drive-pass").count(),1);
  assert.match(await page.locator("#app").innerText(),/cifrado AES-GCM/);
  await page.locator("#release-history").waitFor({state:"attached"});
  assert.match(await page.locator("#app").innerText(),/Historial de versiones/);
  assert.match(await page.locator(".release-latest").innerText(),/1\.6\.1/);
  await page.locator("#release-history summary").click();
  assert.match(await page.locator("#release-history").innerText(),/1\.2\.2/);
  assert.match(await page.locator("#release-history").innerText(),/0\.1/);
  console.log("OK: historial de versiones independiente y desplegable");
  await page.locator("#storage-check").click();
  await page.waitForFunction(()=>document.querySelector("#storage-diagnostic")?.textContent.includes("IndexedDB accesible"));
  const diagnostic=await page.locator("#storage-diagnostic").innerText();
  assert.match(diagnostic,/2 registro\(s\) guardados/);
  assert.match(diagnostic,/Revisar el trabajo mañana/);
  console.log("OK: diagnóstico muestra la cantidad de registros realmente guardados");
  const freshURL="http://127.0.0.1:"+port+"/?actualizar=prueba";
  await page.goto(freshURL,{waitUntil:"domcontentloaded"});
  await page.locator('button[data-view="pendientes"]').first().click();
  await page.locator('button[data-filter="grandes-metas"]').click();
  assert.match(await page.locator("#app").innerText(),/Revisar el trabajo mañana/);
  console.log("OK: recarga con URL nueva conserva datos locales");
  

  // Integración real de Grandes Metas, avisos y agenda.
  const soon=await page.evaluate(()=>{
   const d=new Date();d.setDate(d.getDate()+3);
   return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  });
  await page.locator("#nav #add").click();
  await page.locator("#title").fill("Meta con etapas de prueba");
  await page.locator("#area").selectOption("grandes-metas");
  await page.locator("#goal-steps").fill("Investigar opciones\nAhorrar dinero\nCompletar meta");
  await page.locator("#due").fill(soon);
  await page.locator('select[name="remindDays"]').selectOption("7");
  await page.locator("#task-form button[type=submit]").click();
  await page.locator(".goal-track[aria-valuenow='0']").waitFor({timeout:8000});
  assert.equal(await page.locator(".goal-step").count()>=3,true);
  await page.locator(".goal-step").first().click();
  await page.locator(".goal-track[aria-valuenow='33']").waitFor({timeout:8000});
  console.log("OK: Grandes Metas guarda etapas, cambio de progreso y fecha");

  await page.locator('button[data-view="semana"]').first().click();
  assert.match(await page.locator(".focus-panel").innerText(),/Meta con etapas de prueba/);
  await page.locator(".home-disclosure").filter({hasText:"Revisión semanal"}).locator("summary").click();
  const firstPick=page.locator("[data-week-pick]").first();
  await firstPick.click();
  await page.waitForFunction(()=>document.querySelector(".review-picks")?.textContent.includes("(1/3)"));
  assert.match(await page.locator(".review-picks").innerText(),/1\/3/);
  await page.reload({waitUntil:"domcontentloaded"});
  await page.locator(".home-disclosure").filter({hasText:"Revisión semanal"}).locator("summary").click();
  assert.match(await page.locator(".review-picks").innerText(),/1\/3/);
  console.log("OK: avisos integrados al inicio y tres prioridades semanales guardadas");

  await page.locator('button[data-view="agenda"]').first().click();
  assert.equal(await page.locator(".agenda-day").count(),7);
  assert.match(await page.locator(".agenda-week-grid").innerText(),/Meta con etapas de prueba/);
  await page.locator('button[data-agenda="1"]').click();
  assert.equal(await page.locator(".agenda-day").count(),7);
  await page.locator('button[data-agenda="today"]').click();
  assert.match(await page.locator(".agenda-week-grid").innerText(),/Meta con etapas de prueba/);
  console.log("OK: agenda semanal navegable con fechas y eventos");

  await page.locator('button[data-view="buscar"]').first().click();
  await page.locator("#global-search").fill("meta con etapas");
  assert.match(await page.locator("#app").innerText(),/Meta con etapas de prueba/);
  console.log("OK: búsqueda global devuelve registros");

  await page.locator('button[data-view="pendientes"]').first().click();
  await page.locator('button[data-filter="grandes-metas"]').click();
  const goalTask=page.locator(".task").filter({hasText:"Meta con etapas de prueba"}).first();
  await goalTask.locator("[data-edit]").click();
  page.once("dialog",dialog=>dialog.accept());
  await page.locator("#modal [data-delete]").click();
  await page.locator(".save-banner").waitFor({timeout:8000});
  assert.match(await page.locator(".save-banner").innerText(),/Pendiente eliminado/);
  await page.locator('.save-banner [data-restore-task]').click();
  await page.locator(".goal-track[aria-valuenow='33']").waitFor({timeout:8000});
  await page.reload({waitUntil:"domcontentloaded"});
  await page.locator('button[data-view="pendientes"]').first().click();
  await page.locator('button[data-filter="grandes-metas"]').click();
  assert.match(await page.locator("#app").innerText(),/Meta con etapas de prueba/);
  console.log("OK: deshacer eliminación, recuperar meta y conservar avance tras recarga");


  // Guardar sin conexión debe seguir funcionando en IndexedDB.
  await context.setOffline(true);
  await page.locator("#nav #add").click();
  await page.locator("#title").fill("Pendiente escrito sin internet");
  await page.locator("#area").selectOption("personal");
  await page.locator("#task-form button[type=submit]").click();
  await page.locator(".save-banner").waitFor({timeout:8000});
  assert.match(await page.locator("#app").innerText(),/Pendiente escrito sin internet/);
  await context.setOffline(false);
  await page.reload({waitUntil:"domcontentloaded"});
  await page.locator('button[data-view="pendientes"]').first().click();
  assert.match(await page.locator("#app").innerText(),/Pendiente escrito sin internet/);
  console.log("OK: guardado local offline sobrevive a reconexión y recarga");



  // Los tres contadores deben filtrar resultados, sin duplicarlos.
  await page.locator('button[data-view="semana"]').first().click();
  await page.locator('button[data-home-mode="today"]').click();
  assert.match(await page.locator(".focus-title").innerText(),/Para hoy/);
  await page.locator('button[data-home-mode="overdue"]').click();
  assert.match(await page.locator(".focus-title").innerText(),/Atrasados/);
  await page.locator('button[data-home-mode="focus"]').click();
  assert.match(await page.locator(".focus-title").innerText(),/Qué hacer ahora/);
  assert.equal(await page.locator(".home-days .home-day").count(),7);
  const dayThree=page.locator(".home-day").nth(3),selectedDate=await dayThree.getAttribute("data-home-day");
  await dayThree.click();
  assert.equal(await page.locator('.home-day[data-home-day="'+selectedDate+'"]').getAttribute("aria-pressed"),"true");
  assert.match(await page.locator(".focus-title").innerText(),/Para /);
  console.log("OK: tablero filtra hoy, atrasados, próximos y días seleccionados");

  await page.locator('button[data-view="agenda"]').first().click();
  await page.locator('.agenda-day-select').nth(3).click();
  assert.equal(await page.locator('.agenda-day.agenda-selected').count(),1);
  assert.equal(await page.locator('.agenda-week-grid .agenda-day').count(),7);
  assert.equal(await page.locator('.agenda-selected-panel').count(),1);
  console.log("OK: agenda diaria seleccionable con línea de tiempo");

  await page.locator('button[data-view="pendientes"]').first().click();
  assert.equal(await page.locator(".category-choices .category-choice").count()>=5,true);
  assert.equal(await page.locator(".status-choices .status-choice").count(),4);
  await page.locator('button[data-filter="Sin fecha"]').click();
  assert.match(await page.locator(".pending-list-title").innerText(),/Sin programar/);
  console.log("OK: categorías, filtros por estado y tareas sin fecha");

  // El layout principal no debe obligar a desplazamiento horizontal del documento en 390 px.
  const metrics=await page.evaluate(()=>({inner:innerWidth,documentWidth:document.documentElement.scrollWidth}));
  assert(metrics.documentWidth<=metrics.inner+1,"El diseño móvil no debe desbordarse horizontalmente: "+JSON.stringify(metrics));
  console.log("OK: diseño responsive de ancho móvil y controles reales");
  await page.setViewportSize({width:1280,height:800});
  await page.locator('button[data-view="semana"]').first().click();
  assert.equal(await page.locator(".dashboard-stats .dash-stat").count(),3);
  const desktop=await page.evaluate(()=>({inner:innerWidth,documentWidth:document.documentElement.scrollWidth}));
  assert(desktop.documentWidth<=desktop.inner+1,"El diseño de escritorio no debe desbordarse: "+JSON.stringify(desktop));
  const themeBefore=await page.locator("html").getAttribute("data-theme");
  await page.locator("#theme").click();
  await page.waitForFunction(previous=>document.documentElement.dataset.theme!==previous,themeBefore);
  const themeAfter=await page.locator("html").getAttribute("data-theme");
  assert.notEqual(themeBefore,themeAfter,"El botón debe alternar entre tema claro y oscuro");
  console.log("OK: tablero de escritorio, modo oscuro y contraste de tema");



  // Congregación conserva sus funciones e incorpora Sup. de Grupo.
  await page.locator('button[data-view="congregacion"]').first().click();
  const categories=["Anciano","Superintendente de servicio","Asignaciones","Sup. de Grupo"];
  for(const category of categories){
   const section=page.locator(".cong-card-grid .card").filter({has:page.locator("h2", {hasText:category})});
   assert.equal(await section.count(),1,"Falta la sección "+category);
   assert.equal(await section.locator('button[data-new-sub]').getAttribute("data-new-sub"),category);
  }
  assert.equal(await page.locator(".cong-card-grid .card").count(),4);
  await page.locator('button[data-new-sub="Sup. de Grupo"]').click();
  assert.equal(await page.locator("#area").inputValue(),"congregacion");
  assert.equal(await page.locator("#sub").inputValue(),"Sup. de Grupo");
  await page.locator("#title").fill("Organizar visita del grupo");
  await page.locator('#task-form button[type="submit"]').click();
  await page.locator(".save-banner").waitFor({timeout:8000});
  await page.locator('button[data-view="congregacion"]').first().click();
  const groupCard=page.locator(".cong-card-grid .card").filter({has:page.locator("h2",{hasText:"Sup. de Grupo"})});
  assert.match(await groupCard.innerText(),/Organizar visita del grupo/);
  await page.reload({waitUntil:"domcontentloaded"});
  await page.locator('button[data-view="congregacion"]').first().click();
  const groupAfterReload=page.locator(".cong-card-grid .card").filter({has:page.locator("h2",{hasText:"Sup. de Grupo"})});
  assert.match(await groupAfterReload.innerText(),/Organizar visita del grupo/);
  console.log("OK: cuatro funciones de Congregación, creación y persistencia de Sup. de Grupo");


  // Grupo es una categoría independiente: guardar, editar y recuperar desde IndexedDB.
  await page.locator('button[data-view="grupo"]').first().click();
  assert.equal(await page.locator("#group-add").count(),1);
  await page.locator("#group-add").click();
  await page.locator("#group-name").fill("Integrante de prueba");
  await page.locator('#group-person-form button[type="submit"]').click();
  await page.locator(".group-person").filter({hasText:"Integrante de prueba"}).waitFor({timeout:8000});
  await page.locator(".group-person summary").first().click();
  await page.locator('[data-group-visit-add]').first().click();
  await page.locator("#group-visit-topics").fill("Revisar asunto general de organización");
  await page.locator('#group-visit-form button[type="submit"]').click();
  await page.locator(".group-visit").waitFor({timeout:8000});
  assert.match(await page.locator(".group-visit").innerText(),/Revisar asunto general de organización/);
  assert.match(await page.locator(".group-person summary").innerText(),/Última visita/);
  await page.locator('[data-group-visit-edit]').first().click();
  await page.locator("#group-visit-topics").fill("Segunda versión de temas generales");
  await page.locator('#group-visit-form button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector(".group-visit")?.textContent.includes("Segunda versión de temas generales"));
  await page.reload({waitUntil:"domcontentloaded"});
  await page.locator('button[data-view="congregacion"]').first().click();
  await page.locator('button[data-view="grupo"]').first().click();
  assert.match(await page.locator(".group-person summary").innerText(),/Integrante de prueba/);
  await page.locator(".group-person summary").first().click();
  assert.match(await page.locator(".group-visit").innerText(),/Segunda versión de temas generales/);
  console.log("OK: Grupo registra integrantes, última visita y notas editadas tras recargar");
  page.once("dialog",dialog=>dialog.accept());
  await page.locator('[data-group-person-delete]').first().click();
  await page.waitForFunction(()=>document.querySelectorAll(".group-person").length===0);
  await page.reload({waitUntil:"domcontentloaded"});
  await page.locator('button[data-view="congregacion"]').first().click();
  await page.locator('button[data-view="grupo"]').first().click();
  assert.equal(await page.locator(".group-person").count(),0);
  console.log("OK: eliminación local de integrante y visitas no reaparece tras recarga");

  // La fecha más cercana, incluso sin hora, debe preceder a otra posterior con hora.
  const orderContext=await browser.newContext({viewport:{width:390,height:844}});
  const orderPage=await orderContext.newPage();
  await orderPage.goto("http://127.0.0.1:"+port+"/",{waitUntil:"domcontentloaded"});
  const dates=await orderPage.evaluate(()=>{
    const today=new Date();
    return [4,6,8].map(offset=>{
      const d=new Date(today.getFullYear(),today.getMonth(),today.getDate()+offset);
      return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
    });
  });
  for(const [index,title] of ["Primera fecha sin hora","Segunda fecha próxima","Compromiso posterior con hora"].entries()){
    await orderPage.locator("#nav #add").click();
    await orderPage.locator("#title").fill(title);
    await orderPage.locator("#due").fill(dates[index]);
    if(index===2)await orderPage.locator('input[name="time"]').fill("19:00");
    await orderPage.locator('#task-form button[type="submit"]').click();
    await orderPage.locator(".save-banner").waitFor({timeout:8000});
  }
  await orderPage.locator('button[data-view="semana"]').first().click();
  assert.equal(await orderPage.locator(".next-appointment .appointment-details strong").innerText(),"Primera fecha sin hora");
  const focusList=await orderPage.locator(".focus-panel .dash-task-title").allInnerTexts();
  assert.deepEqual(focusList.slice(0,2),["Primera fecha sin hora","Segunda fecha próxima"]);
  assert(!focusList.includes("Compromiso posterior con hora"));
  console.log("OK: inicio ordena por fecha, aunque un compromiso posterior tenga hora");
  await orderContext.close();

  assert.equal(errors.length,0,"Excepciones JS: "+errors.join("; "));
  console.log("OK: sin errores JavaScript de ejecución");
  await context.close();
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
