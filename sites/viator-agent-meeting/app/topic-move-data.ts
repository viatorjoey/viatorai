type Statement={sql:string;args:(string|number)[]};
export const ROOM_PROJECT_TABLES=['hub_messages','hub_deliveries','hub_room_memory','hub_production_jobs','hub_publication_jobs','hub_meeting_reports','hub_action_items','hub_studio_progress','hub_studio_progress_reports','hub_api_participants','hub_meeting_documents','hub_notice_events','hub_voice_topics'];
export function roomMoveStatements({room,source,target,actor,id,now,nowMs,tables}:{room:string;source:string;target:string;actor:string;id:string;now:string;nowMs:number;tables:Set<string>}):Statement[]{
 const guards=["r.status!='deleted'","NOT EXISTS(SELECT 1 FROM hub_project_archives WHERE id IN (?,?))"];
 const gate='EXISTS(SELECT 1 FROM hub_audit WHERE id=?)';
 const statements:Statement[]=[{sql:"INSERT INTO hub_audit(id,actor,project,action,target,created_at) SELECT ?,?,?,'room.move',?,? WHERE EXISTS(SELECT 1 FROM hub_rooms r WHERE r.id=? AND r.project=? AND "+guards.join(' AND ')+')',args:[id,actor,target,room,now,room,source,source,target]}];
 // Store the original R2 namespace; videos/images are not copied or regenerated.
 if(tables.has('hub_production_jobs')){
  statements.push({sql:"INSERT OR IGNORE INTO hub_asset_namespaces(project,kind,id,storage_project) SELECT ?,'production',j.id,COALESCE((SELECT storage_project FROM hub_asset_namespaces WHERE project=? AND kind='production' AND id=j.id),?) FROM hub_production_jobs j WHERE j.room_id=? AND j.project=? AND "+gate,args:[target,source,source,room,source,id]});
  statements.push({sql:"INSERT OR IGNORE INTO hub_asset_namespaces(project,kind,id,storage_project) SELECT ?,'reference',json_extract(j.result,'$.reference.id'),COALESCE((SELECT storage_project FROM hub_asset_namespaces WHERE project=? AND kind='reference' AND id=json_extract(j.result,'$.reference.id')),?) FROM hub_production_jobs j WHERE j.room_id=? AND j.project=? AND json_valid(j.result) AND json_extract(j.result,'$.reference.id') IS NOT NULL AND "+gate,args:[target,source,source,room,source,id]});
 }
 // Keep the existing authenticated worker attached to this room only. Leases,
 // provider operation IDs and status are unchanged, so moving never resubmits work.
 statements.push({sql:'INSERT OR IGNORE INTO hub_room_origins(room_id,project) SELECT ?,? WHERE '+gate,args:[room,source,id]});
 // Late asynchronous replies must land in the room's current folder, even when
 // the provider call began before a move. Install only for existing tables.
 for(const table of ROOM_PROJECT_TABLES)if(tables.has(table))for(const operation of ['INSERT','UPDATE OF project'])statements.push({sql:`CREATE TRIGGER IF NOT EXISTS ${table}_follow_room_${operation==='INSERT'?'insert':'update'} AFTER ${operation} ON ${table} WHEN EXISTS(SELECT 1 FROM hub_rooms WHERE id=NEW.room_id AND project!=NEW.project) BEGIN UPDATE ${table} SET project=(SELECT project FROM hub_rooms WHERE id=NEW.room_id) WHERE rowid=NEW.rowid; END`,args:[]});
 statements.push({sql:'UPDATE hub_rooms SET project=?,updated_at=? WHERE id=? AND project=? AND '+gate,args:[target,now,room,source,id]});
 for(const table of ROOM_PROJECT_TABLES)if(tables.has(table))statements.push({sql:'UPDATE '+table+' SET project=? WHERE room_id=? AND project=? AND '+gate,args:[target,room,source,id]});
 return statements;
}
export function rebaseAssetLinks(value:any,project:string):any{
 if(Array.isArray(value))return value.map(item=>rebaseAssetLinks(item,project));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,rebaseAssetLinks(item,project)]));
 if(typeof value!=='string'||!value.includes('/api/hub/production/'))return value;
 try{const url=new URL(value,'https://viator-agent-meeting.viator-joey.chatgpt.site');if(url.origin!=='https://viator-agent-meeting.viator-joey.chatgpt.site'||!['/api/hub/production/asset','/api/hub/production/reference'].includes(url.pathname))return value;url.searchParams.set('project',project);return value.startsWith('/')?url.pathname+url.search+url.hash:url.href;}catch{return value;}
}
