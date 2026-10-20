import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
const exec=promisify(execFile),pause=ms=>new Promise(r=>setTimeout(r,ms));
export function maintenanceService({db,root,request,jobs,save,registerCancellation,run=exec,pauseFn=pause,attempts=120}){
 db.exec('CREATE TABLE IF NOT EXISTS maintenance(id TEXT PRIMARY KEY,state TEXT,body TEXT)');
 const put=x=>db.prepare('INSERT OR REPLACE INTO maintenance VALUES(?,?,?)').run(x.id,x.state,JSON.stringify(x));
 const active=()=>db.prepare("SELECT 1 FROM maintenance WHERE state='running'").get();
 async function lock(action,expected='',next=''){
  const code="const{DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/home/node/.n8n/database.sqlite');d.exec('PRAGMA busy_timeout=5000');const t='data_table_user_gd2WF5s9jDTeftKt';const[a,e,n]=process.argv.slice(1);if(a==='claim'){const r=d.prepare('UPDATE '+t+' SET busy=1,owner=? WHERE id=1 AND busy=? AND owner=?').run(n,e?1:0,e);if(r.changes!==1)throw Error('GPU ownership changed');}if(a==='restore'){const r=d.prepare('UPDATE '+t+' SET busy=?,owner=? WHERE id=1 AND owner=?').run(e?1:0,e,n);if(r.changes!==1)throw Error('GPU restoration ownership changed');}console.log(JSON.stringify(d.prepare('SELECT busy,owner FROM '+t+' WHERE id=1').get()));d.close();";
  const r=await run('docker',['exec','n8n','node','-e',code,action,expected,next],{windowsHide:true,timeout:15000});return JSON.parse(r.stdout.trim());
 }
 async function processInfo(){const r=await run('powershell.exe',['-NoProfile','-File',path.join(root,'comfy-process.ps1'),'-Action','inspect'],{windowsHide:true,timeout:15000});return JSON.parse(r.stdout.trim());}
 async function snapshot(){
  if(active())throw Error('ComfyUI 재시작이 이미 진행 중입니다.');
  const [gpu,process]=await Promise.all([lock('read'),processInfo()]);
  const messages={starting:'ComfyUI 시작 중입니다. 잠시 기다려 주세요.',stopped:'ComfyUI가 종료되어 있습니다. Comfy Desktop에서 해당 인스턴스를 실행하세요.',unresponsive:'ComfyUI 응답을 확인할 수 없습니다. Comfy Desktop에서 상태를 확인하세요.',foreign:'8188 포트의 실행 대상을 확인할 수 없습니다.'};
  if(process.state==='foreign'||process.state==='starting'||!(process.recoverable||process.desktopOwned))throw Error(messages[process.state]||'실행 대상을 확인할 수 없습니다.');
  const affected=jobs().filter(j=>j.mode!=='llm-chat'&&!['queued','complete','cancelled'].includes(j.state));
  if((gpu.busy||gpu.owner)&&!affected.some(j=>j.owner&&String(j.owner)===String(gpu.owner)))throw Error('앱 외부 작업이 GPU를 사용 중입니다.');
  let q;try{q=await request('/queue');}catch{if(!['stopped','unresponsive'].includes(process.state))throw Error('작업 목록을 확인할 수 없습니다.');q={queue_running:[],queue_pending:[]};}
  if(!Array.isArray(q.queue_running)||!Array.isArray(q.queue_pending))throw Error('ComfyUI 작업 목록을 확인할 수 없습니다.');
  const ids=[...q.queue_running,...q.queue_pending].map(x=>x[1]).sort();
  if(ids.some(id=>!affected.some(j=>j.promptId===id)))throw Error('앱 외부 생성·대기 작업이 있어 재시작을 보류합니다.');
  return {owner:gpu.owner||'',ids,pid:process.pid,started:process.started,affected:affected.map(j=>j.id).sort()};
 }
 async function start(expected){
  const current=await snapshot();if(JSON.stringify(current)!==JSON.stringify(expected))throw Error('대상 작업이나 ComfyUI가 바뀌었습니다. 다시 확인해 주세요.');
  const event={id:randomUUID(),state:'running',runnerPid:process.pid,expected,phase:'restarting',created:Date.now(),message:'엔진 종료·재기동을 요청하고 있습니다.'};
  db.exec('BEGIN IMMEDIATE');try{if(active())throw Error('ComfyUI 재시작이 이미 진행 중입니다.');put(event);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  const owner='studio-maint-'+event.id;
  try{await lock('claim',expected.owner,owner);}catch(e){event.state='failed';event.message=e.message;put(event);throw e;}
  void execute(event,expected);
  return event;
 }
 async function execute(event,expected,restart=true){
  const owner='studio-maint-'+event.id;
   let restored=false;
   try{
    if(restart)await run('powershell.exe',['-NoProfile','-File',path.join(root,'comfy-process.ps1'),'-Action','restart','-ExpectedPid',String(expected.pid),...(expected.started?['-ExpectedStarted',expected.started]:[])],{windowsHide:true,timeout:60000});
    event.phase='checking';event.message='엔진 실행 후 API 연결을 확인하고 있습니다.';put(event);
    let stable=0;
    for(let i=0;i<attempts;i++){
     await pauseFn(2000);try{const stats=await request('/system_stats');const q=await request('/queue');const process=await processInfo();if(!stats?.system||!Array.isArray(q.queue_running)||!Array.isArray(q.queue_pending)||q.queue_running.length||q.queue_pending.length||process.state!=='ready'||!(process.recoverable||process.desktopOwned)||process.pid<=0||process.pid===expected.pid||!process.started||process.started===expected.started)throw Error('복구 확인 중');if(event.pid!==process.pid)stable=0;event.pid=process.pid;if(++stable>=2)break;}catch{stable=0;}
     if(i===attempts-1)throw Error('ComfyUI가 4분 안에 다시 응답하지 않았습니다. Comfy Desktop을 확인하세요.');
    }
    for(const id of expected.affected){const j=jobs().find(j=>j.id===id);if(j){registerCancellation(j,'엔진 장애 복구로 기존 생성을 종료했습니다.');db.prepare('UPDATE cancellations SET confirmed=? WHERE id=?').run(Date.now(),id);save({...j,state:'cancelled',completedAt:Date.now(),message:'엔진 재시작으로 종료되었습니다. 저장된 결과는 유지됩니다.'});}}
    await lock('restore','',owner);restored=true;event.state='complete';event.phase='complete';event.message='새 엔진의 API 정상 응답을 확인했습니다. 대기 작업을 재개합니다.';
   }catch(e){event.state='failed';event.message='ComfyUI 재시작 실패: '+(e.stderr?'엔진 실행 요청을 완료하지 못했습니다. 다시 시도합니다.':e.message);}
   finally{
    if(!restored){try{await lock('restore',expected.owner,owner);}catch{event.message+=' GPU 소유권 복구 확인이 필요합니다.';}}
    event.completed=Date.now();put(event);
   }
 }
 async function resume(){for(const event of listRunning()){if(event.runnerPid&&event.runnerPid!==process.pid){try{globalThis.process.kill(event.runnerPid,0);continue;}catch{}}if(!event.expected)continue;const gpu=await lock('read');if(gpu.owner!=='studio-maint-'+event.id)continue;event.runnerPid=process.pid;put(event);void execute(event,event.expected,false);}}
 function listRunning(){return db.prepare("SELECT body FROM maintenance WHERE state='running'").all().map(r=>JSON.parse(r.body));}
 return {active,snapshot,start,resume,processInfo,gpuInfo:()=>lock('read'),list:()=>db.prepare('SELECT body FROM maintenance ORDER BY rowid DESC LIMIT 20').all().map(r=>JSON.parse(r.body))};
}
