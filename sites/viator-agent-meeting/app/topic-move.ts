import {database,ensureStudioSchema,HubError,project,stamp,text,uid} from './hub-core';
import {roomMoveStatements} from './topic-move-data';
export async function moveTopic(actor:string,sourceValue:unknown,targetValue:unknown,roomValue:unknown){
 await ensureStudioSchema();const source=await project(sourceValue),target=await project(targetValue),room=text(roomValue,'주제 ID',100),db=database();
 const existing=await db.prepare("SELECT id,project,status FROM hub_rooms WHERE id=? AND status!='deleted'").bind(room).first<{id:string;project:string;status:string}>();
 if(!existing)throw new HubError(404,'이동할 주제를 찾을 수 없습니다.');
 if(existing.project===target)return {ok:true,moved:false,roomId:room,sourceProject:source,projectId:target};
 if(existing.project!==source)throw new HubError(409,'주제 위치가 변경됐습니다. 목록을 새로고침해주세요.');
 const rows=await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{name:string}>(),tables=new Set(rows.results.map(row=>row.name));
 const changes=await db.batch(roomMoveStatements({room,source,target,actor,id:uid(),now:stamp(),nowMs:Date.now(),tables}).map(statement=>db.prepare(statement.sql).bind(...statement.args)));
 if(!changes[0].meta.changes)throw new HubError(409,'주제 위치가 변경됐거나 프로젝트가 삭제됐습니다. 목록을 새로고침한 뒤 다시 이동해주세요.');
 return {ok:true,moved:true,roomId:room,sourceProject:source,projectId:target};
}
