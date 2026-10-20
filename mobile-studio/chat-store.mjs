import {randomUUID} from 'node:crypto';
export const CHAT_TTL=5*86400000;
export function createChatStore(db){
 db.exec('CREATE TABLE IF NOT EXISTS chats(id TEXT PRIMARY KEY,title TEXT,model TEXT,viewed INTEGER,body TEXT)');
 const parse=r=>r?({...r,messages:JSON.parse(r.body),body:undefined}):null;
 return {
  prune(now=Date.now()){db.prepare("DELETE FROM chats WHERE viewed<? AND id NOT IN (SELECT json_extract(body,'$.chatId') FROM jobs WHERE json_extract(body,'$.chatId') IS NOT NULL AND state NOT IN ('complete','cancelled','blocked'))").run(now-CHAT_TTL);},
  list(){return db.prepare('SELECT id,title,model,viewed FROM chats ORDER BY viewed DESC').all();},
  get(id,touch=false){if(touch)db.prepare('UPDATE chats SET viewed=? WHERE id=?').run(Date.now(),id);return parse(db.prepare('SELECT * FROM chats WHERE id=?').get(id));},
  create(model){const id=randomUUID();db.prepare('INSERT INTO chats VALUES(?,?,?,?,?)').run(id,'새 채팅',model,Date.now(),'[]');return this.get(id);},
  put(c,touch=false){db.prepare('UPDATE chats SET title=?,model=?,viewed=?,body=? WHERE id=?').run(c.title,c.model,touch?Date.now():c.viewed,JSON.stringify(c.messages),c.id);},
  remove(id){db.prepare('DELETE FROM chats WHERE id=?').run(id);}
 };
}
