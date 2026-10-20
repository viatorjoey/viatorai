const fs=require('fs'),root=__dirname+'/viator-agent-meeting/';
let s=fs.readFileSync(root+'app/hub-core.ts','utf8');
s=s.replace('export async function studioPull(pid:string,actor:string)',"export const studioModelId=(model:string)=>/^(chatgpt-image|gpt-image)/.test(model)?'openai:'+model:model;\nexport async function studioPull(pid:string,actor:string)");
s=s.replace('return {job:{...job,lease_id:leaseId,result:undefined,reference}', 'return {job:{...job,model:studioModelId(job.model),lease_id:leaseId,result:undefined,reference}');
s=s.replace("const error=typeof b.error==='string'?b.error.slice(0,1000):null;const terminal", "const error=status==='blocked'&&typeof b.error==='string'?b.error.slice(0,1000):null;const terminal");
fs.writeFileSync(root+'app/hub-core.ts',s);
s=fs.readFileSync(root+'public/studio-bridge.mjs','utf8').replace('if(job.model)return job.model;',"if(job.model&&job.model!=='studio')return /^(chatgpt-image|gpt-image)/.test(job.model)?'openai:'+job.model:job.model;");fs.writeFileSync(root+'public/studio-bridge.mjs',s);
s=fs.readFileSync(root+'app/hub-actions.ts','utf8');
const needle=" const id=uid(),now=stamp(),result={jobId:id,status:'awaiting_approval'};await db.batch([";
if(!s.includes(needle))throw Error('missing production insert');
s=s.replace(needle,` const duplicates=await db.prepare("SELECT response FROM hub_receipts WHERE actor=? AND fingerprint=? AND key LIKE ? ORDER BY rowid DESC LIMIT 10").bind(actor,fingerprint,actor+':production:%').all<any>();
 for(const previous of duplicates.results){let saved:any;try{saved=JSON.parse(previous.response);}catch{continue;}if(!saved.jobId)continue;const existing=await db.prepare("SELECT id,status FROM hub_production_jobs WHERE id=? AND project=? AND room_id=? AND status NOT IN ('rejected','revision_requested')").bind(saved.jobId,pid,roomId).first<any>();if(existing)return {jobId:existing.id,status:existing.status,replayed:true,deduplicated:true};}
`+needle);
fs.writeFileSync(root+'app/hub-actions.ts',s);
s=fs.readFileSync(root+'app/meeting-app.tsx','utf8').replace("await api('hub/production/create',{projectId:pid,roomId:room.id,...productionDraft", "const made=await api('hub/production/create',{projectId:pid,roomId:room.id,...productionDraft");
s=s.replace("setNotice('제작안을 저장했습니다. 검토안에서 확인하고 승인하면 스튜디오가 작업을 시작합니다.');", "setNotice(made.deduplicated?'같은 설정의 제작안이 이미 있습니다. 검토안에서 기존 작업을 확인해주세요.':'제작안을 저장했습니다. 검토안에서 확인하고 승인하면 스튜디오가 작업을 시작합니다.');");fs.writeFileSync(root+'app/meeting-app.tsx',s);
fs.appendFileSync(root+'test/cloud.test.mjs',`
test('Studio pull normalizes cloud model IDs for both bridge generations and leaves local IDs intact',async()=>{
 const room=await start('model-alias');const made=await actions.createProduction('test-owner','sandbox',{roomId:room.roomId,title:'호환 이미지',mode:'text-image',model:'chatgpt-image-latest',prompt:'test prompt'},'model-alias');await actions.approveProduction('test-owner','sandbox',made.jobId);
 const job=(await core.studioPull('sandbox','test')).job;assert.equal(job.model,'openai:chatgpt-image-latest');assert.equal(db.prepare('SELECT model FROM hub_production_jobs WHERE id=?').get(made.jobId).model,'chatgpt-image-latest');
 assert.equal(core.studioModelId('studio'),'studio');assert.equal(core.studioModelId('card-news'),'card-news');assert.equal(core.studioModelId('gemini:gemini-3.1-flash-image'),'gemini:gemini-3.1-flash-image');assert.equal(core.studioModelId('openai:chatgpt-image-latest'),'openai:chatgpt-image-latest');
 await core.studioResult('sandbox','test',{jobId:job.id,leaseId:job.lease_id,status:'complete',error:'결과를 스튜디오에 저장했습니다.',result:{assets:[]}});assert.equal(db.prepare('SELECT error FROM hub_production_jobs WHERE id=?').get(job.id).error,null);
});
test('Saving unchanged production settings with fresh request keys reuses an existing proposal',async()=>{
 const room=await start('dedupe-plan'),input={roomId:room.roomId,title:'동일한 안',mode:'text-image',model:'chatgpt-image-latest',prompt:'same prompt'};
 const first=await actions.createProduction('test-owner','sandbox',input,'save-one');const second=await actions.createProduction('test-owner','sandbox',input,'save-two');assert.equal(first.jobId,second.jobId);assert.equal(second.deduplicated,true);assert.equal(db.prepare('SELECT COUNT(*) n FROM hub_production_jobs WHERE room_id=?').get(room.roomId).n,1);
 const changed=await actions.createProduction('test-owner','sandbox',{...input,prompt:'edited prompt'},'save-edited');assert.notEqual(changed.jobId,first.jobId);
});
`);
fs.appendFileSync(root+'test/studio-bridge.test.mjs',`
test('legacy model aliases are normalized before the Studio API receives a submission',async()=>{const{c,calls}=context();c.job.model='chatgpt-image-latest';await c.run(c.config,c.job);assert.equal(JSON.parse(calls.find(x=>x.url==='http://studio.test/api/jobs'&&x.method==='POST').body).model,'openai:chatgpt-image-latest');});
`);
console.log('Applied Studio model normalization and duplicate-save protection.');
