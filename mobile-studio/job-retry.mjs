import {validateInput} from './graphs.mjs';
export function createJobRetry({db,getJob,save,jobs,request,gpuInfo,catalog,uploadExists,maintenanceActive}){
 db.exec('CREATE TABLE IF NOT EXISTS job_retries(source TEXT PRIMARY KEY,target TEXT UNIQUE)');
 const existing=id=>{const row=db.prepare('SELECT target FROM job_retries WHERE source=?').get(id);return row?getJob(row.target):null;};
 return async function retry(id,key){
  if(!/^[a-f0-9-]{36}$/.test(key||''))throw Error('요청 번호가 필요합니다.');
  const prior=existing(id);if(prior)return prior;
  const source=getJob(id);if(!source||source.state!=='blocked'||source.deletedAt||source.assets?.length||source.recoveryRequested||source.llmIntent)throw Error('현재 재시작할 수 없는 작업입니다. 상태를 다시 확인해 주세요.');
  if(maintenanceActive())throw Error('엔진 재시작이 끝난 뒤 다시 시도하세요.');
  const q=await request('/queue');if(!Array.isArray(q.queue_running)||!Array.isArray(q.queue_pending)||q.queue_running.length||q.queue_pending.length)throw Error('기존 생성 작업이 남아 있습니다. 작업취소 후 중단 확인을 기다려 주세요.');
  const gpu=await gpuInfo();if(!gpu||![false,0].includes(gpu.busy)||gpu.owner)throw Error('GPU 작업 정리가 끝난 뒤 다시 시도하세요.');
  const cancelled=db.prepare('SELECT confirmed FROM cancellations WHERE id=?').get(id);
  if(source.promptId&&!cancelled?.confirmed){const h=await request('/history/'+encodeURIComponent(source.promptId));if(h?.[source.promptId]?.status?.status_str!=='error')throw Error('기존 생성의 종료를 확인할 수 없습니다. 먼저 작업취소를 눌러 주세요.');}
  if(source.submissionIntent&&!source.promptId&&!cancelled?.confirmed)throw Error('기존 제출 여부를 확인할 수 없어 재시작을 보류합니다.');
  const value=source.mode==='memory-clean'?{mode:'memory-clean',prompt:'VRAM 비우기'}:validateInput(source);
  if(value.uploadId&&!uploadExists(value.uploadId))throw Error('원본 첨부 이미지를 확인할 수 없습니다.');
  if(!['memory-clean','image-text'].includes(value.mode)&&!(await catalog()).some(m=>m.id===value.model&&m.modes.includes(value.mode)))throw Error('설치된 모델을 확인해 주세요.');
  db.exec('BEGIN IMMEDIATE');try{
   const duplicate=existing(id);if(duplicate){db.exec('COMMIT');return duplicate;}
   if(maintenanceActive()||JSON.stringify(getJob(id))!==JSON.stringify(source))throw Error('작업 상태가 바뀌었습니다. 다시 확인해 주세요.');
   if(getJob(key))throw Error('요청 번호가 다른 작업에 사용되었습니다.');
   if(jobs().filter(j=>j.state==='queued').length>=500)throw Error('대기 작업이 많습니다. 완료 후 다시 시도하세요.');
   const now=Date.now(),next=save({...value,id:key,state:'queued',created:now,originalPrompt:source.originalPrompt,originalNegative:source.originalNegative,refinedAt:source.refinedAt,enhance:source.refinedAt?false:value.enhance,retriedFrom:id,message:'같은 설정으로 재시작을 접수했어요. 차례를 기다립니다.'});
   save({...source,state:'cancelled',completedAt:now,retriedAs:key,message:'사용자가 같은 설정으로 재시작했습니다.'});
   db.prepare('UPDATE cancellations SET confirmed=? WHERE id=?').run(now,id);
   db.prepare('INSERT INTO job_retries VALUES(?,?)').run(id,key);db.exec('COMMIT');return next;
  }catch(e){db.exec('ROLLBACK');throw e;}
 };
}
