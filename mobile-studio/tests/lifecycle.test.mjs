import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {managedChat,unloadModels} from '../gpu-lifecycle.mjs';
import {createChatStore,CHAT_TTL} from '../chat-store.mjs';
test('LLM completion and failure both unload the exact model before returning',async()=>{
 for(const fail of [false,true]){const calls=[],intent=[];const request=async(p,b)=>{calls.push([p,b]);if(p==='/api/chat'){if(fail)throw Error('LLM failure');return {done:true,message:{content:'hello'}};}return p==='/api/ps'?{models:[]}:{};};
  const work=managedChat(request,{model:'qwen3.5:9b',options:{num_ctx:2048}},x=>intent.push(x));if(fail)await assert.rejects(work,/LLM failure/);else assert.equal((await work).done,true);
  assert.deepEqual(calls.map(x=>x[0]),['/api/chat','/api/generate','/api/ps']);assert.equal(calls[0][1].keep_alive,0);assert.equal(calls[0][1].options.num_ctx,2048);assert.deepEqual(calls[1][1],{model:'qwen3.5:9b',keep_alive:0});assert.deepEqual(intent,[true,false]);
 }
});
test('an unload error fails closed instead of allowing another model',async()=>{await assert.rejects(unloadModels(async()=>{throw Error('unload failed');},['gpt-oss:20b']),/unload failed/);});
test('five-day retention uses explicit viewing, protects pending answers and ignores background reads',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE jobs(id TEXT,state TEXT,body TEXT)');const store=createChatStore(db),a=store.create('qwen3.5:9b'),b=store.create('gpt-oss:20b'),c=store.create('qwen3.5:9b');const now=Date.now();
 for(const x of [a,b,c]){x.viewed=now-CHAT_TTL-1000;store.put(x);}
 db.prepare('INSERT INTO jobs VALUES(?,?,?)').run('pending','running',JSON.stringify({chatId:b.id}));store.get(c.id,true);const old=store.get(a.id).viewed;store.get(a.id);assert.equal(store.get(a.id).viewed,old);
 store.prune(now);assert.equal(store.get(a.id),null);assert(store.get(b.id));assert(store.get(c.id));
 db.prepare('UPDATE jobs SET state=?').run('complete');store.prune(now);assert.equal(store.get(b.id),null);db.close();
});
