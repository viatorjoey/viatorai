import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,copyFileSync,readFileSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {randomUUID} from 'node:crypto';import vm from 'node:vm';
const root=fileURLToPath(new URL('..',import.meta.url)),data=mkdtempSync(path.join(os.tmpdir(),'studio-attachments-'));
copyFileSync(path.join(root,'data/model-catalog-cache.json'),path.join(data,'model-catalog-cache.json'));
const child=spawn(process.execPath,[path.join(root,'server.mjs')],{env:{...process.env,STUDIO_TEST_MODE:'1',STUDIO_API_ONLY:'1',STUDIO_DATA_DIR:data,STUDIO_PORT:'8815',STUDIO_INTERNAL_PORT:'8816'},windowsHide:true});
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('test server startup timed out')),10000);child.stdout.on('data',b=>{if(b.toString().includes('Private n8n bridge ready')){clearTimeout(timer);resolve();}});child.once('exit',()=>{clearTimeout(timer);reject(Error('test server exited'));});});
 const base='http://127.0.0.1:8815',session=await fetch(base+'/api/local-session',{method:'POST'}),headers={Origin:base,Cookie:session.headers.get('set-cookie').split(';')[0],'Content-Type':'application/json'};
 const call=async(url,body,key=randomUUID())=>{const response=await fetch(base+url,{method:body?'POST':'GET',headers:{...headers,'Idempotency-Key':key},body:body?JSON.stringify(body):undefined});return {status:response.status,value:await response.json()};};
 // Every entry module and service-worker shell resource must be served successfully.
 const swSource=readFileSync(path.join(root,'public/sw.js'),'utf8');
 const resources=JSON.parse(swSource.match(/FILES=(\[[^;]+\])/)[1].replaceAll("'",'"'));
 const scripts=new Set(resources.filter(p=>p.endsWith('.js')));
 for(const resource of resources){
  const response=await fetch(base+resource);assert.equal(response.status,200,`Shell resource ${resource}`);
  if(resource.endsWith('.js'))assert.match(response.headers.get('content-type'),/javascript/,resource);
 }
 for(const script of scripts){
  const source=await fetch(base+script).then(r=>r.text());
  for(const match of source.matchAll(/(?:from\s*|import\s*)['"](\.\/[^'"]+\.js)['"]/g)){
   const dependency=new URL(match[1],base+script).pathname,response=await fetch(base+dependency);
   assert.equal(response.status,200,`${script} imports ${dependency}`);assert.match(response.headers.get('content-type'),/javascript/,dependency);
  }
 }
 // A one-pixel fixture; the test server never dispatches a GPU/API job.
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
 const ids=[];for(let i=0;i<51;i++){const response=await fetch(base+'/api/uploads',{method:'POST',headers:{...headers,'Content-Type':'image/png'},body:png});assert.equal(response.status,201);ids.push((await response.json()).id);}
 for(const mode of ['image-image','image-video']){
  const payload={mode,model:mode==='image-image'?'flux-2-klein-4b.safetensors':'ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors',prompt:'A quiet lake',aspect:'16:9',resolution:'512x288',duration:6,uploadIds:ids.slice(0,50)},key=randomUUID();
  const accepted=await call('/api/jobs',payload,key);assert.equal(accepted.status,202);assert.equal(accepted.value.jobs.length,50);assert.deepEqual(accepted.value.jobs.map(j=>j.uploadId),payload.uploadIds);
  const replay=await call('/api/jobs',payload,key);assert.equal(replay.status,200);assert.deepEqual(replay.value.jobs.map(j=>j.id),accepted.value.jobs.map(j=>j.id));
  const rejected=await call('/api/jobs',{...payload,uploadIds:ids});assert.equal(rejected.status,400);assert.match(rejected.value.error,/50/);
 }
 const preset={mode:'image-image',model:'flux-2-klein-4b.safetensors',prompt:'Saved scene',uploadIds:ids.slice(0,50)};
 const saved=await call('/api/presets',preset);assert.equal(saved.status,201);assert.equal((await call('/api/presets/'+saved.value.id)).value.uploadIds.length,50);assert.equal((await call('/api/presets',{...preset,uploadIds:ids})).status,400);
 const nodes=new Map(),toasts=[],$=id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);};let uploads=0;
 const context=vm.createContext({$,uploadVersion:0,uploadBusy:false,selectedUploads:[],URL:{createObjectURL:()=>`blob:${uploads}`,revokeObjectURL(){}},toast:message=>toasts.push(message),renderAttachments(){},api:async()=>({id:ids[uploads++]})});
 const source=readFileSync(path.join(root,'public/app.js'),'utf8');vm.runInContext(source.slice(source.indexOf("$('#photo').onchange="),source.indexOf('let promptCandidate=')),context);
 $('#photo').files=Array.from({length:50},()=>({size:24,type:'image/png',name:'image.png'}));await $('#photo').onchange();assert.equal(uploads,50);assert.equal(context.selectedUploads.length,50);
 $('#photo').files=Array.from({length:51},()=>({size:24}));await $('#photo').onchange();assert.equal(uploads,50);assert.equal(context.selectedUploads.length,50);assert.match(toasts.at(-1),/50/);
 assert.equal((await fetch(base+'/api/voices')).status,401);assert.equal((await fetch(base+'/api/voices/audio/'+randomUUID())).status,401);const voices=await call('/api/voices');assert.equal(voices.status,200);assert.ok(voices.value.voices.some(v=>v.id==='gemini:Kore'));assert.equal((await call('/api/voices/render',{speakers:[{voiceId:'bad:voice',text:'test',style:''}]})).status,400);
 console.log('PASS 50 photo attachments in picker, batch jobs and saved presets; 51 rejected; idempotent replay; no GPU or paid API calls');
}finally{child.kill();}
