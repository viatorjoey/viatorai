const modes=['text-image','image-image','text-video','image-video','card-news','shorts','longform','post','landing','document'];
export function generationStats(records){
 const make=mode=>({mode,completed:0,images:0,videos:0,documents:0,failed:0,cancelled:0,pending:0,timed:0,totalMs:0});const rows=modes.map(make),total=make('all'),byModel=new Map();
 for(const j of records){const row=rows.find(r=>r.mode===j.mode);if(!row||j.refineOnly)continue;
  const raw=typeof j.model==='string'?j.model.trim():'',model=/^(chatgpt-image|gpt-image)/.test(raw)?'openai:'+raw:raw||null,key=model||'__unrecorded__';
  if(!byModel.has(key))byModel.set(key,{...make(null),model});
  for(const r of [row,total,byModel.get(key)]){
  if(j.cancelled||j.state==='cancelled'||j.cancellationConfirmed){r.cancelled++;continue;}
  if(j.state==='complete'){r.completed++;for(const a of j.assets||[]){if(a.kind==='image')r.images++;if(a.kind==='video')r.videos++;if(a.kind==='document')r.documents++;}const start=j.startedAt||j.submissionIntent,end=j.completedAt||j.updated;if(Number.isFinite(start)&&start>0&&Number.isFinite(end)&&end>=start){r.timed++;r.totalMs+=end-start;}}
  else if(j.state==='blocked')r.failed++;else if(['queued','upgrade_wait','running','submitting','cleaning','releasing'].includes(j.state))r.pending++;
 }}
 const finish=r=>({...r,averageSeconds:r.timed?Math.round(r.totalMs/r.timed/1000):null,successRate:r.completed+r.failed?Math.round(r.completed/(r.completed+r.failed)*1000)/10:null});return {total:finish(total),rows:rows.map(finish),models:[...byModel.values()].map(finish).sort((a,b)=>b.completed-a.completed||String(a.model||'').localeCompare(String(b.model||''))),updated:Date.now()};
}
