export function createStaleLeaseRecovery({readLease,findJob,confirmed,hasActive,queue,models,free,release,save,now=Date.now}){
 let busy=false,last=-Infinity;
 return async()=>{if(busy||now()-last<15000)return false;busy=true;last=now();try{
  const lease=await readLease();if(!lease.busy||!lease.owner||!lease.stoppedAt||!['error','crashed','canceled','cancelled','success'].includes(lease.status))return false;
  const j=findJob(String(lease.owner));if(!j||j.state!=='cancelled'||!confirmed(j.id)||hasActive())return false;
  const idle=q=>Array.isArray(q.queue_running)&&Array.isArray(q.queue_pending)&&q.queue_running.length===0&&q.queue_pending.length===0;
  if(!idle(await queue())||(await models()).length)return false;
  await free();if(!idle(await queue())||(await models()).length||hasActive())return false;
  if(!await release(String(lease.owner)))return false;
  j.cleanup={...j.cleanup,verified:true,recoveredCancelledLease:true};j.leaseRecoveredAt=now();save(j);return true;
 }catch{return false;}finally{busy=false;}};
}
