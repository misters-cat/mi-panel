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

  assert.equal(await page.locator("#release-chip").innerText(),"v1.2.7");
  await page.locator('button[data-view="ajustes"]').first().click();
  assert.equal(await page.locator("#drive-pass").count(),0);
  assert.equal(await page.locator("#drive-connect").count(),1);
  assert.equal(await page.locator("#drive-now").count(),1);
  assert.equal(await page.locator("#drive-now").isDisabled(),true);
  assert.match(await page.locator("#drive-now").innerText(),/Actualizar ahora/);
  assert.match(await page.locator("#app").innerText(),/Sincronización automática/);
  await page.locator("#release-history").waitFor({state:"attached"});
  assert.match(await page.locator("#app").innerText(),/Historial de versiones/);
  assert.match(await page.locator(".release-latest").innerText(),/1\.2\.7/);
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
  
  assert.equal(errors.length,0,"Excepciones JS: "+errors.join("; "));
  console.log("OK: sin errores JavaScript de ejecución");
  await context.close();
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
