import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {randomUUID} from 'node:crypto';import {writeFileSync,readFileSync} from 'node:fs';
const base='http://127.0.0.1:8799',pause=ms=>new Promise(r=>setTimeout(r,ms));const session=await fetch(base+'/api/local-session',{method:'POST'}),headers={Cookie:session.headers.get('set-cookie').split(';')[0],Origin:base,'Content-Type':'application/json'};
async function call(p,b,key){const r=await fetch(base+p,{method:b?'POST':'GET',headers:{...headers,...(key?{'Idempotency-Key':key}:{})},body:b?JSON.stringify(b):undefined});const x=await r.json();if(!r.ok)throw Error(x.error);return x;}
const report=[];
const vision=process.argv[2]==='vision';let uploadId;
if(vision){const file=readFileSync(new URL('../data/upgrade-test/results/44470ebd-0ec3-4bb3-b0b5-872eaab6fa92-0.png',import.meta.url));const r=await fetch(base+'/api/uploads',{method:'POST',headers:{...headers,'Content-Type':'image/png'},body:file});assert.equal(r.status,201);uploadId=(await r.json()).id;}
for(const model of vision?['qwen3.5:9b']:['qwen3.5:9b','gpt-oss:20b']){
 const c=await call('/api/chats',{model}),id=randomUUID();await call('/api/chats/'+c.id+'/messages',{model,uploadId,content:vision?'이미지 첨부 기능 테스트입니다. 이 풍경을 한국어 한 문장으로만 설명해 주세요.':'채팅 속도 검증입니다. 연결 확인이라고만 짧게 답해주세요.'},id);console.log('CPU chat testing '+model);
 let sawCpu=false,sawPartial=false;
 for(let i=0;i<600;i++){
  const chat=await call('/api/chats/'+c.id),p=chat.pending;const ps=await(await fetch('http://127.0.0.1:11435/api/ps')).json();if(ps.models.length)sawCpu=true;assert(ps.models.every(m=>m.size_vram===0));sawPartial||=!!p?.partial;
  if(p?.state==='blocked')throw Error(p.message);
  if(p?.state==='complete'){
   assert(chat.messages.some(m=>m.role==='assistant'&&m.content.trim()));const db=new DatabaseSync(new URL('../data/studio.sqlite',import.meta.url));const j=JSON.parse(db.prepare('SELECT body FROM jobs WHERE id=?').get(id).body);db.close();assert.equal(j.chatLane,'cpu');assert(!j.owner);assert(j.cleanup.cpuOnly&&j.cleanup.verified);assert.equal(ps.models.length,0);
   const result={model,id,chatId:c.id,firstTokenSeconds:(j.firstTokenAt-j.created)/1000,totalSeconds:(j.completedAt-j.created)/1000,dispatchDelayMs:j.startedAt-j.created,cpuOnlyObserved:sawCpu,streamingObserved:sawPartial,ramBudget:j.chatMemory,unloaded:true};report.push(result);console.log(JSON.stringify(result));break;
  }
  if(i===599)throw Error('chat test timeout');await pause(500);
 }
}
writeFileSync(new URL(vision?'../data/chat-cpu-vision-results.json':'../data/chat-fast-live-results.json',import.meta.url),JSON.stringify(report,null,2));console.log('PASS CPU answers, streaming, no GPU owner/VRAM, immediate dispatch and unload');
