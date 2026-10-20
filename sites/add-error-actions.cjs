const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'viator-agent-meeting');
function edit(file,fn){const p=path.join(root,file),s=fs.readFileSync(p,'utf8');fs.writeFileSync(p,fn(s));}
edit('app/hub-actions.ts',s=>{
 const start=s.indexOf('export async function rejectProduction('),end=s.indexOf('export async function retryProduction(',start);
 s=s.slice(0,start)+s.slice(start,end).replace("AND status='awaiting_approval'","AND status IN ('awaiting_approval','blocked')").replace('승인 대기 중인 제작안을 찾을 수 없습니다.','폐기할 수 있는 제작안을 찾을 수 없습니다.')+s.slice(end);
 return s+`
export async function editBlockedProduction(actor:string,pid:string,b:any,key:string){
 const id=text(b.id,'작업 ID',100),db=database();
 const old=await db.prepare("SELECT * FROM hub_production_jobs WHERE id=? AND project=? AND status='blocked'").bind(id,pid).first<any>();
 if(!old)throw new HubError(409,'수정할 오류 작업을 찾을 수 없습니다.');
 let prior:any={};try{prior=JSON.parse(old.result||'{}');}catch{}
 const made=await createProduction(actor,pid,{...old,...b,roomId:old.room_id,title:b.title||old.title,referenceId:prior.reference?.id,referenceName:prior.reference?.name},'edit:'+id+':'+key.slice(0,60));
 if(made.jobId===id)throw new HubError(409,'프롬프트 또는 설정을 변경한 뒤 저장해주세요. 같은 조건은 다시 시도를 사용하세요.');
 await db.prepare("UPDATE hub_production_jobs SET status='revision_requested',updated_at=? WHERE id=? AND project=? AND status='blocked'").bind(stamp(),id,pid).run();
 await event(actor,pid,'production.error_edited',id);return made;
}
`;
});
edit('app/api/[...path]/route.ts',s=>s.replace('import {cancelPublication,','import {editBlockedProduction,cancelPublication,').replace("  if(path==='/api/hub/production/retry')","  if(path==='/api/hub/production/error/edit')return response(await editBlockedProduction(actor,await project(b.projectId),b,req.headers.get('idempotency-key')||''));\n  if(path==='/api/hub/production/retry')"));
edit('app/meeting-app.tsx',s=>{
 s=s.replace("const [pid,setPid]","const [editingError,setEditingError]=useState<string|null>(null);\n const [pid,setPid]");
 s=s.replace('function openProduction(){','function openProduction(){setEditingError(null);');
 s=s.replace("const made=await api('hub/production/create',{projectId:pid,roomId:room.id,...productionDraft,referenceId:reference?.id,referenceName:reference?.name});","const made=await api(editingError?'hub/production/error/edit':'hub/production/create',{projectId:pid,id:editingError,roomId:room.id,...productionDraft,referenceId:reference?.id,referenceName:reference?.name});setEditingError(null);");
 const a=s.indexOf("{job.status==='blocked'&&(job.error==="),b=s.indexOf("{job.status==='complete'&&brokenAssets",a);
 if(a<0||b<0)throw Error('error actions target missing');
 s=s.slice(0,a)+`{job.status==='blocked'&&<div className="error-actions"><div className="production-actions">{job.error==='이 생성 방식에 맞는 모델을 선택해 주세요.'&&!job.studio_job_id&&<button className="primary" onClick={()=>retryProduction(job.id)} disabled={busy}><RotateCcw size={15}/>다시 시도</button>}<button className="outline" onClick={()=>{setEditingError(job.id);setProductionDraft({title:job.title,mode:job.mode,model:job.model||'studio',quality:job.quality,prompt:job.prompt,aspect:(job as any).aspect||'1:1',resolution:job.resolution,duration:(job as any).duration||10});setReferenceFile(null);setReviewOpen(false);setProductionOpen(true);}} disabled={busy}><Pencil size={15}/>설정 수정</button><button className="outline" onClick={()=>decideProduction(job.id,false)} disabled={busy}><Trash2 size={15}/>폐기</button></div>{!(job.error==='이 생성 방식에 맞는 모델을 선택해 주세요.'&&!job.studio_job_id)&&<small>접수된 작업의 중복 실행을 막기 위해 설정 수정 후 새 제작안을 승인해주세요.</small>}</div>}`+s.slice(b);
 s=s.replace('<h2>제작안 만들기</h2>','<h2>{editingError?\'오류 작업 설정 수정\':\'제작안 만들기\'}</h2>');
 s=s.replace("if(productionDraft.mode==='image-video'){if(!referenceFile)","if(productionDraft.mode==='image-video'&&!editingError){if(!referenceFile)");
 s=s.replace("{productionDraft.mode==='image-video'&&<label>기준 사진","{productionDraft.mode==='image-video'&&!editingError&&<label>기준 사진");
 return s;
});
