import * as fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
export function createTrashPurge({db,data,getJob,save,pendingThumbnail=()=>false,files=fs}){
 const snapshot=j=>JSON.stringify({id:j.id,deletedAt:j.deletedAt,updated:j.updated,assets:j.assets});
 function prepare(ids){
  if(!Array.isArray(ids)||!ids.length||ids.length>100||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id)))throw Error('삭제할 휴지통 결과를 선택해 주세요.');
  const selected=ids.map(getJob);if(selected.some(j=>!j||j.state!=='complete'||!j.deletedAt||j.purgedAt))throw Error('휴지통에 있는 완료 결과만 영구 삭제할 수 있습니다.');
  for(const j of selected)for(const a of j.assets||[])if(!new RegExp('^'+j.id+'-\\d+\\.(png|jpg|jpeg|webp|mp4|webm|html|txt|json|srt)$').test(a.filename))throw Error('결과 파일의 소유 관계를 확인할 수 없습니다.');
  return {ids:[...ids],snapshots:selected.map(snapshot)};
 }
 function execute(plan){
  const stage=path.resolve(data,'.purge-'+randomUUID()),moved=[];let committed=false;
  db.exec('BEGIN IMMEDIATE');try{
   const current=prepare(plan.ids);if(JSON.stringify(current.snapshots)!==JSON.stringify(plan.snapshots))throw Error('선택한 결과가 바뀌었습니다. 다시 확인해 주세요.');
   const selected=plan.ids.map(getJob);if(selected.some(j=>(j.assets||[]).some(a=>pendingThumbnail(a.filename))))throw Error('결과 미리보기를 준비 중입니다. 잠시 후 다시 시도하세요.');
   files.mkdirSync(stage,{recursive:false});
   for(const j of selected)for(const a of j.assets||[])for(const [directory,name]of [['results',a.filename],['thumbnails',a.filename+'.jpg']]){
    const parent=path.resolve(data,directory),source=path.join(parent,name);if(!files.existsSync(source))continue;
    if(files.realpathSync(parent).toLowerCase()!==parent.toLowerCase()||files.lstatSync(source).isSymbolicLink())throw Error('결과 파일 위치를 확인할 수 없습니다.');
    const target=path.join(stage,String(moved.length));files.renameSync(source,target);moved.push({source,target});
   }
   const stamp=Date.now();for(const j of selected){save({...j,purgedAt:stamp,assets:[],result:undefined,prompt:'',negative:'',originalPrompt:undefined,originalNegative:undefined,favorite:false,message:'휴지통에서 영구 삭제했습니다.'});db.prepare('DELETE FROM gallery_order WHERE id=?').run(j.id);}
   db.exec('COMMIT');committed=true;
  }catch(e){db.exec('ROLLBACK');let restored=true;for(const m of moved.reverse()){try{files.renameSync(m.target,m.source);}catch{restored=false;}}try{files.rmdirSync(stage);}catch{}if(!restored)throw Error('삭제를 완료하지 못했습니다. 보관 파일 복구 확인이 필요합니다.');throw e;}
  let cleanupPending=false;if(committed){for(const m of moved){try{files.unlinkSync(m.target);}catch{cleanupPending=true;}}try{files.rmdirSync(stage);}catch{cleanupPending=true;}}
  return {ok:true,count:plan.ids.length,cleanupPending};
 }
 return {prepare,execute};
}
