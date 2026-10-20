const fs=require('fs'),root=__dirname+'/viator-agent-meeting/';
fs.appendFileSync(root+'app/hub-core.ts',`
export async function recoverFinalPrompt(actor:string,pid:string,rid:string){
 await ensureStudioSchema();const db=database(),roomId=text(rid,'대화 ID',100);
 const chief=await db.prepare("SELECT * FROM hub_messages WHERE room_id=? AND project=? AND sender='chief' ORDER BY rowid DESC LIMIT 1").bind(roomId,pid).first<Row>();
 if(!chief||!wantsFinalPrompt(chief.body))throw new HubError(409,'최종 프롬프트 작성 요청이 있는 회의만 복구할 수 있습니다.');
 if(await db.prepare('SELECT id FROM hub_meeting_reports WHERE source_message_id=?').bind(chief.id).first())return {ok:true,replayed:true};
 const room=await db.prepare("SELECT * FROM hub_rooms WHERE id=? AND project=? AND status='waiting_muse'").bind(roomId,pid).first<Row>();if(!room)throw new HubError(409,'현재 회의 상태에서는 복구할 수 없습니다.');
 const incoming=await db.prepare('SELECT * FROM hub_messages WHERE room_id=? AND project=? ORDER BY rowid DESC LIMIT 1').bind(roomId,pid).first<Row>();if(!incoming||incoming.sender!=='director')throw new HubError(409,'다른 에이전트의 응답이 처리 중입니다.');
 const claim='retry_pending:'+uid(),now=stamp();
 await db.prepare("INSERT OR IGNORE INTO hub_generations(incoming_id,room_id,status,created_at) VALUES(?,?,'completed',?)").bind(incoming.id,roomId,now).run();
 const changes=await db.batch([
 db.prepare("UPDATE hub_generations SET status=?,error=NULL WHERE incoming_id=? AND status IN ('completed','gemini_failed') AND EXISTS(SELECT 1 FROM hub_rooms WHERE id=? AND project=? AND status='waiting_muse') AND NOT EXISTS(SELECT 1 FROM hub_generations WHERE room_id=? AND (status='running' OR status='gemini_running' OR status LIKE 'retry_pending:%')) AND incoming_id=(SELECT id FROM hub_messages WHERE room_id=? ORDER BY rowid DESC LIMIT 1)").bind(claim,incoming.id,roomId,pid,roomId,roomId),
 db.prepare("UPDATE hub_rooms SET status='director_thinking',updated_at=? WHERE id=? AND project=? AND status='waiting_muse' AND EXISTS(SELECT 1 FROM hub_generations WHERE incoming_id=? AND status=?)").bind(now,roomId,pid,incoming.id,claim)
 ]);if(!changes[0].meta.changes)throw new HubError(409,'최종안이 이미 처리 중입니다.');
 await event(actor,pid,'meeting.final_prompt_recovery',chief.id);return {ok:true,director:await generateDirector(incoming.id,claim)};
}
`);
let s=fs.readFileSync(root+'app/api/[...path]/route.ts','utf8').replace('import {archiveProject,','import {recoverFinalPrompt,archiveProject,');
s=s.replace("  if(path==='/api/hub/production/result/approve')","  if(path==='/api/hub/final-prompt/recover')return response(await recoverFinalPrompt(actor,await project(b.projectId),b.roomId));\n  if(path==='/api/hub/production/result/approve')");fs.writeFileSync(root+'app/api/[...path]/route.ts',s);
s=fs.readFileSync(root+'app/meeting-app.tsx','utf8');s=s.replace(' function openProduction(){',` async function recoverPrompt(){if(!room||busy)return;setBusy(true);try{const result=await api('hub/final-prompt/recover',{projectId:pid,roomId:room.id});if(result.director?.error)throw Error(result.director.error);await refresh();setNotice('최종 프롬프트를 제작안에 저장했습니다. 제작안을 다시 열어주세요.');setProductionOpen(false);}catch(e){setNotice((e as Error).message);}finally{setBusy(false);}}
 function openProduction(){`);
s=s.replace('직접 입력해주세요.</p>}','직접 입력해주세요.</p>}{!finalPrompts.length&&room?.status===\'waiting_muse\'&&<button type="button" className="outline" onClick={recoverPrompt} disabled={busy}>요청한 최종 프롬프트 저장</button>}');fs.writeFileSync(root+'app/meeting-app.tsx',s);
fs.appendFileSync(root+'test/cloud.test.mjs',`
test('Stalled explicit final prompt is recovered once without another Chief message',async()=>{
 await config('sandbox');const room=await start('recover-final');
 db.prepare("INSERT INTO hub_messages(id,room_id,project,sender,body,created_at) VALUES('stuck-chief',?,'sandbox','chief','최종 프롬프트를 만들어줘',?)").run(room.roomId,new Date().toISOString());
 db.prepare("INSERT INTO hub_messages(id,room_id,project,sender,body,created_at) VALUES('stuck-director',?,'sandbox','director','reportReady가 false라 기다립니다',?)").run(room.roomId,new Date().toISOString());
 const payload={projectId:'sandbox',roomId:room.roomId};assert.equal((await route.POST(request('hub/final-prompt/recover',payload))).status,401);
 assert.equal((await route.POST(request('hub/final-prompt/recover',{...payload,projectId:'moso'},ownerHeaders))).status,409);
 const before=db.prepare("SELECT COUNT(*) n FROM hub_messages WHERE sender='chief'").get().n;
 assert.equal((await route.POST(request('hub/final-prompt/recover',payload,ownerHeaders))).status,200);
 assert.equal((await core.state('sandbox',room.roomId)).reports.length,1);assert.equal(db.prepare("SELECT COUNT(*) n FROM hub_messages WHERE sender='chief'").get().n,before);
 const called=calls;assert.equal((await route.POST(request('hub/final-prompt/recover',payload,ownerHeaders))).status,200);assert.equal(calls,called);
});
`);
console.log('Added authenticated final prompt recovery.');
