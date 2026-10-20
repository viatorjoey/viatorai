import {createHash} from 'node:crypto';
import {cpuRefinementRequest,parseRefinement,preserveRequestedStyle} from './refinement.mjs';
export const LOCAL_REFINEMENT_MODEL='qwen3.5:9b';
export function createRefinementService({cpuChat,cloudStudio,jobs,getJob,save}){
 const pending=new Map();
 async function models(){const c=await cloudStudio.caps();return [{id:LOCAL_REFINEMENT_MODEL,label:'로컬 · Qwen 3.5 9B (CPU)',connected:true,provider:'local'},...c.models.filter(m=>m.modes.includes('llm-chat')).map(m=>({id:m.id,provider:m.provider,connected:m.connected,label:({openai:'ChatGPT',gemini:'Gemini',xai:'Grok',anthropic:'Claude'}[m.provider]||m.label)+(m.textModel?' · '+m.textModel:''),textModel:m.textModel}))];}
 async function refine(v,{key,refinementModel=LOCAL_REFINEMENT_MODEL,refinementAttempt=0}){
  if(!/^[a-f0-9-]{36}$/.test(key||''))throw Error('요청 번호가 필요합니다.');
  const selected=(await models()).find(m=>m.id===refinementModel);
  if(!selected)throw Error('지원하는 보정 모델을 선택하세요.');
  if(selected.connected===false)throw Error('선택한 보정 모델의 API 키를 스튜디오 설정에 연결하세요.');
  const attempt=Number.isInteger(refinementAttempt)?Math.min(20,Math.max(0,refinementAttempt)):0;
  const fingerprint=createHash('sha256').update(JSON.stringify({v,refinementModel,attempt})).digest('hex');
  const prior=getJob(key);if(prior){if(!prior.refineOnly||prior.state!=='complete'||prior.refinementFingerprint!==fingerprint)throw Error('요청 번호의 내용이 변경되었습니다.');return prior;}
  if(pending.has(key)){const p=pending.get(key);if(p.fingerprint!==fingerprint)throw Error('요청 번호의 내용이 변경되었습니다.');return p.work;}
  if(!attempt){const cached=jobs().find(j=>j.refineOnly&&j.state==='complete'&&!j.deletedAt&&j.mode===v.mode&&j.model===v.model&&(j.refinementModel||LOCAL_REFINEMENT_MODEL)===refinementModel&&j.originalPrompt===v.prompt&&j.originalNegative===v.negative&&j.guidance===v.guidance);if(cached)return cached;}
  const work=(async()=>{
   const created=Date.now();let refined;
   for(let n=0;n<2;n++){
    const request=cpuRefinementRequest({...v,refinementAttempt:attempt||n});
    const out=refinementModel===LOCAL_REFINEMENT_MODEL?await cpuChat.refine(request):await cloudStudio.refine(refinementModel,request);
    try{refined=preserveRequestedStyle(parseRefinement(out),v);break;}catch(e){if(n===1)throw e;}
   }
   return save({...v,...refined,id:key,created,state:'complete',refineOnly:true,enhance:false,originalPrompt:v.prompt,originalNegative:v.negative,refinementModel,refinementModelLabel:selected.label,refinementFingerprint:fingerprint,refinedAt:Date.now(),completedAt:Date.now(),cleanup:refinementModel===LOCAL_REFINEMENT_MODEL?{verified:true,cpuOnly:true,ollamaUnloaded:true}:{verified:true,cloudOnly:true},message:selected.label+' 보정문을 생성했습니다.'});
  })().finally(()=>pending.delete(key));pending.set(key,{fingerprint,work});return work;
 }
 return {models,refine,isBusy:()=>pending.size>0};
}
