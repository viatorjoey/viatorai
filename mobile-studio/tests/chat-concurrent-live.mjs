import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {writeFileSync} from 'node:fs';
const base='http://127.0.0.1:8799',pause=ms=>new Promise(r=>setTimeout(r,ms));const s=await fetch(base+'/api/local-session',{method:'POST'}),headers={Origin:base,Cookie:s.headers.get('set-cookie').split(';')[0],'Content-Type':'application/json'};
async function call(p,b,key){const r=await fetch(base+p,{method:b?'POST':'GET',headers:{...headers,...(key?{'Idempotency-Key':key}:{})},body:b?JSON.stringify(b):undefined});const x=await r.json();if(!r.ok)throw Error(x.error);return x;}
const imageId=randomUUID();await call('/api/jobs',{mode:'text-image',prompt:'A peaceful lake with mountains at sunrise, watercolor illustration. No people.',resolution:'512x288',aspect:'16:9',seed:777,guidance:1,enhance:false},imageId);
let chatId,overlap=false,maxCpuVram=0,image,chat;
for(let i=0;i<600;i++){
 image=(await call('/api/jobs')).find(j=>j.id===imageId);if(image?.state==='blocked')throw Error(image.message);
 const q=await(await fetch('http://127.0.0.1:8188/queue')).json();
 if(!chatId&&q.queue_running.some(x=>x[1]===image?.promptId)){const c=await call('/api/chats',{model:'qwen3.5:9b'});chatId=c.id;await call('/api/chats/'+c.id+'/messages',{model:c.model,content:'이미지 생성과 동시에 채팅하는 테스트입니다. 연결 확인이라고만 짧게 답하세요.'},randomUUID());console.log('Image running; CPU chat submitted immediately');}
 if(chatId){chat=await call('/api/chats/'+chatId);if(chat.pending?.state==='blocked')throw Error(chat.pending.message);const ps=await(await fetch('http://127.0.0.1:11435/api/ps')).json();for(const m of ps.models){maxCpuVram=Math.max(maxCpuVram,m.size_vram);assert.equal(m.size_vram,0);}if(ps.models.length&&q.queue_running.some(x=>x[1]===image?.promptId))overlap=true;}
 if(image?.state==='complete'&&chat?.pending?.state==='complete'){assert(overlap);assert(image.cleanup.verified);assert(chat.messages.some(m=>m.role==='assistant'));const report={imageId,chatId,overlap,maxCpuVram,imageCleanup:true,cpuAnswer:true};writeFileSync(new URL('../data/chat-concurrent-results.json',import.meta.url),JSON.stringify(report,null,2));await call('/api/gallery/delete',{ids:[imageId]});console.log('PASS concurrent ComfyUI generation and CPU chat, 0 CPU-chat VRAM, output and cleanup verified; synthetic image moved to recoverable trash');break;}
 if(i===599)throw Error('concurrency test timeout');await pause(500);
}
