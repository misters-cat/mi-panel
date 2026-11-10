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
  assert.match(await page.locator("#app").innerText(),/Guardados recientemente/);
  assert.match(await page.locator("#app").innerText(),/Organizar documentos para mi meta/);
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

  assert.equal(await page.locator("#release-chip").innerText(),"v1.5.0");
  // La sincronización debe estar accesible desde la pantalla principal, incluso desconectada.
  await page.locator('button[data-view="semana"]').first().click();
  assert.equal(await page.locator(".quick-sync").count(),1);
  const rolling=await page.locator(".days .day").evaluateAll(nodes=>nodes.map(n=>n.getAttribute("data-date")));
  assert.equal(rolling.length,7);
  const expected=await page.evaluate(()=>{
   const d=new Date(),local=x=>x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0");
   const out=[];for(let n=0;n<7;n++){const next=new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);out.push(local(next))}
   return out;
  });
  assert.deepEqual(rolling,expected,"La franja debe ir desde hoy hasta seis días más tarde");
  assert.equal(await page.locator(".days .day.today").count(),1);
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
  assert.match(await page.locator(".release-latest").innerText(),/1\.5\.0/);
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
  assert.match(await page.locator("#app").innerText(),/Avisos dentro de Mi Panel/);
  assert.match(await page.locator(".notice-list").innerText(),/Meta con etapas de prueba/);
  const firstPick=page.locator("[data-week-pick]").first();
  await firstPick.click();
  await page.waitForFunction(()=>document.querySelector(".review-picks")?.textContent.includes("(1/3)"));
  assert.match(await page.locator(".review-picks").innerText(),/1\/3/);
  await page.reload({waitUntil:"domcontentloaded"});
  assert.match(await page.locator(".review-picks").innerText(),/1\/3/);
  console.log("OK: avisos al abrir Mi Panel y prioridades semanales guardadas");

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


  assert.equal(errors.length,0,"Excepciones JS: "+errors.join("; "));
  console.log("OK: sin errores JavaScript de ejecución");
  await context.close();
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
