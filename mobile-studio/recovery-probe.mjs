import {isOverdue} from './job-policy.mjs';
import {ownOutputs} from './graphs.mjs';
export function canResumeKnownPrompt(j,now=Date.now()){
 return j.state==='blocked'&&j.restartInterrupted===true&&!!j.owner&&!!j.promptId&&!!j.submissionIntent&&!isOverdue(j,now)&&(j.recoveryAttempts||0)<3&&now-(j.lastRecoveryAt||0)>=30000;
}
export async function proveKnownPrompt(j,request){
 const queue=await request('/queue');if(!Array.isArray(queue.queue_running)||!Array.isArray(queue.queue_pending))return false;
 if([...queue.queue_running,...queue.queue_pending].some(x=>x[1]===j.promptId))return true;
 const history=await request('/history/'+encodeURIComponent(j.promptId));return !!ownOutputs(history,j.promptId,j.id);
}
