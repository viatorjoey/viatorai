import webpush from 'web-push';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
export function createPushService(db,data,source){
 db.exec("CREATE TABLE IF NOT EXISTS push_subs(endpoint TEXT PRIMARY KEY,body TEXT,completeRead INTEGER,errorRead INTEGER); CREATE TABLE IF NOT EXISTS push_events(id TEXT PRIMARY KEY,kind TEXT,created INTEGER,title TEXT,body TEXT); CREATE TABLE IF NOT EXISTS push_delivery(endpoint TEXT,event TEXT,PRIMARY KEY(endpoint,event)); CREATE TABLE IF NOT EXISTS push_observed(id TEXT PRIMARY KEY,state TEXT)");
 const keyFile=path.join(data,'push-vapid.json');let keys;
 if(existsSync(keyFile))keys=JSON.parse(readFileSync(keyFile,'utf8'));else{keys=webpush.generateVAPIDKeys();try{writeFileSync(keyFile,JSON.stringify(keys),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;keys=JSON.parse(readFileSync(keyFile,'utf8'));}}
 webpush.setVapidDetails('https://studio.example.invalid',keys.publicKey,keys.privateKey);
 // Existing terminal results are a baseline, not new notifications on deployment.
 for(const j of source())db.prepare('INSERT OR IGNORE INTO push_observed VALUES(?,?)').run(j.id,j.state);
 const unread=sub=>db.prepare('SELECT * FROM push_events WHERE (kind=? AND created>?) OR (kind=? AND created>?) ORDER BY created DESC LIMIT 100').all('complete',sub.completeRead,'error',sub.errorRead);
 let busy=false;
 async function scan(){if(busy)return;busy=true;try{
  for(const j of source()){
   const old=db.prepare('SELECT state FROM push_observed WHERE id=?').get(j.id);
   if(old?.state===j.state)continue;
   db.prepare('INSERT OR REPLACE INTO push_observed VALUES(?,?)').run(j.id,j.state);
   if(!['complete','blocked','failed'].includes(j.state))continue;
   const kind=j.state==='complete'?'complete':'error',title=j.mode==='memory-clean'?'VRAM 정리':j.type==='maintenance'?'ComfyUI 재시작':kind==='complete'?'생성 완료':'생성 오류';
   db.prepare('INSERT OR IGNORE INTO push_events VALUES(?,?,?,?,?)').run(j.id+':'+j.state,kind,Date.now(),title,j.message||title);
  }
  for(const sub of db.prepare('SELECT * FROM push_subs').all()){
   const items=unread(sub),pending=items.filter(e=>!db.prepare('SELECT 1 FROM push_delivery WHERE endpoint=? AND event=?').get(sub.endpoint,e.id));if(!pending.length)continue;
   const e=pending[0];try{await webpush.sendNotification(JSON.parse(sub.body),JSON.stringify({title:e.title,body:e.body,badge:items.length,url:e.kind==='error'?'/?view=queue':'/?view=gallery'}),{TTL:86400,timeout:10000});for(const e of pending)db.prepare('INSERT OR IGNORE INTO push_delivery VALUES(?,?)').run(sub.endpoint,e.id);}catch(err){if([404,410].includes(err.statusCode))db.prepare('DELETE FROM push_subs WHERE endpoint=?').run(sub.endpoint);}
  }
 }finally{busy=false;}}
 return {publicKey:keys.publicKey,scan,
  subscribe(s){let u;try{u=new URL(s.endpoint);}catch{throw Error('알림 구독 주소가 올바르지 않습니다.');}if(u.protocol!=='https:'||!(/(^|\.)push\.apple\.com$/.test(u.hostname)||u.hostname==='fcm.googleapis.com'||/(^|\.)notify\.windows\.com$/.test(u.hostname)||/(^|\.)push\.services\.mozilla\.com$/.test(u.hostname))||u.port||u.username||u.password||typeof s.keys?.p256dh!=='string'||typeof s.keys?.auth!=='string'||Buffer.from(s.keys.p256dh,'base64url').length!==65||Buffer.from(s.keys.auth,'base64url').length!==16)throw Error('지원되는 브라우저 알림 구독을 확인해 주세요.');db.prepare('INSERT INTO push_subs VALUES(?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET body=excluded.body').run(s.endpoint,JSON.stringify(s),Date.now(),Date.now());},
  read(endpoint,kind){const field=kind==='complete'?'completeRead':kind==='error'?'errorRead':null;if(field)db.prepare('UPDATE push_subs SET '+field+'=? WHERE endpoint=?').run(Date.now(),endpoint);else db.prepare('UPDATE push_subs SET completeRead=?,errorRead=? WHERE endpoint=?').run(Date.now(),Date.now(),endpoint);},
  events:()=>db.prepare('SELECT * FROM push_events ORDER BY created DESC LIMIT 30').all()
 };
}
