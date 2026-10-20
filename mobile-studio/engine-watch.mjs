export function createEngineWatch({probe,inspect,recover,active,now=Date.now,threshold=3,cooldown=60000}){
 let busy=false,misses=0,next=0;const status={state:'watching'};
 const tick=async()=>{
  if(busy||active()||now()<next)return;
  busy=true;
  try{
   if(await probe()){misses=0;status.state='online';status.error=null;await inspect();return;}
   status.state='offline';
   if(++misses<threshold)return;
   const engine=await inspect();
   if(!['stopped','unresponsive'].includes(engine.state))return;
   next=now()+cooldown;status.state='recovering';await recover();misses=0;
  }catch(e){status.state='retrying';status.error=e.message;next=now()+cooldown;}finally{status.checkedAt=now();status.nextAttemptAt=next;busy=false;}
 };
 tick.status=status;return tick;
}
