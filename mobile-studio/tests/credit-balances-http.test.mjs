import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
test('settings reads protected credit observations written by the local monitor',async t=>{
 const data=mkdtempSync(path.join(os.tmpdir(),'studio-credit-http-'));
 const env={...process.env,STUDIO_DATA_DIR:data,STUDIO_PORT:'31991',STUDIO_INTERNAL_PORT:'31992',STUDIO_TEST_MODE:'1',STUDIO_API_ONLY:'1'};
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env,stdio:['ignore','ignore','pipe'],windowsHide:true});let errors='';child.stderr.on('data',b=>errors+=b.toString());
 t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit').catch(()=>{});}rmSync(data,{recursive:true,force:true});});
 const base='http://127.0.0.1:31991';let ready=false;
 for(let i=0;i<50;i++){try{if((await fetch(base+'/')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
 assert(ready,'isolated test server ready: '+errors.slice(-2500));
 assert.equal((await fetch(base+'/api/cloud/credits')).status,401);
 const session=await fetch(base+'/api/local-session',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}'});
 const headers={Cookie:session.headers.get('set-cookie').split(';')[0]};
 const input={observations:[{provider:'xai',status:'verified',amount:4.12,currency:'USD',account:'Test team',sourceUrl:'https://console.x.ai/'}],monitor:{automationId:'test-monitor'}};
 const write=spawnSync(process.execPath,['update-credit-balances.mjs'],{cwd:new URL('..',import.meta.url),env,input:JSON.stringify(input),encoding:'utf8',windowsHide:true});
 assert.equal(write.status,0,write.stderr);
 const response=await fetch(base+'/api/cloud/credits',{headers});assert.equal(response.status,200);
 assert.equal(response.headers.get('cache-control'),'no-store');const values=await response.json();assert(values.scheduled);assert.equal(values.providers[2].amount,4.12);
 assert.equal((await fetch(base+'/credit-balances.js')).status,200);
 assert.equal((await fetch(base+'/api/cloud/credits',{method:'POST',headers:{...headers,Origin:base}})).status,404);
});
