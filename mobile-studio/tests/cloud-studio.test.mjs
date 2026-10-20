import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createCloudStudio,cloudInput,studioRequestId} from '../cloud-studio.mjs';
import {createQueueOrder} from '../queue-order.mjs';
const model={id:'openai:gpt-image-2.5-flare',provider:'openai',modes:['text-image'],connected:true};
test('cloud input rejects disconnected and unsupported provider options',()=>{assert.throws(()=>cloudInput({mode:'text-image',model:model.id,prompt:'test'},[{...model,connected:false}]),/연결/);assert.throws(()=>cloudInput({mode:'text-video',model:'gemini:veo',prompt:'test',duration:10},[{id:'gemini:veo',connected:true,modes:['text-video'],durations:[4,6,8]}]),/4·6·8/);assert.equal(cloudInput({mode:'text-image',model:model.id,prompt:'test'},[model]).executionLane,'cloud');});
test('cloud jobs cannot take a GPU reservation',()=>{const d=new DatabaseSync(':memory:');d.exec('CREATE TABLE jobs(id TEXT,created INTEGER,state TEXT,body TEXT)');d.prepare('INSERT INTO jobs VALUES(?,?,?,?)').run('cloud',0,'queued',JSON.stringify({executionLane:'cloud'}));d.prepare('INSERT INTO jobs VALUES(?,?,?,?)').run('local',1,'queued','{}');const q=createQueueOrder(d);assert.equal(q.claimNext().id,'local');q.release('local');assert.throws(()=>q.set(['cloud']));d.close();});
test('meeting stable identifiers preserve original bridge jobs across restart',()=>{const c={origin:'https://test.chatgpt.site',project:'sandbox'},j={id:'remote'};assert.equal(studioRequestId(c,j),studioRequestId(c,j));assert.equal(studioRequestId(c,{...j,studio_job_id:'11111111-1111-4111-8111-111111111111'}),'11111111-1111-4111-8111-111111111111');});
test('cloud image is persisted locally and restart polls without submitting twice',async()=>{
 const data=mkdtempSync(path.join(os.tmpdir(),'studio-cloud-'));mkdirSync(path.join(data,'results'));const connectionPath=path.join(data,'cloud-connection.json');writeFileSync(connectionPath,JSON.stringify({origin:'https://test.chatgpt.site',project:'sandbox',headers:{Authorization:'Bearer test'}}));const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE cancellations(id TEXT,confirmed INTEGER);CREATE TABLE uploads(id TEXT,ext TEXT,mime TEXT)');const rows=[{id:'11111111-1111-4111-8111-111111111111',created:0,state:'queued',executionLane:'cloud',mode:'text-image',model:model.id,prompt:'test'}];let posts=0,polls=0;const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBakAAAAASUVORK5CYII=','base64');
 const deps={db,data,connectionPath,credentialVault:{get:async()=> 'fake-key'},jobs:()=>rows,getJob:id=>rows.find(j=>j.id===id),save:j=>j,chats:{},fetcher:async(url)=>{if(url==='https://api.openai.com/v1/images/generations'){posts++;return Response.json({data:[{b64_json:png.toString('base64')}]});}throw Error('unexpected request');}};
 try{await createCloudStudio(deps).dispatch();assert.equal(rows[0].state,'complete',rows[0].message);await createCloudStudio(deps).dispatch();assert.equal(posts,1);assert.equal(polls,0);assert.equal(rows[0].state,'complete',rows[0].message);assert.equal(rows[0].assets[0].bytes,png.length);assert.match(rows[0].assets[0].url,/^\/api\/results\//);}finally{db.close();rmSync(data,{recursive:true,force:true});}
});
