export const JOB_LIMIT_MS=15*60*1000;
export function canCancelLocally(j){return j.state==='blocked'&&!j.owner&&!j.promptId&&!j.submissionIntent&&!j.llmIntent;}
export function isOverdue(j,now=Date.now()){const start=j.startedAt||j.submissionIntent;return Number.isFinite(start)&&start>0&&['running','submitting','cleaning','releasing','blocked'].includes(j.state)&&now-start>=JOB_LIMIT_MS;}
export async function cancelOwnedPrompt(j,request){if(!j.promptId)return false;await request('/api/jobs/'+encodeURIComponent(j.promptId)+'/cancel',{});const q=await request('/queue');return Array.isArray(q.queue_running)&&Array.isArray(q.queue_pending)&&![...q.queue_running,...q.queue_pending].some(x=>x[1]===j.promptId);}

export function canRecoverCancelledJob(j,cancellation,now=Date.now()){return j.state==='blocked'&&!!j.owner&&!!cancellation?.confirmed&&(j.recoveryAttempts||0)<3&&now-(j.lastRecoveryAt||0)>=30000;}

export function canRecoverUnsubmittedJob(j,now=Date.now()){return j.state==='blocked'&&!!j.owner&&!j.promptId&&!j.submissionIntent&&(!j.llmIntent||(j.phase==='refining'&&['보정된 설명 길이 또는 형식을 확인해 주세요.','문장 보정 결과를 읽지 못했습니다.'].includes(j.message)))&&(j.recoveryAttempts||0)<3&&now-(j.lastRecoveryAt||0)>=30000;}
