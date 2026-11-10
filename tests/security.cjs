"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const {webcrypto}=require("node:crypto");
const {Buffer}=require("node:buffer");
const textEncoder=new TextEncoder(),textDecoder=new TextDecoder();
async function keyFor(pass,salt){
 const base=await webcrypto.subtle.importKey("raw",textEncoder.encode(pass),"PBKDF2",false,["deriveKey"]);
 return webcrypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:250000,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
async function encrypt(data,pass){
 const salt=webcrypto.getRandomValues(new Uint8Array(16)),iv=webcrypto.getRandomValues(new Uint8Array(12));
 const key=await keyFor(pass,salt);
 const bytes=await webcrypto.subtle.encrypt({name:"AES-GCM",iv},key,textEncoder.encode(JSON.stringify(data)));
 return{format:"mi-panel-encrypted",v:1,salt:Buffer.from(salt).toString("base64"),
   iv:Buffer.from(iv).toString("base64"),data:Buffer.from(bytes).toString("base64")};
}
async function decrypt(pkg,pass){
 const salt=Uint8Array.from(Buffer.from(pkg.salt,"base64")),iv=Uint8Array.from(Buffer.from(pkg.iv,"base64"));
 const key=await keyFor(pass,salt);
 const dec=await webcrypto.subtle.decrypt({name:"AES-GCM",iv},key,Buffer.from(pkg.data,"base64"));
 return JSON.parse(textDecoder.decode(dec));
}
function engine(){
 let uploaded="",saved=null;
 const src=fs.readFileSync("drive-sync.js","utf8").replace(
 "window.MiPanelCloud={init};",
 'window.MiPanelCloud={init};window.__testing={upload,fetchFile,setCredential:(p)=>{token="fake-token";password=p;expiration=Date.now()+3600000}};');
 const window={addEventListener(){}},document={addEventListener(){},getElementById(){return null}};
 const fetch=async(url,opts)=>{
  if(String(url).includes("uploadType=multipart")){
   uploaded=String(opts.body);
   const m=uploaded.match(/(\{"format":"mi-panel-encrypted"[\s\S]*?\})\r\n--mp_/);
   if(!m)throw Error("No se recibió paquete cifrado en multipart");
   saved=JSON.parse(m[1]);
   return {ok:true,json:async()=>({id:"file-a"})};
  }
  if(String(url).includes("/files/file-a?alt=media"))return{ok:true,json:async()=>saved};
  throw Error("Solicitud inesperada: "+url);
 };
 const ctx={window,document,crypto:webcrypto,TextEncoder,URLSearchParams,setInterval(){},fetch,console};
 vm.runInNewContext(src,ctx,{filename:"drive-sync.js"});
 window.MiPanelCloud.init({encrypt,decrypt,normalize:x=>x,defaultCategories:()=>[]});
 return {api:window.__testing,uploaded:()=>uploaded,stored:()=>saved};
}
test("Drive sube únicamente datos cifrados y permite descifrarlos con la clave",async()=>{
 const {api,uploaded,stored}=engine();api.setCredential("ClavePrivadaDePruebaMuySegura!");
 const snapshot={version:2,tasks:[{id:"x",title:"Meta personal muy confidencial"}],categories:[],deletedTasks:[],deletedCategories:[]};
 await api.upload(null,snapshot,"e05b7ed2-195b-4ca0-8764-fb01dbbb5885");
 assert(!uploaded().includes("Meta personal muy confidencial"),"No debe salir título en texto legible");
 assert.equal(stored().format,"mi-panel-encrypted");
 assert.equal(stored().v,1);
 assert(stored().iv&&stored().salt&&stored().data,"Debe tener IV, salt y datos cifrados");
 const decoded=await api.fetchFile({id:"file-a",name:"mi-panel-sync-v3-e05b7ed2.json"});
 assert.equal(decoded.tasks[0].title,"Meta personal muy confidencial");
 api.setCredential("OtraClaveErronea!");
 await assert.rejects(()=>api.fetchFile({id:"file-a",name:"mi-panel-sync-v3-e05b7ed2.json"}),/No se puede descifrar/);
});
