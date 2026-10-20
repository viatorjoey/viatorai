import {createAssetLibrary} from './asset-library.mjs';
import {createEditorAI} from './editor-ai.mjs';
import {providerVault} from './provider-vault.mjs';
import {generationEditorSnapshot} from './public/result-copy.js';
import {createVoiceStudio} from './voice-studio.mjs';
import {createContentTools} from './content-tools.mjs';
import {createCardNews} from './card-news.mjs';
import {createCloudStudio,isCloudJob,cloudInput} from './cloud-studio.mjs';
import {createStaleLeaseRecovery} from './stale-lease.mjs';
import {generationStats} from './generation-stats.mjs';
import {createCreditBalances} from './credit-balances.mjs';
import {createEngineWatch} from './engine-watch.mjs';
import {controlStatus} from './control-status.mjs';
import {createTrashPurge} from './trash-purge.mjs';
import {createQueueOrder} from './queue-order.mjs';
import {createJobRetry} from './job-retry.mjs';
import {verifyWebReset} from './web-reset.mjs';
import {createPresetStore} from './preset-store.mjs';
import {canResumeKnownPrompt,proveKnownPrompt} from './recovery-probe.mjs';
import http from 'node:http';
import {createCpuChat,isCpuChat as isLocalCpuChat} from './cpu-chat.mjs';
import {managedChat,unloadModels,CHAT_MODELS} from './gpu-lifecycle.mjs';
import {createChatStore} from './chat-store.mjs';
import {maintenanceService} from './maintenance.mjs';
import {createPushService} from './push-service.mjs';
import {JOB_LIMIT_MS,isOverdue,canCancelLocally,cancelOwnedPrompt,canRecoverCancelledJob,canRecoverUnsubmittedJob} from './job-policy.mjs';
import {refinementRequest,parseRefinement,preserveRequestedStyle} from './refinement.mjs';
import {createRefinementService} from './refinement-service.mjs';
import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync,statSync,createReadStream,openSync,closeSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomBytes,randomInt,createHash,timingSafeEqual} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execFileAsync=promisify(execFile);
import {DatabaseSync} from 'node:sqlite';
import {validateInput,imageGraph,videoGraph,isIdle,memoryReleased,ownOutputs,MODEL_CONFIG} from './graphs.mjs';
const ROOT=path.dirname(fileURLToPath(import.meta.url)),DATA=process.env.STUDIO_DATA_DIR||path.join(ROOT,'data');
for(const p of ['','uploads','results','thumbnails'])mkdirSync(path.join(DATA,p),{recursive:true});
const PORT=Number(process.env.STUDIO_PORT||8787),INTERNAL=Number(process.env.STUDIO_INTERNAL_PORT||8788);
const COMFY=process.env.STUDIO_TEST_MODE==='1'&&process.env.STUDIO_TEST_COMFY?process.env.STUDIO_TEST_COMFY:'http://127.0.0.1:8188',OLLAMA='http://127.0.0.1:11434';
const BRIDGE='OUEvnzeelRd84Sr8';
const API_ONLY=process.env.STUDIO_API_ONLY==='1',WORKER_MARKER=path.join(DATA,'worker-v2.json');
function workerQueueReady(){try{return workerReady()&&JSON.parse(readFileSync(WORKER_MARKER,'utf8')).queueOrderVersion===1;}catch{return false;}}
function workerReady(){try{const m=JSON.parse(readFileSync(WORKER_MARKER,'utf8'));process.kill(m.pid,0);return m.version===6;}catch{return false;}}
const db=new DatabaseSync(path.join(DATA,'studio.sqlite'));db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, created INTEGER, state TEXT, body TEXT); CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, expires INTEGER); CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY, ext TEXT, mime TEXT);');
db.exec('CREATE TABLE IF NOT EXISTS cancellations(id TEXT PRIMARY KEY, requested INTEGER, reason TEXT, confirmed INTEGER)');
db.exec('CREATE TABLE IF NOT EXISTS gallery_order(id TEXT PRIMARY KEY, position INTEGER NOT NULL)');
db.exec('CREATE TABLE IF NOT EXISTS web_resets(id TEXT PRIMARY KEY,body TEXT)');
const chats=createChatStore(db);
const presets=createPresetStore(db);
const creditBalances=createCreditBalances(db);
const queueOrder=createQueueOrder(db);
const maintenance=maintenanceService({db,root:ROOT,request:(p,b)=>request(COMFY,p,b),jobs,save,registerCancellation});
const retryJob=createJobRetry({db,getJob,save,jobs,request:p=>request(COMFY,p,undefined,3000),gpuInfo:()=>maintenance.gpuInfo(),catalog:modelCatalog,uploadExists:id=>!!db.prepare('SELECT 1 FROM uploads WHERE id=?').get(id),maintenanceActive:()=>!!maintenance.active()});
const push=createPushService(db,DATA,()=>[...jobs().filter(j=>!j.refineOnly&&j.mode!=='llm-chat'&&!j.deletedAt),...maintenance.list().map(j=>({...j,type:'maintenance'}))]);
async function cancelledLease(action='read',owner=''){
 const code="const{DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/home/node/.n8n/database.sqlite');d.exec('PRAGMA busy_timeout=5000');const[a,o]=process.argv.slice(1),t='data_table_user_gd2WF5s9jDTeftKt';if(a==='release'){const r=d.prepare('UPDATE '+t+' SET busy=0,owner=? WHERE id=1 AND busy=1 AND owner=? AND EXISTS(SELECT 1 FROM execution_entity WHERE id=? AND stoppedAt IS NOT NULL AND status IN (?,?,?,?,?))').run('',o,o,'error','crashed','canceled','cancelled','success');console.log(JSON.stringify({released:r.changes===1}));}else{const l=d.prepare('SELECT busy,owner FROM '+t+' WHERE id=1').get(),e=l?.owner?d.prepare('SELECT status,stoppedAt FROM execution_entity WHERE id=?').get(l.owner):null;console.log(JSON.stringify({...l,...e}));}d.close();";
 const r=await execFileAsync('docker',['exec','n8n','node','-e',code,action,owner],{windowsHide:true,timeout:10000});return JSON.parse(r.stdout.trim());
}
const recoverStaleLease=createStaleLeaseRecovery({readLease:()=>cancelledLease(),findJob:owner=>{const r=db.prepare("SELECT body FROM jobs WHERE json_extract(body,'$.owner')=? LIMIT 1").get(owner);return r?JSON.parse(r.body):null;},confirmed:id=>!!db.prepare('SELECT 1 FROM cancellations WHERE id=? AND confirmed IS NOT NULL').get(id),hasActive:()=>!!db.prepare("SELECT 1 FROM jobs WHERE state IN ('running','submitting','cleaning','releasing') AND coalesce(json_extract(body,'$.chatLane'),'gpu')!='cpu' AND coalesce(json_extract(body,'$.executionLane'),'gpu') NOT IN ('cloud','design')").get(),queue:()=>request(COMFY,'/queue',undefined,3000),models:async()=>{const r=await request(OLLAMA,'/api/ps',undefined,3000);if(!Array.isArray(r.models))throw Error('LLM state unavailable');return r.models;},free:()=>request(COMFY,'/free',{unload_models:true,free_memory:true}),release:async owner=>(await cancelledLease('release',owner)).released,save});
function llmRequest(p,b,t){return request(OLLAMA,p,b,t);}
async function gpuUsedMiB(){const r=await execFileAsync('nvidia-smi',['--query-gpu=memory.used','--format=csv,noheader,nounits'],{windowsHide:true,timeout:5000});const used=Number(r.stdout.trim().split('\n')[0]);if(!Number.isFinite(used))throw Error('GPU 메모리 측정 실패');return used;}
async function useLlm(j,value){
 const baseline=await gpuUsedMiB();j.llmMemory={beforeMiB:baseline};save(j);
 try{return await managedChat(llmRequest,value,on=>{j.llmIntent=on;save(j);});}
 finally{if(!j.llmIntent){let stable=0;for(let i=0;i<40;i++){const used=await gpuUsedMiB();stable=used<=baseline+512?stable+1:0;if(stable>=2){j.llmMemory.afterMiB=used;j.llmMemory.verified=true;save(j);break;}if(i===39)throw Error('LLM 종료 후 GPU 메모리 반환을 확인하지 못해 다음 모델을 보류합니다.');await sleep(1000);}}}
}
const pairCode=String(randomInt(10000000,99999999)),attempts=new Map();
const sha=s=>createHash('sha256').update(s).digest('hex');
let gate=null,dispatching=false,checkingRecovery=false,statusCache=null,statusAt=0;
let webResetting=false;
const controlPlans=new Map(),purgePlans=new Map();
const trashPurge=createTrashPurge({db,data:DATA,getJob,save,pendingThumbnail:name=>thumbnailWork.has(name)});
async function webResetTarget(){if(voices.isBusy()||editorAI.isBusy())throw Error('음성 처리가 끝난 뒤 다시 시도하세요.');return verifyWebReset({apiOnly:API_ONLY,pid:process.pid,supervisor:await request('http://127.0.0.1:8801','/health',undefined,2000),jobs:jobs(),maintenanceActive:!!maintenance.active(),cpuBusy:cpuChat.isBusy()});}
const thumbnailWork=new Map();let thumbnailChain=Promise.resolve();
const VIDEO_PYTHON=process.env.STUDIO_VIDEO_PYTHON||'C:/Users/viato/AppData/Local/Comfy-Desktop/ComfyUI-Installs/viator comfy/ComfyUI/.venv/Scripts/python.exe';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function save(j){const cancelled=db.prepare('SELECT confirmed FROM cancellations WHERE id=?').get(j.id);if(cancelled?.confirmed){j.state='cancelled';j.cancelled=true;j.completedAt=cancelled.confirmed;}j.updated=Date.now();db.prepare('INSERT INTO jobs VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,body=excluded.body').run(j.id,j.created,j.state,JSON.stringify(j));return j;}
function getJob(id){const r=db.prepare('SELECT body FROM jobs WHERE id=?').get(id);return r?JSON.parse(r.body):null;}
function jobs(){return db.prepare("SELECT body FROM jobs WHERE state NOT IN ('complete','cancelled') OR id IN (SELECT id FROM jobs WHERE state IN ('complete','cancelled') ORDER BY created DESC LIMIT 200) ORDER BY created DESC").all().map(r=>JSON.parse(r.body));}
const isCpuChat=j=>isLocalCpuChat(j)||isCloudJob(j)||['design','content'].includes(j.executionLane);
const cardNews=createCardNews({db,data:DATA,root:ROOT,jobs,save,getJob,execFileAsync,python:VIDEO_PYTHON,testMode:process.env.STUDIO_TEST_MODE==='1'});
const contentTools=createContentTools({db,data:DATA,root:ROOT,jobs,save,getJob,execFileAsync,python:VIDEO_PYTHON,testMode:process.env.STUDIO_TEST_MODE==='1'});
const assetLibrary=createAssetLibrary({db,data:DATA,jobs:()=>db.prepare("SELECT body FROM jobs WHERE state='complete' ORDER BY created DESC").all().map(r=>JSON.parse(r.body)),probe:async file=>{const r=await execFileAsync(VIDEO_PYTHON,[path.join(ROOT,'render-video-edit.py'),'probe',file],{windowsHide:true,timeout:30000,maxBuffer:200000});return JSON.parse(r.stdout);}});
const cloudStudio=createCloudStudio({contentTools,cardNews,db,data:DATA,jobs,getJob,save,chats,catalog:modelCatalog,validateLocal:validateInput,testMode:process.env.STUDIO_TEST_MODE==='1'});
const cpuChat=createCpuChat({db,chats,root:ROOT,data:DATA,jobs,getJob,save,request,testMode:process.env.STUDIO_TEST_MODE==='1'});
const voices=createVoiceStudio({db,data:DATA,root:ROOT,jobs,getJob,save,python:VIDEO_PYTHON,execFileAsync,enabled:API_ONLY});
const refinements=createRefinementService({cpuChat,cloudStudio,jobs,getJob,save});
function publicJob(j){if(j.state==='complete'&&j.voiceAudioId&&!j.voiceApplied)j={...j,state:j.voiceStatus==='failed'?'blocked':'running',message:j.voiceStatus==='failed'?j.message:'선택한 목소리를 영상에 적용하고 있습니다.'};const cancellation=db.prepare('SELECT * FROM cancellations WHERE id=?').get(j.id);if(cancellation?.confirmed)j={...j,state:'cancelled',deletedAt:cancellation.confirmed};else if(cancellation)j={...j,message:'중단 요청 중 · '+cancellation.reason};const {id,created,updated,state,message,mode,prompt,negative,aspect,quality,duration,seed,guidance,uploadId,promptId,owner,result,assets,cleanup,progress,model,deletedAt,resolution,startedAt,completedAt,submissionIntent,enhance,originalPrompt,originalNegative,refinedAt,refineOnly,favorite,engineStep,engineTotal,engineNode,phase}=j;return {generationEditor:j.generationEditor,voiceAudioId:j.voiceAudioId,voiceApplied:j.voiceApplied,voiceStatus:j.voiceStatus,voiceInfo:j.voiceInfo,refinementModel:j.refinementModel,refinementModelLabel:j.refinementModelLabel,contentProjectId:j.contentProjectId,cardProjectId:j.cardProjectId,executionLane:j.executionLane,provider:j.provider,meeting:j.meeting,purgedAt:j.purgedAt,...queueOrder.fields(id),galleryOrder:db.prepare('SELECT position FROM gallery_order WHERE id=?').get(id)?.position,id,created,updated,state,message,mode,prompt,negative,aspect,quality,duration,seed,guidance,uploadId,promptId,executionId:owner,result,assets,cleanup,progress,model,deletedAt,resolution,startedAt,completedAt,submissionIntent,enhance,originalPrompt,originalNegative,refinedAt,refineOnly,favorite,engineStep,engineTotal,engineNode,phase};}
const CATALOG_FILE=path.join(DATA,'model-catalog-cache.json');let catalogCache=null,catalogTime=0,catalogLoading=null;try{catalogCache=JSON.parse(readFileSync(CATALOG_FILE,'utf8'));}catch{}
async function refreshCatalog(){const [models,clips,vaes]=await Promise.all(['diffusion_models','text_encoders','vae'].map(x=>request(COMFY,'/models/'+x)));const result=Object.entries(MODEL_CONFIG).filter(([name,c])=>models.includes(name)&&(!c.clip||clips.includes(c.clip))&&vaes.includes(c.vae||(c.kind==='image'?'flux2-vae.safetensors':'ltx-2.5-video-vae-bf16.safetensors'))).map(([id,c])=>({id,label:c.label,modes:c.modes||(c.kind==='image'?['text-image','image-image']:['text-video','image-video'])}));catalogCache=result;catalogTime=Date.now();writeFileSync(CATALOG_FILE,JSON.stringify(result));return result;}
async function modelCatalog(){if(!catalogLoading&&Date.now()-catalogTime>60000){catalogLoading=refreshCatalog().finally(()=>{catalogLoading=null;});if(catalogCache)catalogLoading.catch(()=>{catalogTime=Date.now();});}return catalogCache||await catalogLoading;}
async function request(base,p,body,timeout=15000){const r=await fetch(base+p,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});if(!r.ok)throw Error('연결 응답 오류 '+r.status+' ('+p.split('?')[0]+')');const text=await r.text();return text.trim()?JSON.parse(text):{};}
function send(res,status,value,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(value));}
async function body(req,max=24*1024*1024){const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>max)throw Error('파일은 '+Math.round(max/1024/1024)+'MB 이하로 선택해 주세요.');chunks.push(c);}return Buffer.concat(chunks);}
async function json(req,max=65536){return JSON.parse((await body(req,max)).toString('utf8')||'{}');}
function directLocal(req){return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host||'')&&!req.headers['x-forwarded-for']&&!req.headers['tailscale-user-login'];}
function authenticated(req){const t=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('studio='))?.slice(7);if(!t)return false;return !!db.prepare('SELECT 1 FROM sessions WHERE hash=? AND expires>?').get(sha(t),Date.now());}
function setSession(req,res){const t=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?)').run(sha(t),Date.now()+30*86400000);const secure=req.headers['x-forwarded-proto']==='https'||(req.headers.host||'').endsWith('.ts.net');res.setHeader('Set-Cookie','studio='+t+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000'+(secure?'; Secure':''));}
function sameOrigin(req){const host=req.headers.host||'';if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)&&!(/^[a-z0-9.-]+\.ts\.net$/.test(host)))return false;const o=req.headers.origin;if(!o)return directLocal(req)||req.headers['sec-fetch-site']==='same-origin';try{return new URL(o).host===host;}catch{return false;}}
async function health(){
 if(statusCache&&Date.now()-statusAt<4000)return statusCache;
 const [stats,queue,gpu]=await Promise.allSettled([request(COMFY,'/system_stats',undefined,2000),request(COMFY,'/queue',undefined,2000),execFileAsync('nvidia-smi',['--query-gpu=name,utilization.gpu,memory.used,memory.total','--format=csv,noheader,nounits'],{windowsHide:true,timeout:3000})]);
 const s=stats.status==='fulfilled'?stats.value:null,q=queue.status==='fulfilled'?queue.value:null;
 let metrics={};if(gpu.status==='fulfilled'){const [name,util,used,total]=gpu.value.stdout.trim().split('\n')[0].split(',').map(x=>x.trim());metrics={gpu:name,utilization:Number(util),usedGB:Math.round(Number(used)/1024*10)/10,totalGB:Math.round(Number(total)/1024*10)/10};metrics.freeGB=Math.round((Number(total)-Number(used))/1024*10)/10;}
 else if(s?.devices?.[0]){const d=s.devices[0];metrics={gpu:d.name,totalGB:Math.round(d.vram_total/1073741824*10)/10,freeGB:Math.round(d.vram_free/1073741824*10)/10,usedGB:Math.round((d.vram_total-d.vram_free)/1073741824*10)/10};}
 const apiReady=!!s?.system&&Array.isArray(q?.queue_running)&&Array.isArray(q?.queue_pending);
 let engineState=apiReady?(q.queue_running.length||q.queue_pending.length?'busy':'ready'):'unknown';if(!apiReady){try{engineState=(await maintenance.processInfo()).state;}catch{}}
 statusCache={online:apiReady,engineState,queueOrderReady:workerQueueReady(),...metrics,running:q?.queue_running?.length,pending:q?.queue_pending?.length,bridgeWorkflow:BRIDGE,remoteReady:false,waitingForRecovery:jobs().some(j=>j.state==='blocked'&&!!db.prepare('SELECT 1 FROM cancellations WHERE id=? AND confirmed IS NOT NULL').get(j.id))};statusCache.controls=controlStatus({jobs:jobs(),cancellations:db.prepare('SELECT * FROM cancellations').all(),maintenance:maintenance.list(),webReset:(()=>{const row=db.prepare("SELECT body FROM web_resets ORDER BY rowid DESC LIMIT 1").get();return row?JSON.parse(row.body):null;})(),...statusCache});statusCache.maintenanceActive=!!maintenance.active();statusCache.engineRecovery={enabled:API_ONLY,...engineWatch.status};statusAt=Date.now();return statusCache;
}
const TIME_LIMIT=JOB_LIMIT_MS;
function registerCancellation(j,reason){db.prepare('INSERT OR IGNORE INTO cancellations VALUES(?,?,?,NULL)').run(j.id,Date.now(),reason);}
async function stopOwned(j){
 if(maintenance.active())return false;
 const record=db.prepare('SELECT * FROM cancellations WHERE id=?').get(j.id);if(!record||record.confirmed)return !!record?.confirmed;
 if(!j.promptId)return false;
 if(!await cancelOwnedPrompt(j,(p,body)=>request(COMFY,p,body,5000)))return false;
 db.prepare('UPDATE cancellations SET confirmed=? WHERE id=?').run(Date.now(),j.id);return true;
}
let cancellationBusy=false;
async function enforceDeadlines(){if(process.env.STUDIO_TEST_MODE==='1'||cancellationBusy)return;cancellationBusy=true;try{for(const j of jobs()){if(isCloudJob(j)||['design','content'].includes(j.executionLane))continue;const start=j.startedAt||j.submissionIntent;const cancellable=['running','submitting','cleaning','releasing','blocked'].includes(j.state);if(isOverdue(j))registerCancellation(j,'작업시간 15분 초과');if(db.prepare('SELECT 1 FROM cancellations WHERE id=? AND confirmed IS NULL').get(j.id)){try{await stopOwned(j);}catch{}}}}finally{cancellationBusy=false;}}
async function thumbnailFile(asset,sourceDirectory='results'){const output=path.join(DATA,'thumbnails',asset.filename+'.jpg');if(existsSync(output))return output;if(!thumbnailWork.has(asset.filename)){const task=thumbnailChain.catch(()=>{}).then(async()=>{await execFileAsync(VIDEO_PYTHON,[path.join(ROOT,'thumbnail.py'),path.join(DATA,sourceDirectory,asset.filename),output+'.tmp'],{windowsHide:true,timeout:20000});renameSync(output+'.tmp',output);return output;});thumbnailChain=task;thumbnailWork.set(asset.filename,task);task.finally(()=>thumbnailWork.delete(asset.filename)).catch(()=>{});}return thumbnailWork.get(asset.filename);}
async function ensureIdle(){if(maintenance.active())throw Error('ComfyUI 재시작 중입니다. 잠금을 보존합니다.');if(!isIdle(await request(COMFY,'/queue')))throw Error('다른 작업이 진행 중입니다. 잠금을 보존하고 확인을 기다립니다.');}
function png(b){return b.length>24&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));}
function mediaValid(b,ext){if(ext==='.png')return png(b);if(ext==='.mp4')return b.length>32&&b.subarray(4,8).toString()==='ftyp';if(ext==='.webm')return b.subarray(0,4).equals(Buffer.from([26,69,223,163]));if(ext==='.jpg'||ext==='.jpeg')return b[0]===255&&b[1]===216;return ext==='.webp'&&b.subarray(8,12).toString()==='WEBP';}
async function uploadToComfy(j){const u=db.prepare('SELECT * FROM uploads WHERE id=?').get(j.uploadId);if(!u)throw Error('선택한 사진을 찾을 수 없습니다.');const b=readFileSync(path.join(DATA,'uploads',u.id+u.ext));const f=new FormData();f.set('image',new Blob([b],{type:u.mime}),'mobile_'+j.id+u.ext);f.set('type','input');f.set('overwrite','false');const r=await fetch(COMFY+'/upload/image',{method:'POST',body:f,signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('사진 전송에 실패했습니다.');const out=await r.json();if(!out.name||out.type!=='input')throw Error('사진 등록 확인에 실패했습니다.');return (out.subfolder?out.subfolder+'/':'')+out.name;}
async function persistAssets(j,refs){j.assets=[];for(let i=0;i<refs.length;i++){const ref=refs[i],ext=path.extname(ref.filename).toLowerCase(),r=await fetch(COMFY+'/view?'+new URLSearchParams(ref),{signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('결과 다운로드를 확인하지 못했습니다.');const b=Buffer.from(await r.arrayBuffer());if(!mediaValid(b,ext))throw Error('결과 파일 형식을 확인하지 못했습니다.');const filename=j.id+'-'+i+ext;writeFileSync(path.join(DATA,'results',filename+'.tmp'),b);renameSync(path.join(DATA,'results',filename+'.tmp'),path.join(DATA,'results',filename));if(statSync(path.join(DATA,'results',filename)).size!==b.length)throw Error('결과 파일 저장 검증 실패');j.assets.push({filename,bytes:b.length,sha256:sha(b),source:ref,url:'/api/results/'+filename,kind:/\.(mp4|webm)$/.test(ext)?'video':'image'});save(j);}}
async function cleanComfy(j){j.state='cleaning';j.message=j.assets?.length||j.result?'결과를 저장했어요. 메모리를 정리하고 있습니다.':'다음 작업을 위해 GPU 메모리를 정리하고 있습니다.';save(j);await ensureIdle();const before=await request(COMFY,'/system_stats');await sleep(2000);await ensureIdle();await request(COMFY,'/free',{unload_models:true,free_memory:true});let last;for(let i=0;i<60;i++){await sleep(2000);await ensureIdle();last=await request(COMFY,'/system_stats');if(memoryReleased(last)){await sleep(3000);await ensureIdle();const stable=await request(COMFY,'/system_stats');if(memoryReleased(stable)){j.cleanup={verified:true,before:before.devices,after:stable.devices};save(j);return;}}}throw Error('메모리 정리를 확인하지 못했습니다. 잠금을 보존했습니다.');}
function watchProgress(j){
 let socket,stopped=false,reconnect;const graphFile=path.join(DATA,j.id+'-graph.json');let graph={};try{graph=JSON.parse(readFileSync(graphFile,'utf8'));}catch{}
 const connect=()=>{if(stopped)return;try{socket=new WebSocket(COMFY.replace('http:','ws:')+'/ws?clientId='+encodeURIComponent('mobile-'+j.id));socket.addEventListener('message',e=>{try{if(typeof e.data!=='string')return;const event=JSON.parse(e.data),d=event.data;if(d?.prompt_id!==j.promptId)return;if(event.type==='executing'&&d.node){j.engineNode=graph[d.node]?.class_type||'생성 처리';delete j.engineStep;delete j.engineTotal;save(j);}if(event.type==='progress'&&Number.isFinite(d.value)&&d.max>0){j.engineStep=d.value;j.engineTotal=d.max;save(j);}}catch{}});socket.addEventListener('error',()=>{});socket.addEventListener('close',()=>{if(!stopped){reconnect=setTimeout(connect,3000);reconnect.unref();}});}catch{}};connect();return()=>{stopped=true;clearTimeout(reconnect);socket?.close();};
}
async function finishExisting(j){
 const stopProgress=watchProgress(j);try{
 const end=(j.startedAt||j.submissionIntent||Date.now())+TIME_LIMIT;
 while(Date.now()<end){
  if(db.prepare('SELECT 1 FROM cancellations WHERE id=?').get(j.id)){if(await stopOwned(j)){await cleanComfy(j);j.cancelled=true;return;}await sleep(2000);continue;}
  let h;try{h=await request(COMFY,'/history/'+encodeURIComponent(j.promptId),undefined,60000);}
  catch{j.progress='생성 프로그램의 응답을 기다리고 있어요. 다시 제출하지 않습니다.';save(j);await sleep(5000);continue;}
  const refs=ownOutputs(h,j.promptId,j.id);
  if(refs){if(!j.assets?.length)await persistAssets(j,refs);else for(const a of j.assets){const b=readFileSync(path.join(DATA,'results',a.filename));if(b.length!==a.bytes||sha(b)!==a.sha256)throw Error('저장 결과 검증 실패');}await cleanComfy(j);return;}
  j.progress='생성 중 · 결과를 저장할 때까지 기다리고 있어요.';save(j);await sleep(5000);
 }
 registerCancellation(j,'작업시간 15분 초과');if(await stopOwned(j)){await cleanComfy(j);j.cancelled=true;return;}throw Error('15분 초과로 중단을 요청했습니다. 실제 중단 확인 전까지 GPU 잠금을 유지합니다.');
 }finally{stopProgress();}
}
async function runJob(j){
 if(j.mode==='memory-clean'){await ensureIdle();const loaded=(await request(OLLAMA,'/api/ps')).models||[];if(loaded.some(m=>!CHAT_MODELS.includes(m.name)))throw Error('앱 외부 LLM이 사용 중입니다. 해당 모델을 먼저 종료하세요.');await unloadModels(llmRequest,loaded.map(m=>m.name));await cleanComfy(j);return;}
 await ensureIdle();const llm=await request(OLLAMA,'/api/ps');if(llm.models?.length)throw Error('다른 LLM이 메모리를 사용 중입니다. 종료하지 않고 확인을 기다립니다.');
 if(j.mode==='llm-chat'){
  await cleanComfy(j);j.state='running';j.message='답변을 작성하고 있습니다.';save(j);
  const c=chats.get(j.chatId);if(!c)throw Error('삭제된 채팅입니다.');
  if(c.messages.some(m=>m.jobId===j.id&&m.role==='assistant')){await unloadModels(llmRequest,[j.model]);j.cleanup={verified:true,ollamaUnloaded:true};save(j);return;}
  const messages=c.messages.slice(-16).filter(m=>m.role==='user'||m.role==='assistant').map(m=>{const out={role:m.role,content:m.content};if(m.uploadId){const u=db.prepare('SELECT * FROM uploads WHERE id=?').get(m.uploadId);if(!u)throw Error('첨부 이미지를 찾을 수 없습니다.');out.images=[readFileSync(path.join(DATA,'uploads',u.id+u.ext)).toString('base64')];}return out;});
  const out=await useLlm(j,{model:j.model,think:j.model==='gpt-oss:20b'?'low':false,messages,options:{temperature:.6,num_ctx:4096,num_predict:1600}});
  if(out.done!==true||!out.message?.content)throw Error('채팅 답변 완료를 확인하지 못했습니다.');
  if(db.prepare('SELECT 1 FROM cancellations WHERE id=?').get(j.id)){db.prepare('UPDATE cancellations SET confirmed=? WHERE id=?').run(Date.now(),j.id);j.cancelled=true;j.cleanup={verified:true,ollamaUnloaded:true};save(j);return;}
  const current=chats.get(j.chatId);if(current&&!current.messages.some(m=>m.jobId===j.id&&m.role==='assistant')){current.messages.push({id:randomUUID(),jobId:j.id,role:'assistant',model:j.model,content:out.message.content,created:Date.now()});chats.put(current);}
  j.result='답변을 저장했습니다.';j.cleanup={verified:true,ollamaUnloaded:true};save(j);return;
 }
 if(j.mode==='image-text'){
  // Release only cached ComfyUI models while holding the same shared GPU lock and an empty queue.
  await cleanComfy(j);j.state='running';j.message='사진에서 장면과 프롬프트를 읽고 있습니다.';save(j);
  const u=db.prepare('SELECT * FROM uploads WHERE id=?').get(j.uploadId),image=readFileSync(path.join(DATA,'uploads',u.id+u.ext)).toString('base64');
  j.llmIntent=true;save(j);
  const out=await useLlm(j,{model:'qwen3.5:9b',stream:false,think:false,keep_alive:0,messages:[{role:'user',content:'사진에 실제로 보이는 내용만 쉬운 한국어로 설명한 뒤, 이미지 또는 영상 생성에 사용할 상세한 영어 프롬프트를 작성해 주세요. 인물의 신원은 추측하지 마세요. '+j.prompt,images:[image]}],options:{temperature:0.2,num_ctx:4096,num_predict:700}});
  if(!out.message?.content||out.done!==true)throw Error('사진 분석 완료를 확인하지 못했습니다.');j.result=out.message.content;save(j);
  for(let i=0;i<15;i++){const ps=await request(OLLAMA,'/api/ps');if(!ps.models.length){j.cleanup={verified:true,ollamaUnloaded:true};save(j);return;}await sleep(1000);}throw Error('Qwen 언로드를 확인하지 못했습니다.');
 }
 if(j.enhance&&!j.refinedAt){
  await cleanComfy(j);j.state='running';j.message='Qwen이 장면 설명과 피하고 싶은 요소를 다듬고 있어요.';j.phase='refining';j.originalPrompt=j.prompt;j.originalNegative=j.negative;save(j);
  const tags=await request(OLLAMA,'/api/tags');if(!tags.models?.some(m=>m.name==='qwen3.5:9b'))throw Error('설치된 Qwen 모델을 찾지 못해 문장 보정을 보류합니다.');
  j.llmIntent=true;save(j);
  let refined,refinementError;for(let attempt=0;attempt<2;attempt++){const out=await useLlm(j,refinementRequest({...j,refinementAttempt:j.refinementAttempt||attempt}));try{refined=preserveRequestedStyle(parseRefinement(out),j);break;}catch(e){refinementError=e;}}
  let unloaded=false;for(let i=0;i<30;i++){if(!(await request(OLLAMA,'/api/ps')).models.length){unloaded=true;break;}await sleep(1000);}if(!unloaded)throw Error('Qwen 언로드가 확인되지 않아 생성을 보류합니다.');
  if(!refined){j.llmIntent=false;save(j);throw refinementError;}Object.assign(j,refined);j.refinedAt=Date.now();j.phase='generating';j.message='문장을 다듬었어요. 생성 모델을 준비합니다.';save(j);
 }
 if(j.refineOnly){j.cleanup={verified:true,ollamaUnloaded:true};j.result=j.prompt;save(j);return;}
 if(isOverdue(j))registerCancellation(j,'작업시간 15분 초과');
 if(db.prepare('SELECT 1 FROM cancellations WHERE id=?').get(j.id)){await ensureIdle();if((await request(OLLAMA,'/api/ps')).models?.length)throw Error('LLM 정리 확인 전까지 중단을 기다립니다.');db.prepare('UPDATE cancellations SET confirmed=? WHERE id=?').run(Date.now(),j.id);j.cancelled=true;return;}
 const imageName=['image-video','image-image'].includes(j.mode)?await uploadToComfy(j):null;
 const graph=['text-image','image-image'].includes(j.mode)?imageGraph(j,j.id,imageName):videoGraph(j,j.id,imageName);
 writeFileSync(path.join(DATA,j.id+'-graph.json'),JSON.stringify(graph,null,2));
 await ensureIdle();j.state='submitting';j.message='생성을 시작하고 있습니다.';j.submissionIntent=Date.now();save(j);
 // Never retry this non-idempotent POST. An uncertain response keeps both the job and shared lock.
 const submitted=await request(COMFY,'/prompt',{prompt:graph,client_id:'mobile-'+j.id},30000);
 if(!submitted.prompt_id||Object.keys(submitted.node_errors||{}).length)throw Error('생성 제출이 거절되었거나 불확실합니다. 확인이 필요합니다.');
 j.promptId=submitted.prompt_id;j.state='running';j.message='데스크톱에서 만들고 있어요. 이 화면을 닫아도 계속됩니다.';save(j);
 await finishExisting(j);
}
// Interrupted jobs keep their identifiers and shared lock; never repeat a submission after restart.
if(!API_ONLY){for(const j of jobs())if(!isCpuChat(j)&&!(isCloudJob(j)&&j.cloudRoute==='direct'&&j.cloudSubmitted)&&!['queued','complete','blocked','cancelled'].includes(j.state)){j.restartInterrupted=true;j.state='blocked';j.message='앱이 다시 시작되었습니다. 저장된 작업 번호로 확인이 필요합니다.';save(j);}}
async function dispatch(){
 if(process.env.STUDIO_TEST_MODE==='1'||API_ONLY)return;
 if(dispatching||checkingRecovery||maintenance.active())return;
 await recoverStaleLease();
 if(dispatching||checkingRecovery||maintenance.active())return;
 const interrupted=jobs().filter(j=>!j.recoveryRequested&&canResumeKnownPrompt(j)&&!db.prepare('SELECT 1 FROM cancellations WHERE id=?').get(j.id));
 if(interrupted.length){checkingRecovery=true;try{if(!(await request(OLLAMA,'/api/ps',undefined,3000)).models?.length){for(const j of interrupted){try{if(await proveKnownPrompt(j,(p)=>request(COMFY,p,undefined,3000))){j.recoveryRequested=true;j.recoveryAttempts=(j.recoveryAttempts||0)+1;j.lastRecoveryAt=Date.now();save(j);}}catch{}}}}catch{}finally{checkingRecovery=false;}}
 const recoverable=jobs().filter(j=>!j.recoveryRequested&&(canRecoverCancelledJob(j,db.prepare('SELECT confirmed FROM cancellations WHERE id=?').get(j.id))||canRecoverUnsubmittedJob(j)));
 if(recoverable.length){checkingRecovery=true;let safe=false;try{safe=isIdle(await request(COMFY,'/queue',undefined,3000))&&!(await request(OLLAMA,'/api/ps',undefined,3000)).models?.length;}catch{}finally{checkingRecovery=false;}if(!safe)return;for(const j of recoverable){j.recoveryRequested=true;j.recoveryAttempts=(j.recoveryAttempts||0)+1;j.lastRecoveryAt=Date.now();save(j);}}
 const recovery=jobs().find(j=>j.state==='blocked'&&j.recoveryRequested===true);
 if(!recovery&&jobs().some(j=>j.state==='blocked'&&!isCpuChat(j)))return;
 if(!recovery){checkingRecovery=true;let safe=false;try{safe=isIdle(await request(COMFY,'/queue',undefined,3000));}catch{}finally{checkingRecovery=false;}if(!safe)return;}
 const row=recovery?null:queueOrder.claimNext();if(!recovery&&!row)return;
 const j=recovery||JSON.parse(row.body);if(recovery){j.recoveryRequested=false;save(j);}dispatching=true;gate={id:j.id,started:false,owner:null,expires:Date.now()+60000,recovery:!!recovery};
 const child=spawn('docker',['exec','-e','N8N_RUNNERS_BROKER_PORT=5681','-e','NODE_OPTIONS=--require=/tmp/ai-creator-mobile-preload.cjs','n8n','n8n','execute','--id='+(recovery?'2Fn3if59BIQZyrVf':BRIDGE),'--rawOutput'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 // Do not persist raw n8n output (may contain runtime tokens or workflow data).
 child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});
 const finish=()=>{queueOrder.release(j.id);const x=getJob(j.id);if(gate?.started&&!gate.acknowledged&&x&&!['complete','blocked','cancelled'].includes(x.state)){x.state='blocked';x.message='n8n의 최종 확인이 필요합니다. 중복 생성하지 않도록 잠금을 보존했습니다.';save(x);}gate=null;dispatching=false;};
 child.once('error',()=>{const x=getJob(j.id);x.message='Docker 연결을 확인해 주세요.';save(x);finish();});child.once('close',finish);
}
const commonHeaders={'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"};
function serveFile(req,res,file,mime,privateFile=false){if(!existsSync(file)){send(res,404,{error:'파일을 찾지 못했습니다.'});return;}const size=statSync(file).size;const h={...commonHeaders,'Content-Type':mime,'Accept-Ranges':'bytes','Cache-Control':privateFile?'no-store':'no-cache'};if(privateFile&&new URL(req.url,'http://local').searchParams.has('download'))h['Content-Disposition']='attachment; filename="'+path.basename(file)+'"';const range=req.headers.range;if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);let a,b;if(!m||(!m[1]&&!m[2])){res.writeHead(416,{'Content-Range':'bytes */'+size});res.end();return;}if(!m[1]){a=Math.max(0,size-Number(m[2]));b=size-1;}else{a=Number(m[1]);b=m[2]?Number(m[2]):size-1;}if(a>b||a>=size||b>=size){res.writeHead(416,{'Content-Range':'bytes */'+size});res.end();return;}res.writeHead(206,{...h,'Content-Range':`bytes ${a}-${b}/${size}`,'Content-Length':b-a+1});if(req.method==='HEAD')res.end();else createReadStream(file,{start:a,end:b}).pipe(res);}else{res.writeHead(200,{...h,'Content-Length':size});if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res);}}
const editorAI=createEditorAI({db,vault:providerVault(DATA),cloudStudio});
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm'};
const app=http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://local'),p=u.pathname;
 if(webResetting&&!['GET','HEAD'].includes(req.method)){send(res,503,{error:'웹앱을 다시 연결하고 있습니다. 잠시 기다려 주세요.'});return;}
 if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host||'')&&!/^[a-z0-9.-]+\.ts\.net$/.test(req.headers.host||'')){send(res,403,{error:'허용되지 않은 주소입니다.'});return;}
 if(!['GET','HEAD'].includes(req.method)&&!sameOrigin(req)){send(res,403,{error:'앱 화면에서 다시 시도해 주세요.'});return;}
 if(p==='/api/local-session'&&req.method==='POST'){if(!directLocal(req)){send(res,403,{error:'데스크톱에서만 연결할 수 있습니다.'});return;}setSession(req,res);send(res,200,{ok:true});return;}
 if(p==='/api/pair'&&req.method==='POST'){
  const key=req.headers['tailscale-user-login']||req.socket.remoteAddress,a=attempts.get(key)||{count:0,until:Date.now()+600000};if(Date.now()>a.until){a.count=0;a.until=Date.now()+600000;}a.count++;attempts.set(key,a);if(a.count>10){send(res,429,{error:'잠시 후 다시 시도해 주세요.'});return;}
  const x=await json(req,1024),code=String(x.code||'');if(code.length!==pairCode.length||!timingSafeEqual(Buffer.from(code),Buffer.from(pairCode))){send(res,401,{error:'연결 번호를 확인해 주세요.'});return;}setSession(req,res);send(res,200,{ok:true});return;
 }
 if(p.startsWith('/api/')){
  if(!authenticated(req)){send(res,401,{error:'데스크톱에 표시된 연결 번호를 입력해 주세요.'});return;}
  if(p==='/api/assets'&&req.method==='GET'){send(res,200,assetLibrary.list());return;}
  if(p==='/api/assets/auto-save'&&req.method==='POST'){send(res,200,assetLibrary.setAutoSave(await json(req)));return;}
  if(p==='/api/assets/folders'&&req.method==='POST'){const x=await json(req);send(res,201,assetLibrary.createFolder(x.name,x.parentId));return;}
  if(p==='/api/assets/move'&&req.method==='POST'){const x=await json(req);send(res,200,assetLibrary.move(x.ids,x.folderId));return;}
  if(p==='/api/assets/upload'&&req.method==='POST'){let name;try{name=decodeURIComponent(req.headers['x-file-name']||'');}catch{throw Error('파일 이름을 확인해주세요.');}send(res,201,await assetLibrary.upload(await body(req,200*1024*1024),name,u.searchParams.get('folderId'),req.headers['idempotency-key']));return;}
  if(p.startsWith('/api/assets/file/')&&['GET','HEAD'].includes(req.method)){const a=assetLibrary.file(p.split('/')[4]);if(!a){send(res,404,{});return;}if(a.kind==='document')res.setHeader('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(a.title));res.setHeader('X-Content-Type-Options','nosniff');serveFile(req,res,a.file,a.mime,true);return;}
  if(p.startsWith('/api/assets/thumbnail/')&&['GET','HEAD'].includes(req.method)){const a=assetLibrary.file(p.split('/')[4]);if(!a||a.kind==='document'){send(res,404,{});return;}const file=a.kind==='video'?await thumbnailFile({filename:a.assetId+a.ext},'uploads'):a.file;serveFile(req,res,file,a.kind==='video'?'image/jpeg':a.mime,true);return;}
  if(p==='/api/editor/transcribe'&&req.method==='POST'){send(res,200,await editorAI.transcribe(await body(req,12*1024*1024),req.headers['content-type']||'',req.headers['idempotency-key']));return;}
  if(p==='/api/editor/plan'&&req.method==='POST'){const x=await json(req,150000);send(res,200,await editorAI.plan(x.project,x.prompt,x.model,req.headers['idempotency-key']));return;}
  if(p==='/api/editor/import'&&req.method==='POST'){
   const {jobId,filename,assetId}=await json(req);if(assetId){send(res,201,assetLibrary.editorAsset(assetId));return;}const j=getJob(jobId),a=j?.assets?.find(a=>a.filename===filename&&['image','video'].includes(a.kind));if(!j||j.state!=='complete'||j.deletedAt||!a||!/^[a-f0-9-]{36}-\d+\.(png|jpg|jpeg|webp|mp4|webm)$/.test(a.filename))throw Error('사용할 완료 에셋을 선택하세요.');
   const ext=path.extname(a.filename),id=randomUUID(),file=path.join(DATA,'uploads',id+ext);writeFileSync(file,readFileSync(path.join(DATA,'results',a.filename)));db.prepare('INSERT INTO uploads VALUES(?,?,?)').run(id,ext,MIME[ext]);const r=await execFileAsync(VIDEO_PYTHON,[path.join(ROOT,'render-video-edit.py'),'probe',file],{windowsHide:true,timeout:30000,maxBuffer:200000});send(res,201,{id,...JSON.parse(r.stdout),url:'/api/editor/media/'+id});return;
  }
  if(p==='/api/editor/upload'&&req.method==='POST'){
   const b=await body(req,200*1024*1024);let ext;if(b.subarray(4,8).toString()==='ftyp')ext='.mp4';else if(b.subarray(0,4).equals(Buffer.from([26,69,223,163])))ext='.webm';else throw Error('MP4, MOV 또는 WebM 영상을 선택하세요.');
   const id=randomUUID(),file=path.join(DATA,'uploads',id+ext);writeFileSync(file,b);try{const r=await execFileAsync(VIDEO_PYTHON,[path.join(ROOT,'render-video-edit.py'),'probe',file],{windowsHide:true,timeout:30000,maxBuffer:200000});const meta=JSON.parse(r.stdout);if(meta.kind!=='video')throw Error('영상 파일을 확인하세요.');db.prepare('INSERT INTO uploads VALUES(?,?,?)').run(id,ext,MIME[ext]);send(res,201,{id,...meta,url:'/api/editor/media/'+id});}catch{try{unlinkSync(file);}catch{}throw Error('재생 가능한 30분 이내의 영상인지 확인하세요.');}return;
  }
  if(/^\/api\/editor\/media\/[a-f0-9-]{36}$/.test(p)&&['GET','HEAD'].includes(req.method)){
   const u=db.prepare('SELECT * FROM uploads WHERE id=?').get(p.split('/')[4]);if(!u){send(res,404,{});return;}serveFile(req,res,path.join(DATA,'uploads',u.id+u.ext),u.mime,true);return;
  }
  if(p==='/api/content-tools'&&req.method==='GET'){send(res,200,contentTools.list());return;}
  if(p==='/api/content-tools/preview'&&req.method==='POST'){send(res,200,{html:contentTools.previewDraft(await json(req,150000))});return;}
  if(p==='/api/content-tools/library'&&req.method==='GET'){send(res,200,assetLibrary.list().assets.filter(a=>['image','video'].includes(a.kind)));return;}
  if(p.startsWith('/api/content-tools/media/')&&['GET','HEAD'].includes(req.method)){const id=p.split('/')[4];if(!/^[a-f0-9-]{36}$/.test(id)){send(res,404,{});return;}const used=contentTools.list().some(x=>contentTools.get(x.id).scenes.some(s=>s.media?.kind==='upload'&&s.media.id===id));if(!used){send(res,404,{});return;}const m=contentTools.media({kind:'upload',id});serveFile(req,res,m.file,MIME[path.extname(m.file)],true);return;}
  if(/^\/api\/content-tools\/[a-f0-9-]{36}(?:\/(?:render|preview|package))?$/.test(p)){const parts=p.split('/'),id=parts[3];let project=contentTools.get(id);
   if(req.method==='PUT'&&!parts[4]){send(res,200,contentTools.put(await json(req,150000),id));return;}
   if(!project){send(res,404,{error:'제작 문서를 찾을 수 없습니다.'});return;}
   if(req.method==='GET'&&!parts[4]){send(res,200,project);return;}
   if(req.method==='GET'&&parts[4]==='preview'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"sandbox; default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"});res.end(contentTools.preview(project));return;}
   if(req.method==='GET'&&parts[4]==='package'){send(res,200,contentTools.package(project));return;}
   if(req.method==='POST'&&parts[4]==='render'){send(res,202,publicJob(contentTools.enqueue(project,req.headers['idempotency-key'])));void contentTools.dispatch();return;}
  }
  if(p==='/api/card-news'&&req.method==='GET'){send(res,200,cardNews.list());return;}
  if(p.startsWith('/api/card-news/')){const parts=p.split('/'),id=parts[3],project=cardNews.get(id);
   if(req.method==='PUT'&&parts.length===4){send(res,200,cardNews.put(await json(req,65536),id));return;}
   if(!project)throw Error('카드뉴스 원본을 찾지 못했습니다.');
   if(req.method==='GET'&&parts.length===4){send(res,200,project);return;}
   if(req.method==='POST'&&parts[4]==='render'){send(res,202,publicJob(cardNews.enqueue(project,req.headers['idempotency-key'])));return;}
   if(req.method==='GET'&&parts[4]==='input'&&project.slides.some(s=>s.uploadId===parts[5])){const u=db.prepare('SELECT * FROM uploads WHERE id=?').get(parts[5]);if(!u)throw Error('사진을 찾지 못했습니다.');serveFile(req,res,path.join(DATA,'uploads',u.id+u.ext),u.mime,true);return;}
   throw Error('카드뉴스 요청 경로를 확인하세요.');
  }
  if(p==='/api/cloud/keys'&&req.method==='POST'){const x=await json(req,8192);send(res,200,await cloudStudio.setKey(x.provider,x.key));return;}
  if(p==='/api/voices'&&req.method==='GET'){send(res,200,await voices.catalog(u.searchParams.get('refresh')==='1'));return;}
  if(p==='/api/voices/render'&&req.method==='POST'){send(res,202,await voices.start(await json(req,12000),req.headers['idempotency-key']));return;}
  if(p.startsWith('/api/voices/status/')&&req.method==='GET'){send(res,200,voices.status(p.split('/').at(-1)));return;}
  if(p.startsWith('/api/voices/audio/')&&req.method==='GET'){serveFile(req,res,voices.asset(p.split('/').at(-1)),'audio/wav',true);return;}
  if(p==='/api/cloud/status'&&req.method==='GET'){send(res,200,await cloudStudio.status());return;}
  if(p==='/api/cloud/credits'&&req.method==='GET'){send(res,200,creditBalances.snapshot());return;}
  if(p==='/api/setup'&&req.method==='GET'){send(res,200,{pairCode:directLocal(req)?pairCode:undefined,remote:!directLocal(req),remoteReady:(req.headers.host||'').endsWith('.ts.net')});return;}
  if(p==='/api/presets'&&req.method==='GET'){send(res,200,presets.list());return;}
  if(p==='/api/presets'&&req.method==='POST'){send(res,201,presets.save(await json(req),req.headers['idempotency-key']));return;}
  if(/^\/api\/presets\/[a-f0-9-]{36}$/.test(p)&&req.method==='DELETE'){const removed=presets.remove(p.split('/')[3]);send(res,removed?200:404,removed?{ok:true}:{error:'저장한 설정을 찾을 수 없습니다.'});return;}
  if(p.startsWith('/api/presets/')&&['GET','HEAD'].includes(req.method)){
   const parts=p.split('/'),preset=presets.get(parts[3]);if(!preset){send(res,404,{error:'저장한 설정을 찾을 수 없습니다.'});return;}
   if(parts.length===4){send(res,200,preset);return;}
   const id=parts[5],upload=parts[4]==='images'&&parts.length===6&&preset.uploadIds.includes(id)?db.prepare('SELECT * FROM uploads WHERE id=?').get(id):null;if(!upload){send(res,404,{});return;}serveFile(req,res,path.join(DATA,'uploads',upload.id+upload.ext),upload.mime,true);return;
  }
  if(p==='/api/generation-stats'&&req.method==='GET'){const records=db.prepare('SELECT j.body,c.confirmed FROM jobs j LEFT JOIN cancellations c ON c.id=j.id').all().map(r=>({...JSON.parse(r.body),cancellationConfirmed:r.confirmed}));send(res,200,generationStats(records));return;}
  if(p==='/api/status'&&req.method==='GET'){try{send(res,200,await health());}catch{send(res,200,{online:false,message:'데스크톱 생성 프로그램 연결을 확인해 주세요.'});}return;}
  if(p==='/api/queue/order'&&req.method==='POST'){if(process.env.STUDIO_TEST_MODE!=='1'&&!workerQueueReady())throw Error('작업 순서 기능을 준비 중입니다. 잠시 후 다시 시도하세요.');const {ids}=await json(req);send(res,200,queueOrder.set(ids));return;}
  if(p==='/api/maintenance'&&req.method==='GET'){send(res,200,maintenance.list());return;}
  if(p==='/api/push/key'&&req.method==='GET'){send(res,200,{publicKey:push.publicKey});return;}
  if(p==='/api/push/subscribe'&&req.method==='POST'){push.subscribe(await json(req,8192));send(res,201,{ok:true});return;}
  if(p==='/api/push/read'&&req.method==='POST'){const x=await json(req,8192);push.read(x.endpoint,x.kind);send(res,200,{ok:true});return;}
  if(p==='/api/notifications'&&req.method==='GET'){send(res,200,push.events());return;}
  if(p==='/api/chat/models'&&req.method==='GET'){const tags=await request(OLLAMA,'/api/tags').catch(()=>({models:[]}));const cloud=await cloudStudio.status();send(res,200,[...CHAT_MODELS.filter(id=>tags.models?.some(m=>m.name===id)).map(id=>({id,label:id==='qwen3.5:9b'?'Qwen 3.5 · 9B':'GPT-OSS · 20B',vision:id==='qwen3.5:9b'})),...cloud.models.filter(m=>m.modes.includes('llm-chat'))]);return;}
  if(p.startsWith('/api/job-inputs/')&&['GET','HEAD'].includes(req.method)){
   const id=p.slice('/api/job-inputs/'.length);if(!/^[a-f0-9-]{36}$/.test(id)){send(res,404,{});return;}const u=db.prepare('SELECT * FROM uploads WHERE id=?').get(id),attached=db.prepare("SELECT 1 FROM jobs WHERE json_extract(body,'$.uploadId')=? AND json_extract(body,'$.deletedAt') IS NULL AND json_extract(body,'$.mode') IN ('image-video','image-image','image-text') LIMIT 1").get(id);if(!u||!attached){send(res,404,{});return;}if(new URL(req.url,'http://local').searchParams.get('original')==='1'){serveFile(req,res,path.join(DATA,'uploads',u.id+u.ext),u.mime,true);return;}const file=await thumbnailFile({filename:u.id+u.ext},'uploads');serveFile(req,res,file,'image/jpeg',true);return;
  }
  if(p.startsWith('/api/chat-images/')&&['GET','HEAD'].includes(req.method)){chats.prune();const id=p.slice('/api/chat-images/'.length),u=db.prepare('SELECT * FROM uploads WHERE id=?').get(id);if(!u||!db.prepare("SELECT 1 FROM chats,json_each(chats.body) WHERE json_extract(json_each.value,'$.uploadId')=? LIMIT 1").get(id)){send(res,404,{error:'채팅 이미지를 찾을 수 없습니다.'});return;}serveFile(req,res,path.join(DATA,'uploads',u.id+u.ext),u.mime,true);return;}
  if(p==='/api/chats'&&req.method==='GET'){chats.prune();send(res,200,chats.list());return;}
  if(p==='/api/chats'&&req.method==='POST'){const x=await json(req);if(/^(openai|gemini|xai|anthropic):chat$/.test(x.model)){if(!(await cloudStudio.caps()).models.some(m=>m.id===x.model&&m.connected))throw Error('API 연결을 확인하세요.');}else{if(!CHAT_MODELS.includes(x.model))throw Error('채팅 모델을 선택하세요.');const tags=await request(OLLAMA,'/api/tags');if(!tags.models?.some(m=>m.name===x.model))throw Error('설치된 모델을 확인해 주세요.');}if(chats.list().length>=100)throw Error('채팅이 100개입니다. 이전 채팅을 정리하세요.');send(res,201,chats.create(x.model));return;}
  if(p.startsWith('/api/chats/')){
   chats.prune();const id=p.slice('/api/chats/'.length).split('/')[0],c=chats.get(id);if(!c)throw Error('채팅을 찾을 수 없습니다. 5일 동안 열지 않은 채팅은 자동 삭제됩니다.');
   const activeJob=jobs().find(j=>j.chatId===id&&!['complete','blocked','cancelled'].includes(j.state));
   if(req.method==='GET'&&!p.endsWith('/messages')){const pending=jobs().find(j=>j.chatId===id);send(res,200,{...chats.get(id,u.searchParams.get('view')==='1'),pending:pending?{id:pending.id,state:pending.state,message:pending.message,partial:pending.partial,model:pending.model,chatLane:pending.chatLane}:null});return;}
   if(req.method==='DELETE'){if(activeJob)throw Error('답변이 끝난 후 삭제하세요.');chats.remove(id);send(res,200,{ok:true});return;}
   if(req.method==='PATCH'){const x=await json(req);if(typeof x.title!=='string'||!x.title.trim()||x.title.length>100)throw Error('채팅 이름은 1~100자로 입력하세요.');c.title=x.title.trim();chats.put(c,true);send(res,200,{ok:true});return;}
   if(req.method==='POST'&&p.endsWith('/messages')){
    const x=await json(req),key=req.headers['idempotency-key'];if(!/^[a-f0-9-]{36}$/.test(key||''))throw Error('요청 번호가 필요합니다.');const old=getJob(key);if(old){if(old.chatId!==id)throw Error('요청 번호가 중복되었습니다.');send(res,200,{id:old.id,state:old.state});return;}
    if(activeJob)throw Error('이 채팅의 앞선 답변을 기다려 주세요.');if(jobs().filter(j=>j.mode==='llm-chat'&&j.state==='queued').length>=100)throw Error('앞선 작업이 끝난 뒤 전송하세요.');
    const cloudChat=/^(openai|gemini|xai|anthropic):chat$/.test(x.model);if(cloudChat&&!(await cloudStudio.caps()).models.some(m=>m.id===x.model&&m.connected))throw Error('API 연결을 확인하세요.');
    if((!cloudChat&&!CHAT_MODELS.includes(x.model))||typeof x.content!=='string'||!x.content.trim()||x.content.length>8000)throw Error('모델과 메시지 길이를 확인해 주세요.');
    if(x.uploadId&&!db.prepare('SELECT 1 FROM uploads WHERE id=?').get(x.uploadId))throw Error('이미지를 다시 첨부하세요.');
    if(!cloudChat&&x.model!=='qwen3.5:9b'&&(x.uploadId||c.messages.slice(-16).some(m=>m.uploadId)))throw Error('이미지가 포함된 대화는 Qwen 모델을 사용하세요. GPT-OSS는 새 텍스트 채팅에서 사용할 수 있습니다.');
    if(c.messages.length>=100)throw Error('이 채팅은 100개 메시지에 도달했습니다. 새 채팅을 시작하세요.');
    db.exec('BEGIN IMMEDIATE');try{c.model=x.model;c.messages.push({id:randomUUID(),jobId:key,role:'user',content:x.content.trim(),uploadId:x.uploadId||null,created:Date.now()});if(c.title==='새 채팅')c.title=x.content.trim().slice(0,40);chats.put(c,true);const j=save({id:key,created:Date.now(),state:'queued',mode:'llm-chat',chatLane:cloudChat?'cloud':'cpu',...(cloudChat?{executionLane:'cloud',provider:x.model.split(':')[0]}:{}),chatId:id,model:x.model,prompt:'채팅 답변',message:'채팅 답변을 준비하고 있습니다.'});db.exec('COMMIT');send(res,202,{id:j.id,state:j.state});}catch(e){db.exec('ROLLBACK');throw e;}if(API_ONLY)void cpuChat.dispatch();return;
   }
  }
  if(p==='/api/control/prepare'&&req.method==='POST'){
   let {action,jobId}=await json(req);const single=action==='stop-one';if(single){const j=getJob(jobId);if(j?.state==='complete'&&j.voiceAudioId&&!j.voiceApplied){const token=randomBytes(24).toString('hex');controlPlans.set(token,{action:'voice-remove',jobId,session:sha(req.headers.cookie||''),expires:Date.now()+60000});send(res,200,{token,action:'stop',title:'목소리 적용을 취소할까요?',description:'영상 생성은 반복하지 않고 원본 영상을 그대로 보관합니다.'});return;}}if(single){if(typeof jobId!=='string')throw Error('작업 번호가 필요합니다.');action='stop';}if(!['stop','reset','web-reset'].includes(action))throw Error('지원하지 않는 동작입니다.');
   let target=null,targets=[],queued=[];if(action==='stop'){queued=jobs().filter(j=>j.state==='queued'&&(!single||j.id===jobId));targets=jobs().filter(j=>(!single||j.id===jobId)&&['running','submitting','cleaning','releasing','blocked'].includes(j.state)&&!db.prepare('SELECT 1 FROM cancellations WHERE id=? AND confirmed IS NOT NULL').get(j.id));target=targets[0]||null;if(!queued.length&&!target)throw Error('취소할 앱 작업이 없습니다.');}
   if(action==='web-reset')await webResetTarget();
   const resetTarget=action==='reset'?(process.env.STUDIO_TEST_MODE==='1'?{pid:0,ids:[],owner:'',affected:[]}:await maintenance.snapshot()):null;
   for(const [k,v]of controlPlans)if(v.expires<Date.now())controlPlans.delete(k);if(controlPlans.size>100)throw Error('잠시 후 다시 시도해 주세요.');
   const token=randomBytes(24).toString('hex'),plan={action,resetTarget,activeIds:targets.map(j=>j.id),hasEngineTarget:targets.some(j=>!!j.promptId),queuedIds:queued.map(j=>j.id),jobId:target?.id||(single?queued[0]?.id:undefined),promptId:target?.promptId,session:sha(req.headers.cookie||''),expires:Date.now()+60000};controlPlans.set(token,plan);
   send(res,200,{token,action,title:action==='stop'?(single?'이 작업을 중단할까요?':'앱 작업을 모두 취소할까요?'):action==='web-reset'?'웹앱 서버를 다시 시작할까요?':'생성 엔진을 다시 시작할까요?',description:action==='stop'?`대기 작업 ${queued.length}개를 즉시 취소합니다.\n대상: ${queued.map(j=>j.id).join(', ')||'없음'}\n실행 작업: ${targets.map(j=>j.id).join(', ')||'없음'}\n대기 작업은 자동 재실행하지 않습니다. 실행 작업은 엔진의 중단 지점에서 멈추며 GPU 잠금은 확인 전까지 보존합니다. n8n A/B 작업은 취소하지 않습니다.`:action==='web-reset'?'웹 화면 연결이 잠시 끊긴 후 자동 복구됩니다. ComfyUI와 생성 작업은 유지됩니다.':'엔진이 꺼져 있거나 응답하지 않아도 같은 설치와 실행 설정으로 다시 시작합니다. 기존 실행 작업은 종료되며 저장된 결과와 앱 대기 작업은 유지합니다. 새 엔진의 API 응답을 확인한 뒤 알립니다.' });return;
  }
  if(p==='/api/control/execute'&&req.method==='POST'){
   const {token}=await json(req);const plan=controlPlans.get(token);if(!plan||plan.session!==sha(req.headers.cookie||'')||plan.expires<Date.now())throw Error('확인 시간이 지났습니다. 버튼을 다시 눌러 주세요.');controlPlans.delete(token);
   if(process.env.STUDIO_TEST_MODE==='1'&&(plan.action==='reset'||plan.hasEngineTarget))throw Error('테스트 서버에서는 실제 제어를 실행하지 않습니다.');
   if(plan.action==='voice-remove'){const j=getJob(plan.jobId);if(j?.state==='complete'&&j.voiceAudioId&&!j.voiceApplied){delete j.voiceAudioId;delete j.voiceStatus;j.message='목소리 적용을 해제했습니다. 원본 영상은 보관했습니다.';save(j);}send(res,200,{ok:true});return;}
   if(plan.action==='web-reset'){if(process.env.STUDIO_TEST_MODE==='1')throw Error('테스트 서버에서는 실제 제어를 실행하지 않습니다.');await webResetTarget();if(cpuChat.isBusy())throw Error('CPU 작업이 진행 중입니다.');webResetting=true;const resetEvent={id:randomUUID(),state:'running',pid:process.pid,created:Date.now()};db.prepare('INSERT INTO web_resets VALUES(?,?)').run(resetEvent.id,JSON.stringify(resetEvent));res.once('finish',()=>setTimeout(()=>process.exit(0),250));send(res,202,{ok:true,message:'웹앱 서버를 다시 시작합니다. 잠시 후 자동 연결됩니다.'});return;}
   if(plan.action==='stop'){
    let count=0;db.exec('BEGIN IMMEDIATE');try{for(const id of plan.queuedIds||[]){const j=getJob(id);if(j?.state==='queued'){j.state='cancelled';j.completedAt=Date.now();j.message='사용자가 작업중단으로 취소했습니다.';save(j);count++;}}db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    let note='';for(const id of plan.activeIds||[]){const j=getJob(id);if(j&&['running','submitting','cleaning','releasing','blocked'].includes(j.state)){registerCancellation(j,'사용자 작업중단');if(isCloudJob(j)||j.executionLane==='design'||canCancelLocally(j)){j.state='cancelled';j.completedAt=Date.now();j.message='사용자가 오류 작업을 취소했습니다.';save(j);db.prepare('UPDATE cancellations SET confirmed=? WHERE id=?').run(Date.now(),j.id);count++;continue;}try{const stopped=await stopOwned(j);note=stopped?' 실행 작업 중단도 확인했습니다.':' 실행 작업의 중단을 요청했으며 확인 중입니다.';}catch{note=' 실행 작업의 중단 요청을 저장했습니다. 엔진 응답이 돌아오면 재시도합니다.';}}}
    send(res,200,{ok:true,cancelled:count,message:`대기 작업 ${count}개를 즉시 취소했습니다.`+note});return;
   }
   const event=await maintenance.start(plan.resetTarget);send(res,202,{ok:true,id:event.id,message:event.message});return;
  }
  if(p==='/api/memory/free'&&req.method==='POST'){
   const existing=jobs().find(j=>j.mode==='memory-clean'&&!['complete','blocked','cancelled'].includes(j.state));if(existing){send(res,202,{ok:true,id:existing.id});return;}
   if(jobs().some(j=>j.state==='blocked'&&!isCpuChat(j)))throw Error('확인이 필요한 작업이 있어 비우기를 보류합니다. 진행 화면을 확인해 주세요.');
   let j;db.exec('BEGIN IMMEDIATE');try{j=save({id:randomUUID(),created:Date.now(),mode:'memory-clean',state:'queued',prompt:'VRAM 비우기',message:'앞선 작업이 끝나면 공용 GPU 잠금을 확보해 비웁니다.'});if(API_ONLY&&!isCloudJob(j)&&!workerReady())db.prepare("UPDATE jobs SET state='upgrade_wait' WHERE id=?").run(j.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}send(res,202,{ok:true,id:j.id});void dispatch();return;
  }
  if(/^\/api\/jobs\/[^/]+\/retry$/.test(p)&&req.method==='POST'){const source=getJob(p.split('/')[3]);if(source?.state==='complete'&&source.voiceAudioId&&source.voiceStatus==='failed'){voices.validate(source.voiceAudioId,source.duration);source.voiceStatus='pending';source.message='저장한 음성을 다시 적용합니다. 영상을 다시 생성하지 않습니다.';save(source);send(res,202,publicJob(source));void voices.sync();return;}if(source?.executionLane==='content'){if(source.state!=='blocked')throw Error('오류가 난 제작 작업을 선택하세요.');send(res,202,publicJob(contentTools.enqueue(source.contentSnapshot,req.headers['idempotency-key'])));void contentTools.dispatch();return;}if(isCloudJob(source||{})){if(source.state!=='blocked')throw Error('확인이 필요한 클라우드 작업을 선택하세요.');if(!/^[a-f0-9-]{36}$/.test(req.headers['idempotency-key']||''))throw Error('요청 번호가 필요합니다.');source.state='queued';source.message=source.cloudSubmitted?'기존 클라우드 접수·결과를 다시 조회합니다. 새로 생성하지 않습니다.':'클라우드 연결을 다시 확인합니다.';save(source);send(res,202,publicJob(source));return;}const result=await retryJob(p.split('/')[3],req.headers['idempotency-key']);send(res,202,publicJob(result));void dispatch();return;}
  if(p==='/api/jobs'&&req.method==='GET'){send(res,200,jobs().filter(j=>j.mode!=='llm-chat').map(publicJob));return;}
  if(p==='/api/refinement-models'&&req.method==='GET'){send(res,200,await refinements.models());return;}
  if(p==='/api/refinements'&&req.method==='POST'){
   const x=await json(req),cloud=/^(openai|gemini|xai|anthropic):/.test(x.model||''),v=cloud?cloudInput(x,(await cloudStudio.caps()).models):validateInput(x),key=req.headers['idempotency-key'];
   if(!['text-image','image-image','text-video','image-video'].includes(v.mode))throw Error('이미지 또는 영상 모드를 선택하세요.');
   if(!cloud&&!(await modelCatalog()).some(m=>m.id===v.model&&m.modes.includes(v.mode)))throw Error('현재 설치된 호환 모델을 선택해 주세요.');
   send(res,200,publicJob(await refinements.refine(v,{key,refinementModel:x.refinementModel,refinementAttempt:x.refinementAttempt})));return;
  }
  if(p==='/api/runtime'&&req.method==='GET'){const g=imageGraph({mode:'text-image',model:'z_image_turbo_bf16.safetensors',prompt:'',resolution:'512x288',aspect:'16:9',guidance:1,seed:1},'runtime');send(res,200,{worker:!API_ONLY,promptReviewVersion:1,zImageTextDevice:g.clip.inputs.device,zImageCFG:g.sample.inputs.cfg});return;}
  if(p==='/api/models'&&req.method==='GET'){const local=await modelCatalog().catch(()=>[]),cloud=await cloudStudio.status();send(res,200,[...local,...cloud.models.filter(m=>m.modes.some(mode=>mode!=='llm-chat'))]);return;}
  if(p.startsWith('/api/gallery/draft/')&&req.method==='GET'){
   const j=getJob(p.slice('/api/gallery/draft/'.length));
   if(!j||j.state!=='complete'||j.deletedAt||j.purgedAt){send(res,404,{error:'완료된 작업을 찾을 수 없습니다.'});return;}
   const draft=j.contentSnapshot||j.cardSnapshot;
   if(!draft){send(res,404,{error:'이전 작업의 편집 원본이 없습니다. 원본 편집에서 확인해 주세요.'});return;}
   send(res,200,draft);return;
  }
  if(p==='/api/gallery/video-draft'&&req.method==='POST'){

   const {id}=await json(req);if(typeof id!=='string')throw Error('완료된 이미지를 선택하세요.');const j=getJob(id),asset=j?.assets?.find(a=>a.kind==='image');if(!j||j.state!=='complete'||j.deletedAt||!asset)throw Error('완료된 이미지를 선택하세요.');const model=(await modelCatalog()).find(m=>m.modes.includes('image-video'));if(!model)throw Error('설치된 영상 모델을 찾지 못했습니다.');const ext=path.extname(asset.filename),uploadId=randomUUID(),b=readFileSync(path.join(DATA,'results',asset.filename));if(!mediaValid(b,ext))throw Error('이미지 형식을 확인하세요.');writeFileSync(path.join(DATA,'uploads',uploadId+ext),b);db.prepare('INSERT INTO uploads VALUES(?,?,?)').run(uploadId,ext,MIME[ext]);send(res,200,{...publicJob(j),mode:'image-video',model:model.id,uploadId});return;
  }
  if(p==='/api/gallery/order'&&req.method==='POST'){
   const {ids}=await json(req);if(!Array.isArray(ids)||!ids.length||ids.length>200||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'))throw Error('결과 순서를 확인하세요.');const ranks=new Map(db.prepare('SELECT * FROM gallery_order').all().map(r=>[r.id,r.position])),all=jobs().filter(j=>j.state==='complete'&&!j.deletedAt&&!j.refineOnly&&j.mode!=='memory-clean').sort((a,b)=>(ranks.get(a.id)??-1)-(ranks.get(b.id)??-1)||b.created-a.created).map(j=>j.id);if(ids.some(id=>!all.includes(id)))throw Error('완료된 결과만 이동할 수 있습니다.');const selected=new Set(ids);let index=0;const ordered=all.map(id=>selected.has(id)?ids[index++]:id);db.exec('BEGIN IMMEDIATE');try{const put=db.prepare('INSERT INTO gallery_order VALUES(?,?) ON CONFLICT(id) DO UPDATE SET position=excluded.position');ordered.forEach((id,i)=>put.run(id,i));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}send(res,200,{ok:true});return;
  }
  if(p==='/api/gallery/favorite'&&req.method==='POST'){
   const x=await json(req);if(typeof x.id!=='string'||typeof x.favorite!=='boolean')throw Error('즐겨찾기 설정을 확인해 주세요.');const j=getJob(x.id);if(!j||j.state!=='complete'||j.deletedAt)throw Error('완료된 결과만 즐겨찾기에 추가할 수 있습니다.');if(!j.completedAt)j.completedAt=j.updated;j.favorite=x.favorite;save(j);send(res,200,{ok:true,favorite:j.favorite});return;
  }
  if(p==='/api/gallery/purge/prepare'&&req.method==='POST'){const {ids}=await json(req);for(const [key,plan]of purgePlans)if(plan.expires<Date.now())purgePlans.delete(key);if(purgePlans.size>=100)throw Error('잠시 후 다시 시도해 주세요.');const plan=trashPurge.prepare(ids),token=randomBytes(24).toString('hex');purgePlans.set(token,{...plan,expires:Date.now()+60000,session:sha(req.headers.cookie||'')});send(res,200,{token,count:ids.length});return;}
  if(p==='/api/gallery/purge/execute'&&req.method==='POST'){const {token}=await json(req),plan=purgePlans.get(token);if(!plan||plan.expires<Date.now()||plan.session!==sha(req.headers.cookie||''))throw Error('삭제 확인 시간이 지났습니다. 다시 선택해 주세요.');purgePlans.delete(token);send(res,200,trashPurge.execute(plan));return;}
  if(['/api/gallery/delete','/api/gallery/restore'].includes(p)&&req.method==='POST'){
   const x=await json(req),ids=x.ids;if(!Array.isArray(ids)||!ids.length||ids.length>100||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id)))throw Error('선택한 결과를 확인해 주세요.');
   const selected=ids.map(getJob);if(selected.some(j=>!j||j.state!=='complete'||j.purgedAt))throw Error('완료된 결과만 이동할 수 있습니다.');
   db.exec('BEGIN IMMEDIATE');try{for(const j of selected){if(!j.completedAt)j.completedAt=j.updated;if(p.endsWith('/delete'))j.deletedAt=Date.now();else delete j.deletedAt;save(j);}db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}send(res,200,{ok:true,count:ids.length});return;
  }
  if(p.startsWith('/api/reconcile/')&&req.method==='POST'){
   if(!directLocal(req)){send(res,403,{error:'데스크톱에서만 완료 작업을 확인할 수 있습니다.'});return;}
   const j=getJob(p.slice('/api/reconcile/'.length));if(!j||j.state!=='blocked'||!j.owner)throw Error('복구할 작업 소유권이 없습니다.');
   if(j.mode==='image-text'){if(!j.result||(await request(OLLAMA,'/api/ps')).models.length)throw Error('분석 완료와 모델 언로드를 먼저 확인해야 합니다.');}
   else{if(!j.promptId||!j.submissionIntent)throw Error('기존 생성 번호가 필요합니다. 재제출하지 않습니다.');for(const a of j.assets||[]){const b=readFileSync(path.join(DATA,'results',a.filename));if(b.length!==a.bytes||sha(b)!==a.sha256)throw Error('저장 결과가 바뀌었습니다.');}}
   j.recoveryRequested=true;save(j);send(res,202,{ok:true});void dispatch();return;
  }
  if(p==='/api/jobs'&&req.method==='POST'){
   let x=await json(req);let reused;
   const requestKey=req.headers['idempotency-key'];
   if(!/^[a-f0-9-]{36}$/.test(requestKey||''))throw Error('요청 번호가 필요합니다.');
   const previous=getJob(requestKey);if(previous){const group=previous.batchId?db.prepare("SELECT body FROM jobs WHERE json_extract(body,'$.batchId')=? ORDER BY created").all(previous.batchId).map(r=>publicJob(JSON.parse(r.body))):null;send(res,200,group?{jobs:group}:publicJob(previous));return;}
   const batch=x.uploadIds!==undefined;
   if(batch){if(!['image-image','image-video'].includes(x.mode)||!Array.isArray(x.uploadIds)||!x.uploadIds.length||x.uploadIds.length>50||new Set(x.uploadIds).size!==x.uploadIds.length||x.uploadIds.some(id=>typeof id!=='string'||!db.prepare('SELECT 1 FROM uploads WHERE id=?').get(id)))throw Error('첨부할 사진을 1~50장 선택해 주세요.');if(x.recreateId||x.refineOnly)throw Error('일괄 생성 요청을 확인해 주세요.');x.uploadId=x.uploadIds[0];}

   if(x.recreateId){
    const key=req.headers['idempotency-key'];if(!/^[a-f0-9-]{36}$/.test(key||''))throw Error('요청 번호가 필요합니다.');const prior=getJob(key);if(prior){send(res,200,publicJob(prior));return;}
    const source=getJob(x.recreateId);if(!source||source.state!=='complete'||source.deletedAt||!source.assets?.length)throw Error('완료된 결과를 확인하세요.');
    const convert=x.imageToVideo===true,randomizeSeed=x.randomizeSeed===true;reused=source;x={...source,refineOnly:false,enhance:false};if(randomizeSeed&&!convert){const seed=randomInt(0,2147483647);x.seed=seed>=Number(source.seed)?seed+1:seed;}
    if(convert){const asset=source.assets.find(a=>a.kind==='image'),model=(await modelCatalog()).find(m=>m.modes.includes('image-video'));if(!asset||!model)throw Error('원본 이미지와 설치된 영상 모델을 확인하세요.');const ext=path.extname(asset.filename),id=randomUUID(),b=readFileSync(path.join(DATA,'results',asset.filename));if(!mediaValid(b,ext))throw Error('이미지 형식 확인 실패');writeFileSync(path.join(DATA,'uploads',id+ext),b);db.prepare('INSERT INTO uploads VALUES(?,?,?)').run(id,ext,MIME[ext]);Object.assign(x,{mode:'image-video',model:model.id,uploadId:id});}
   }
   const cloudModel=/^(openai|gemini|xai|anthropic):/.test(x.model||'');const v=cloudModel?cloudInput(x,(await cloudStudio.caps()).models):validateInput(x);if(reused)Object.assign(v,{originalPrompt:reused.originalPrompt,originalNegative:reused.originalNegative,refinedAt:reused.refinedAt,recreatedFrom:reused.id});v.refineOnly=x.refineOnly===true;if(v.refineOnly){v.enhance=true;v.refinementAttempt=Number.isInteger(x.refinementAttempt)?Math.min(20,Math.max(0,x.refinementAttempt)):0;}if(x.refinementId){const r=getJob(x.refinementId);if(!r||!r.refineOnly||r.state!=='complete'||!r.refinedAt||r.mode!==v.mode||r.model!==v.model||r.prompt!==v.prompt||r.negative!==v.negative)throw Error('보정문을 다시 선택해 주세요.');Object.assign(v,{enhance:false,originalPrompt:r.originalPrompt,originalNegative:r.originalNegative,refinedAt:r.refinedAt,refinementModel:r.refinementModel,refinementModelLabel:r.refinementModelLabel});}if(x.editorSourceId){const r=getJob(x.editorSourceId);if(!r||r.state!=='complete'||r.deletedAt)throw Error('원본 작업을 찾을 수 없습니다.');if(typeof x.originalPrompt!=='string'||x.originalPrompt.length>3000||typeof x.originalNegative!=='string'||x.originalNegative.length>1000)throw Error('원문 길이를 확인해 주세요.');Object.assign(v,{enhance:false,originalPrompt:x.originalPrompt,originalNegative:x.originalNegative,refinedAt:Date.now(),recreatedFrom:r.id,refinementModel:r.refinementModel,refinementModelLabel:r.refinementModelLabel});}if(x.presetId){if(!presets.get(x.presetId))throw Error('저장한 설정을 찾을 수 없습니다.');if(typeof x.originalPrompt!=='string'||x.originalPrompt.length>3000||typeof x.originalNegative!=='string'||x.originalNegative.length>1000)throw Error('원문 길이를 확인하세요.');Object.assign(v,{enhance:false,originalPrompt:x.originalPrompt,originalNegative:x.originalNegative,refinedAt:Date.now()});}if(v.uploadId&&!db.prepare("SELECT 1 FROM uploads WHERE id=? AND mime LIKE 'image/%'").get(v.uploadId))throw Error('사진을 다시 선택해 주세요.');if(x.voiceAudioId){if(!v.mode.endsWith('video'))throw Error('목소리는 영상 제작에 적용할 수 있습니다.');v.voiceAudioId=voices.validate(x.voiceAudioId,v.duration);}
   v.generationEditor=generationEditorSnapshot(x.generationEditor);
   if(!cloudModel&&v.mode!=='image-text'&&!(await modelCatalog()).some(m=>m.id===v.model&&m.modes.includes(v.mode)))throw Error('현재 설치된 호환 모델을 선택해 주세요.');
   if(db.prepare("SELECT count(*) AS n FROM jobs WHERE state IN ('queued','upgrade_wait')").get().n+(batch?x.uploadIds.length:1)>500){send(res,429,{error:'대기열은 최대 500개까지 등록할 수 있습니다. 완료 후 다시 시도해 주세요.'});return;}
   const key=req.headers['idempotency-key'];if(!/^[a-f0-9-]{36}$/.test(key||''))throw Error('요청 번호가 필요합니다.');const old=getJob(key);if(old){send(res,200,publicJob(old));return;}
   const uploads=batch?x.uploadIds:[v.uploadId],created=Date.now(),accepted=[];db.exec('BEGIN IMMEDIATE');try{for(const [index,upload]of uploads.entries()){const j=save({...v,uploadId:upload,id:index===0?key:randomUUID(),...(batch?{batchId:key,batchIndex:index,batchCount:uploads.length}:{}),created:created+index,state:'queued',message:batch?`일괄 생성 ${index+1}/${uploads.length} · 차례를 기다리고 있어요.`:'차례를 기다리고 있어요. 기존 자동 작업이 먼저 진행될 수 있습니다.'});accepted.push(j);if(API_ONLY&&!isCloudJob(j)&&!workerReady())db.prepare("UPDATE jobs SET state='upgrade_wait' WHERE id=?").run(j.id);}db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}send(res,202,batch?{jobs:accepted.map(publicJob)}:publicJob(accepted[0]));void dispatch();return;
  }
  if(p==='/api/uploads'&&req.method==='POST'){
   const b=await body(req,20*1024*1024);let ext,mime;if(png(b)){ext='.png';mime='image/png';const w=b.readUInt32BE(16),h=b.readUInt32BE(20);if(w*h>40000000)throw Error('사진 크기가 너무 큽니다.');}else if(b[0]===255&&b[1]===216){ext='.jpg';mime='image/jpeg';}else if(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'){ext='.webp';mime='image/webp';}else throw Error('JPG, PNG 또는 WebP 사진을 선택해 주세요. iPhone의 HEIC 사진은 JPEG로 바꿔 주세요.');
   const id=randomUUID();writeFileSync(path.join(DATA,'uploads',id+ext),b);db.prepare('INSERT INTO uploads VALUES(?,?,?)').run(id,ext,mime);send(res,201,{id});return;
  }
  if(p.startsWith('/api/thumbnails/')&&['GET','HEAD'].includes(req.method)){
   const filename=p.slice('/api/thumbnails/'.length).replace(/\.jpg$/,'');if(!/^[a-f0-9-]{36}-\d+\.(png|jpg|jpeg|webp|mp4|webm)$/.test(filename)){send(res,404,{});return;}const j=getJob(filename.slice(0,36)),asset=j?.assets?.find(a=>a.filename===filename);if(!j||!asset||db.prepare('SELECT 1 FROM cancellations WHERE id=?').get(j.id)){send(res,404,{});return;}const video=/\.(mp4|webm)$/.test(filename),file=video?await thumbnailFile(asset):path.join(DATA,'results',filename);serveFile(req,res,file,video?'image/jpeg':MIME[path.extname(filename)],true);return;
  }
  if(p.startsWith('/api/results/')&&['GET','HEAD'].includes(req.method)){
   const f=p.slice(13);if(!/^[a-f0-9-]{36}-\d+\.(png|jpg|jpeg|webp|mp4|webm|txt|html|json|srt)$/.test(f)){send(res,404,{});return;}const resultJob=getJob(f.slice(0,36));if(!resultJob||resultJob.deletedAt||db.prepare('SELECT 1 FROM cancellations WHERE id=? AND confirmed IS NOT NULL').get(resultJob.id)||!resultJob.assets?.some(a=>a.filename===f)){send(res,404,{});return;}if(/\.(html|txt|json|srt)$/.test(f)){res.setHeader('Content-Security-Policy',"sandbox; default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'");res.setHeader('Content-Disposition','attachment; filename="'+f+'"');}serveFile(req,res,path.join(DATA,'results',f),MIME[path.extname(f)]||({'.srt':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8','.json':'application/json'})[path.extname(f)],true);return;
  }
  send(res,404,{error:'요청을 찾지 못했습니다.'});return;
 }
 if(!['GET','HEAD'].includes(req.method)){send(res,405,{});return;}
 const files={'/asset-manager.js':'asset-manager.js','/asset-manager.css':'asset-manager.css','/media-editor.js':'media-editor.js','/media-editor.css':'media-editor.css','/voice-options.js':'voice-options.js','/':'index.html','/edge-refresh.js':'edge-refresh.js','/app.js':'app.js','/credit-balances.js':'credit-balances.js','/result-copy.js':'result-copy.js','/engine-status.js':'engine-status.js','/chat.js':'chat.js','/content-tools.css':'content-tools.css','/content-tools.js':'content-tools.js','/card-news.js':'card-news.js','/notifications.js':'notifications.js','/icons.js':'icons.js','/dictation.js':'dictation.js','/video-controls.js':'video-controls.js','/image-viewer.js':'image-viewer.js','/gallery-reorder.js':'gallery-reorder.js','/style.css':'style.css','/sw.js':'sw.js','/manifest.webmanifest':'manifest.webmanifest','/icon.svg':'icon.svg','/icon-192.png':'icon-192.png','/icon-512.png':'icon-512.png'};
 if(!files[p]){send(res,404,{});return;}serveFile(req,res,path.join(ROOT,'public',files[p]),MIME[path.extname(files[p])]);
}catch(e){if(!res.headersSent)send(res,400,{error:e.message||'요청을 처리하지 못했습니다.'});else res.end();}});
const internal=http.createServer(async(req,res)=>{try{
 if(!/^(host\.docker\.internal|127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host||'')){send(res,403,{});return;}
 if(req.headers.origin){send(res,403,{});return;}
 if(!gate){send(res,409,{error:'No authorized pending dispatch'});return;}
 if(req.url==='/next'&&req.method==='GET'&&!gate.started&&Date.now()<gate.expires){send(res,200,{id:gate.id,owner:gate.recovery?getJob(gate.id).owner:undefined});return;}
 const x=await json(req,4096);if(x.jobId!==gate.id||!/^\d+$/.test(String(x.owner||''))){send(res,409,{error:'Dispatch mismatch'});return;}
 const j=getJob(gate.id);
 if(req.url==='/reconcile'&&req.method==='POST'&&gate.recovery&&!gate.started&&j.state==='blocked'&&j.owner===String(x.owner)&&Date.now()<gate.expires){
  gate.started=true;gate.owner=j.owner;
  try{if(db.prepare('SELECT 1 FROM cancellations WHERE id=?').get(j.id)){await ensureIdle();if((await request(OLLAMA,'/api/ps')).models?.length)throw Error('중단 후 LLM 사용 확인이 필요합니다.');if(j.promptId&&!await stopOwned(j))throw Error('실제 중단 확인이 필요합니다.');await cleanComfy(j);db.prepare('UPDATE cancellations SET confirmed=? WHERE id=?').run(Date.now(),j.id);j.cancelled=true;}else if(canRecoverUnsubmittedJob({...j,recoveryAttempts:0,lastRecoveryAt:0})){ await ensureIdle();if((await request(OLLAMA,'/api/ps')).models?.length)throw Error('다른 LLM 사용이 끝나기를 기다립니다.');await cleanComfy(j);j.retryAfterCleanup=true;}else if(j.mode==='image-text'){await ensureIdle();if(!j.result||(await request(OLLAMA,'/api/ps')).models.length)throw Error('LLM completion not proven');j.cleanup={verified:true,ollamaUnloaded:true};}else{j.state='running';j.message='기존 생성 번호로 결과를 다시 확인하고 있어요. 재생성하지 않습니다.';save(j);await finishExisting(j);}j.state='releasing';j.message='완료된 결과와 정리를 다시 확인했어요.';save(j);send(res,200,{jobId:j.id,owner:j.owner,releaseSafe:true});}
  catch(e){j.state='blocked';j.message=e.message;save(j);send(res,409,{error:e.message,releaseSafe:false});}return;
 }
 if(req.url==='/run'&&req.method==='POST'&&!gate.started&&j.state==='queued'&&Date.now()<gate.expires){
  queueOrder.release(j.id);gate.started=true;gate.owner=String(x.owner);j.owner=gate.owner;j.startedAt=Date.now();j.state='running';j.message='GPU를 확보했어요.';save(j);
  try{await runJob(j);j.state='releasing';j.message='정리를 확인했어요. 작업을 마무리하고 있습니다.';save(j);send(res,200,{jobId:j.id,owner:j.owner,releaseSafe:true});}
  catch(e){j.state='blocked';j.message=e.message;save(j);send(res,409,{error:e.message,releaseSafe:false});}return;
 }
 if(req.url==='/released'&&req.method==='POST'&&j.state==='releasing'&&j.owner===String(x.owner)&&j.cleanup?.verified){gate.acknowledged=true;if(j.retryAfterCleanup){j.state='queued';j.message='GPU가 준비되어 같은 요청을 다시 대기합니다.';delete j.owner;delete j.startedAt;delete j.cleanup;delete j.retryAfterCleanup;delete j.llmIntent;save(j);send(res,200,{ok:true,requeued:true});return;}j.completedAt=Date.now();j.state=j.cancelled?'cancelled':'complete';if(j.cancelled)j.deletedAt=Date.now();j.message=j.mode==='memory-clean'?'VRAM 정리를 확인했어요.':'완성됐어요.';save(j);send(res,200,{ok:true});return;}
 send(res,409,{error:'Dispatch state mismatch'});
}catch(e){if(!res.headersSent)send(res,400,{error:e.message});}});
internal.requestTimeout=0;internal.timeout=0;
let listenersReady=0;
const engineWatch=createEngineWatch({active:()=>!!maintenance.active(),probe:async()=>{try{return !!(await request(COMFY,'/system_stats',undefined,2000))?.system;}catch{return false;}},inspect:()=>maintenance.processInfo(),recover:async()=>{const target=await maintenance.snapshot();await maintenance.start(target);}});

function ready(){if(++listenersReady===2){if(API_ONLY){assetLibrary.syncGenerated();setInterval(()=>{try{assetLibrary.syncGenerated();}catch{}},5000).unref();}if(API_ONLY){for(const row of db.prepare('SELECT body FROM web_resets').all()){const e=JSON.parse(row.body);if(e.state==='running'&&e.pid!==process.pid){e.state='complete';e.completed=Date.now();e.newPid=process.pid;db.prepare('UPDATE web_resets SET body=? WHERE id=?').run(JSON.stringify(e),e.id);}}}chats.prune();setInterval(()=>chats.prune(),3600000).unref();if(API_ONLY&&process.env.STUDIO_TEST_MODE!=='1'){setInterval(()=>void push.scan().catch(()=>{}),5000).unref();setInterval(()=>void engineWatch(),10000).unref();void maintenance.resume().catch(()=>{});void engineWatch();}if(!API_ONLY&&process.env.STUDIO_TEST_MODE!=='1'){writeFileSync(WORKER_MARKER,JSON.stringify({version:6,pid:process.pid,queueOrderVersion:1}));db.prepare("UPDATE jobs SET state='queued' WHERE state='upgrade_wait'").run();}if(API_ONLY&&process.env.STUDIO_TEST_MODE!=='1'){for(const j of jobs())if(j.executionLane==='content'&&j.state==='running'){j.state='blocked';j.message='제작기가 다시 시작되었습니다. 재시작을 누르면 저장된 원본으로 다시 제작합니다.';save(j);}for(const j of jobs())if(j.mode==='llm-chat'&&!isCpuChat(j)&&j.state==='queued'&&!j.owner&&!j.startedAt){j.chatLane='cpu';j.message='채팅 답변을 준비하고 있습니다.';save(j);}for(const j of jobs())if(isLocalCpuChat(j)&&j.state==='running'){j.state='blocked';j.message='채팅 연결이 다시 시작되었습니다. 답변을 다시 보내 주세요.';delete j.partial;save(j);}setInterval(()=>{if(!webResetting){void cpuChat.dispatch();void cloudStudio.dispatch();void cardNews.dispatch();void contentTools.dispatch();void voices.sync();void cloudStudio.sync();}},1000).unref();void cpuChat.dispatch();setInterval(()=>void enforceDeadlines(),10000).unref();void enforceDeadlines();}setInterval(()=>void dispatch(),5000).unref();void dispatch();}}
app.on('error',()=>{console.error('앱 포트를 사용할 수 없습니다. 중복 실행 여부를 확인하세요.');process.exit(1);});
internal.on('error',()=>{console.error('내부 작업 포트를 사용할 수 없습니다.');process.exit(1);});
app.listen(PORT,'127.0.0.1',()=>{console.log('AI Creator Studio: http://localhost:'+PORT);ready();});
internal.listen(INTERNAL,'127.0.0.1',()=>{console.log('Private n8n bridge ready');ready();});
