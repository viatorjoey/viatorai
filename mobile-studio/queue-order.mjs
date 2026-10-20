export function createQueueOrder(db,{now=Date.now}={}){
 db.exec('CREATE TABLE IF NOT EXISTS queue_order(id TEXT PRIMARY KEY,position INTEGER NOT NULL,prioritized INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS queue_reservations(id TEXT PRIMARY KEY,expires INTEGER NOT NULL)');
 const eligible="state='queued' AND coalesce(json_extract(body,'$.chatLane'),'gpu')!='cpu' AND coalesce(json_extract(body,'$.refineOnly'),0)=0 AND coalesce(json_extract(body,'$.executionLane'),'gpu') NOT IN ('cloud','design','content')";
 const ordered=()=>db.prepare(`SELECT id,body FROM jobs WHERE ${eligible} ORDER BY coalesce((SELECT position FROM queue_order WHERE queue_order.id=jobs.id),2147483647),created,id`).all();
 const reserved=id=>!!db.prepare('SELECT 1 FROM queue_reservations WHERE id=? AND expires>?').get(id,now());
 function set(ids){
  if(!Array.isArray(ids)||!ids.length||ids.length>500||ids.some(id=>typeof id!=='string'||!id||id.length>100)||new Set(ids).size!==ids.length)throw Error('우선 처리할 대기 작업을 순서대로 선택해 주세요.');
  db.exec('BEGIN IMMEDIATE');try{
   const rows=ordered(),eligibleIds=new Set(rows.map(r=>r.id));
   if(ids.some(id=>!eligibleIds.has(id)||reserved(id)))throw Error('선택한 작업이 이미 시작되었거나 바뀌었습니다. 목록을 다시 확인해 주세요.');
   const selected=new Set(ids),order=[...ids,...rows.map(r=>r.id).filter(id=>!selected.has(id))];
   db.exec('DELETE FROM queue_order');const insert=db.prepare('INSERT INTO queue_order VALUES(?,?,?)');order.forEach((id,index)=>insert.run(id,index,selected.has(id)?1:0));
   db.exec('COMMIT');return {ids,order};
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 function claimNext(){
  db.exec('BEGIN IMMEDIATE');try{
   const row=ordered().find(r=>!reserved(r.id));
   if(row)db.prepare('INSERT OR REPLACE INTO queue_reservations VALUES(?,?)').run(row.id,now()+60000);
   db.exec('COMMIT');return row;
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 function fields(id){const r=db.prepare('SELECT position,prioritized FROM queue_order WHERE id=?').get(id);return {queuePosition:r?.position??null,queuePrioritized:r?.prioritized===1,queueReserved:reserved(id)};}
 function release(id){db.prepare('DELETE FROM queue_reservations WHERE id=?').run(id);}
 return {set,claimNext,fields,release};
}
