import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {unloadModels,managedChat} from './gpu-lifecycle.mjs';
const exec=promisify(execFile),CPU='http://127.0.0.1:11435',GiB=1024**3;
export const isCpuChat=j=>j.mode==='llm-chat'&&j.chatLane==='cpu';
export function chatMemoryBudget(model,freeBytes){const estimatedGiB=model==='gpt-oss:20b'?16:9,reserveGiB=10;return {allowed:freeBytes>=(estimatedGiB+reserveGiB)*GiB,estimatedGiB,reserveGiB,freeGiB:Math.round(freeBytes/GiB*10)/10};}
export function createCpuChat({db,chats,root,data,jobs,getJob,save,request,testMode=false}){
 let busy=false,starting=null,verifiedUntil=0,pendingRefinements=0;
 const cpu=(p,b,t)=>request(CPU,p,b,t);
 async function ensureService(){
  if(Date.now()<verifiedUntil)return;
  if(!starting)starting=(async()=>{await exec('powershell.exe',['-NoProfile','-File',path.join(root,'start-chat-cpu.ps1')],{windowsHide:true,timeout:15000});for(let i=0;i<40;i++){try{const ps=await cpu('/api/ps',undefined,2000);if(ps.models?.some(m=>m.size_vram>0))throw Error('CPU 전용 채팅의 VRAM 사용이 감지됐습니다.');verifiedUntil=Date.now()+15000;return;}catch{await new Promise(r=>setTimeout(r,250));}}throw Error('채팅 전용 엔진을 연결하지 못했습니다.');})().finally(()=>starting=null);
  return starting;
 }
 function cancelled(j){return !!db.prepare('SELECT 1 FROM cancellations WHERE id=?').get(j.id);}
 async function run(j){
  await ensureService();
  const budget=chatMemoryBudget(j.model,os.freemem());if(!budget.allowed){j.message=`채팅 메모리 확보 중 · 사용 가능 RAM ${budget.freeGiB}GB`;save(j);return;}
  j.state='running';j.startedAt=Date.now();j.message='답변을 준비하고 있어요.';j.chatMemory=budget;save(j);
  const c=chats.get(j.chatId);if(!c)throw Error('채팅을 찾을 수 없습니다.');
  if(c.messages.some(m=>m.jobId===j.id&&m.role==='assistant')){j.state='complete';j.cleanup={verified:true,cpuOnly:true};save(j);return;}
  const history=c.messages.slice(-12).map(m=>{const out={role:m.role,content:m.content};if(m.uploadId){const u=db.prepare('SELECT * FROM uploads WHERE id=?').get(m.uploadId);if(!u)throw Error('첨부 이미지를 찾지 못했습니다.');out.images=[readFileSync(path.join(data,'uploads',u.id+u.ext)).toString('base64')];}return out;});
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),300000);let lastWrite=0,done=false;
  const check=setInterval(()=>{if(cancelled(j))controller.abort();},300);let guardBusy=false;
  const guard=setInterval(async()=>{if(guardBusy)return;guardBusy=true;try{const ps=await cpu('/api/ps',undefined,2000);if(ps.models?.some(m=>m.size_vram>0)){controller.abort();j.guardError='채팅 엔진의 VRAM 사용이 감지되어 중단했습니다.';}}catch{}finally{guardBusy=false;}},1000);
  let answer='',thinking='';
  try{
   const r=await fetch(CPU+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({model:j.model,stream:true,think:j.model==='gpt-oss:20b'?'low':false,keep_alive:0,messages:history,options:{num_gpu:0,num_ctx:2048,num_thread:8,num_predict:1200,temperature:.6}})});
   if(!r.ok)throw Error('채팅 엔진 응답 오류 '+r.status);
   let buffer='';const decoder=new TextDecoder();
   function accept(line){if(!line.trim())return;const x=JSON.parse(line);if(x.error)throw Error('채팅 답변을 처리하지 못했습니다.');thinking+=x.message?.thinking||'';const token=x.message?.content||'';if(token&&!j.firstTokenAt)j.firstTokenAt=Date.now();answer+=token;if(answer.length>50000)throw Error('답변 길이 제한에 도달했습니다.');if(Date.now()-lastWrite>150||x.done){j.partial=answer;j.message=answer?'답변 중…':thinking?'답변을 생각하고 있어요…':'답변을 준비하고 있어요.';save(j);lastWrite=Date.now();}if(x.done){done=true;j.tokenCount=x.eval_count;j.tokenDuration=x.eval_duration;}}
   for await(const chunk of r.body){buffer+=decoder.decode(chunk,{stream:true});let end;while((end=buffer.indexOf('\n'))>=0){accept(buffer.slice(0,end));buffer=buffer.slice(end+1);}if(cancelled(j))controller.abort();}
   buffer+=decoder.decode();if(buffer.trim())accept(buffer);
   if(!done||!answer.trim())throw Error('완료된 채팅 답변을 확인하지 못했습니다.');
  }finally{clearTimeout(timeout);clearInterval(check);clearInterval(guard);await unloadModels(cpu,[j.model]);}
  if(j.guardError)throw Error(j.guardError);
  if(cancelled(j)){db.prepare('UPDATE cancellations SET confirmed=? WHERE id=?').run(Date.now(),j.id);j.state='cancelled';j.message='채팅을 중단했습니다.';delete j.partial;save(j);return;}
  const current=chats.get(j.chatId);if(!current)throw Error('삭제된 채팅입니다.');
  if(!current.messages.some(m=>m.jobId===j.id&&m.role==='assistant')){current.messages.push({id:randomUUID(),jobId:j.id,role:'assistant',model:j.model,content:answer,created:Date.now()});chats.put(current);}
  delete j.partial;j.state='complete';j.completedAt=Date.now();j.cleanup={verified:true,cpuOnly:true,ollamaUnloaded:true};j.message='답변을 저장했습니다.';save(j);
 }
 async function dispatch(){if(testMode||busy||pendingRefinements)return;const j=jobs().filter(j=>isCpuChat(j)&&j.state==='queued').sort((a,b)=>a.created-b.created)[0];if(!j)return;busy=true;try{await run(j);}catch(e){const latest=getJob(j.id)||j;if(cancelled(j)){db.prepare('UPDATE cancellations SET confirmed=? WHERE id=?').run(Date.now(),j.id);latest.state='cancelled';latest.message='채팅을 중단했습니다.';}else{latest.state='blocked';latest.message=e.name==='AbortError'?'채팅 응답 시간이 초과되었습니다. 다시 보내 주세요.':e.message;}delete latest.partial;save(latest);}finally{busy=false;}}
 async function refine(value){
  if(testMode)throw Error('테스트 환경에서는 실제 LLM을 호출하지 않습니다.');
  pendingRefinements++;const deadline=Date.now()+300000;
  try{while(busy){if(Date.now()>deadline)throw Error('CPU 답변 처리 중입니다. 잠시 후 다시 시도해 주세요.');await new Promise(r=>setTimeout(r,100));}
   busy=true;
  }finally{pendingRefinements--;}
  try{await ensureService();const budget=chatMemoryBudget(value.model,os.freemem());if(!budget.allowed)throw Error(`보정에 필요한 RAM이 부족합니다. 사용 가능 ${budget.freeGiB}GB · 최소 ${budget.estimatedGiB+budget.reserveGiB}GB`);
   return await managedChat(cpu,{...value,options:{...value.options,num_gpu:0,num_ctx:4096,num_thread:8}});
  }finally{busy=false;}
 }
 return {dispatch,refine,isBusy:()=>busy||pendingRefinements>0};
}
