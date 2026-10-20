import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createDirectCloud} from '../direct-cloud.mjs';
import {createCloudStudio} from '../cloud-studio.mjs';
import {createPresetStore} from '../preset-store.mjs';
const id='11111111-1111-4111-8111-111111111111';
const input={id,model:'gemini:veo-3.1-fast-generate-preview',mode:'text-video',prompt:'Test',aspect:'9:16',duration:8};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBakAAAAASUVORK5CYII=','base64');
function fixture(){const data=mkdtempSync(path.join(os.tmpdir(),'direct-cloud-')),db=new DatabaseSync(':memory:');return {data,db,vault:{get:async()=> 'fake-key-for-tests-only'},close(){db.close();rmSync(data,{recursive:true,force:true});}};}
test('Veo posts once, survives executor recreation and saves redirected video locally without forwarding credentials',async()=>{const f=fixture();let posts=0,polls=0;const fetcher=async(url,opts)=>{assert.equal(url.includes('chatgpt.site'),false);if(opts.method==='POST'){posts++;return Response.json({name:'models/veo-test/operations/123'});}if(url.includes('/operations/')){polls++;return Response.json(polls===1?{done:false}:{done:true,response:{generateVideoResponse:{generatedSamples:[{video:{uri:'https://generativelanguage.googleapis.com/video'}}]}}});}if(url.endsWith('/video'))return new Response(null,{status:302,headers:{location:'https://storage.googleapis.com/test.mp4'}});assert.equal(opts.headers['x-goog-api-key'],undefined);return new Response(Buffer.from('0000ftypmp42'),{headers:{'Content-Type':'video/mp4'}});};try{const a=createDirectCloud({...f,fetcher});assert.equal((await a.submit(input)).state,'pending');assert.equal((await a.status(id)).state,'pending');const b=createDirectCloud({...f,fetcher});const result=await b.status(id);assert.equal(result.state,'complete');assert.equal(result.assets[0].kind,'video');assert.equal(readFileSync(path.join(f.data,'results',result.assets[0].filename)).subarray(4,8).toString(),'ftyp');assert.equal((await b.submit(input)).state,'complete');assert.equal(posts,1);}finally{f.close();}});
test('poll failure preserves operation for safe retry without another creation',async()=>{const f=fixture();let posts=0,fail=true;const a=createDirectCloud({...f,fetcher:async(url,o)=>{if(o.method==='POST'){posts++;return Response.json({name:'models/veo-test/operations/123'});}if(fail)return Response.json({error:{message:'Temporary failure'}},{status:500});return Response.json({done:false});}});try{await a.submit(input);await assert.rejects(a.status(id),/500/);fail=false;assert.equal((await a.status(id)).state,'pending');assert.equal(posts,1);}finally{f.close();}});
test('uncertain submit is never automatically reposted; provider errors redact local key',async()=>{const f=fixture();let posts=0;const a=createDirectCloud({...f,fetcher:async()=>{posts++;throw Error('network disconnect');}});try{assert.equal((await a.submit(input)).state,'blocked');assert.equal((await a.submit(input)).state,'blocked');assert.equal(posts,1);}finally{f.close();}});
test('image uses provider directly and does not require meeting configuration',async()=>{const f=fixture();try{const a=createDirectCloud({...f,fetcher:async(url)=>{assert.equal(url,'https://api.openai.com/v1/images/generations');return Response.json({data:[{b64_json:png.toString('base64')}]});}});const r=await a.submit({...input,model:'openai:chatgpt-image-latest',mode:'text-image'});assert.equal(r.state,'complete');assert.equal(r.assets[0].bytes,png.length);}finally{f.close();}});
test('studio capability list works with meeting offline and never claims hosted keys are local',async()=>{const f=fixture();let calls=0;try{const a=createCloudStudio({...f,jobs:()=>[],getJob:()=>null,save:()=>{},chats:{},fetcher:async()=>{calls++;throw Error('meeting offline');}});const c=await a.caps();assert.ok(c.models.length>=14);assert.equal(calls,0);}finally{f.close();}});
test('deleting preset leaves other presets and source uploads intact',()=>{const f=fixture();try{f.db.exec('CREATE TABLE uploads(id TEXT,ext TEXT,mime TEXT)');f.db.prepare('INSERT INTO uploads VALUES(?,?,?)').run(id,'.png','image/png');const s=createPresetStore(f.db),one=s.save({...input,mode:'text-image',model:'openai:chatgpt-image-latest',uploadIds:[id]}),two=s.save({...input,mode:'text-image',model:'openai:chatgpt-image-latest'});assert.equal(s.remove(one.id),true);assert.equal(s.get(one.id),null);assert.ok(s.get(two.id));assert.equal(f.db.prepare('SELECT count(*) n FROM uploads').get().n,1);assert.equal(s.remove(one.id),false);}finally{f.close();}});
test('legacy operation recovery queries provider directly and cannot resubmit the paid job',async()=>{const f=fixture();let gets=0;try{const a=createDirectCloud({...f,fetcher:async(url,options)=>{assert.equal(options.method,'GET');assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-fast-generate-preview/operations/existing');gets++;return Response.json({done:false});}});a.adoptVideo({...input,provider:'gemini',operation:'models/veo-3.1-fast-generate-preview/operations/existing'});assert.equal((await a.status(id)).state,'pending');await assert.rejects(a.submit(input),/변경/);assert.equal(gets,1);assert.throws(()=>a.adoptVideo({...input,provider:'gemini',operation:'models/other/operations/existing'}),/접수/);}finally{f.close();}});

test('Veo content filtering retains reason and operation without a fabricated HTTP 400 or another submit',async()=>{
 const f=fixture();let posts=0;const operation='models/veo-test/operations/filtered';
 try{const a=createDirectCloud({...f,fetcher:async(url,o)=>{if(o.method==='POST'){posts++;return Response.json({name:operation});}return Response.json({done:true,response:{generateVideoResponse:{raiMediaFilteredCount:1,raiMediaFilteredReasons:['Blocked by safety policy; fake-key-for-tests-only']}}});}});
 await a.submit(input);const r=await a.status(id);assert.equal(r.state,'blocked');assert.equal(r.diagnostics.reason,'content_filtered');assert.equal(r.diagnostics.httpStatus,200);assert.match(r.error,/콘텐츠 검토/);assert.doesNotMatch(r.error,/API 400|fake-key-for-tests-only/);assert.equal(r.operation,operation);assert.equal((await a.submit(input)).state,'blocked');assert.equal(posts,1);
 }finally{f.close();}
});

test('empty Veo result is unknown rather than labelled as a request failure',async()=>{
 const f=fixture();try{const a=createDirectCloud({...f,fetcher:async(url,o)=>Response.json(o.method==='POST'?{name:'models/veo-test/operations/empty'}:{done:true,response:{generateVideoResponse:{}}})});await a.submit(input);const r=await a.status(id);assert.equal(r.diagnostics.code,'EMPTY_VIDEO_RESULT');assert.equal(r.diagnostics.httpStatus,200);assert.doesNotMatch(r.error,/400/);assert.match(r.error,/확정/);}finally{f.close();}
});

test('Grok string HTTP error surfaces the provider reason with credentials redacted',async()=>{
 const f=fixture();try{const a=createDirectCloud({...f,fetcher:async()=>Response.json({error:'Unsupported input format fake-key-for-tests-only',code:'invalid_argument'},{status:400})});const r=await a.submit({...input,model:'xai:grok-imagine-video-1.5'});assert.match(r.error,/Unsupported input format/);assert.doesNotMatch(r.error,/fake-key-for-tests-only/);assert.equal(r.diagnostics.code,'invalid_argument');assert.equal(r.provider,'xai');}finally{f.close();}
});

test('Grok failed and filtered terminal results retain the actual generation diagnosis',async()=>{
 for(const response of [{status:'failed',error:{code:'internal_error',message:'Rendering failed'}},{status:'done',video:{respect_moderation:false}}]){const f=fixture();let posts=0;try{const a=createDirectCloud({...f,fetcher:async(url,o)=>{if(o.method==='POST'){posts++;return Response.json({request_id:'existing-request'});}return Response.json(response);}});await a.submit({...input,model:'xai:grok-imagine-video-1.5'});const r=await a.status(id);assert.equal(r.state,'blocked');assert.equal(r.operation,'existing-request');assert.equal(r.diagnostics.reason,response.error?'generation_failed':'content_filtered');if(response.error)assert.match(r.error,/Rendering failed/);assert.equal(posts,1);}finally{f.close();}}
});

test('Grok HTTP 400 invalid API key is classified as authentication rather than request settings',async()=>{
 const f=fixture();try{const a=createDirectCloud({...f,fetcher:async()=>Response.json({error:'Incorrect API key provided. You can obtain an API key from https://console.x.ai.',code:'invalid-argument'},{status:400})});const r=await a.submit({...input,model:'xai:grok-imagine-video-1.5-lite'});assert.equal(r.diagnostics.reason,'authentication');assert.equal(r.diagnostics.httpStatus,400);assert.match(r.error,/API 키 인증에 실패/);assert.doesNotMatch(r.error,/요청 설정을 확인/);}finally{f.close();}
});

test('Grok key save validates without generating and preserves the previous key on failed authentication',async()=>{
 const f=fixture();let saves=0,valid=false,checks=0;f.vault.set=async()=>{saves++;};
 try{const a=createCloudStudio({...f,credentialVault:f.vault,jobs:()=>[],getJob:()=>null,save:()=>{},chats:{},fetcher:async(url,o)=>{checks++;assert.equal(url,'https://api.x.ai/v1/models');assert.equal(o.method,'GET');return valid?Response.json({data:[]}):Response.json({error:'Incorrect API key provided.'},{status:400});}});
 await assert.rejects(a.setKey('xai','xai-'+'a'.repeat(30)),/API 키 인증/);assert.equal(saves,0);valid=true;await a.setKey('xai','xai-'+'b'.repeat(30));assert.equal(saves,1);await a.setKey('xai','');assert.equal(saves,2);assert.equal(checks,2);
 }finally{f.close();}
});


test('each connected cloud text model refines directly through its existing API without creating a media job',async()=>{
 for(const provider of ['openai','gemini','xai','anthropic']){const f=fixture();let calls=0;
 try{const a=createDirectCloud({...f,fetcher:async(url,o)=>{calls++;assert.equal(url.includes('chatgpt.site'),false);const body=JSON.parse(o.body);assert.ok(JSON.stringify(body).includes('Scene data (JSON)'));assert.ok(JSON.stringify(body).includes('Test scene'));
 if(provider==='gemini'){assert.ok(url.includes('generativelanguage.googleapis.com'));return Response.json({candidates:[{content:{parts:[{text:'{"prompt":"A forest","negative":"text"}'}]}}]});}
 if(provider==='anthropic'){assert.equal(url,'https://api.anthropic.com/v1/messages');return Response.json({content:[{type:'text',text:'{"prompt":"A forest","negative":"text"}'}]});}
 assert.equal(url,provider==='openai'?'https://api.openai.com/v1/responses':'https://api.x.ai/v1/responses');return Response.json({output_text:'{"prompt":"A forest","negative":"text"}'});
 }});const r=await a.refine(provider+':chat',{messages:[{role:'system',content:'Return JSON only'},{role:'user',content:'Test scene'}]});assert.equal(r.done,true);assert.equal(JSON.parse(r.message.content).prompt,'A forest');assert.equal(calls,1);assert.equal(f.db.prepare('SELECT count(*) n FROM studio_cloud_requests').get().n,0);
 }finally{f.close();}}
});
