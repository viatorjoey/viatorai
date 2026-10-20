import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
const local=JSON.parse(readFileSync('data/supervisor-status.json','utf8'));
const remote=await (await fetch('http://127.0.0.1:8801/health',{signal:AbortSignal.timeout(3000)})).json();
if(remote.pid!==local.pid)throw Error('Supervisor changed');
for(const name of ['worker','web']){const service=remote.services.find(x=>x.name===name),saved=local.services.find(x=>x.name===name);if(!service?.ready||service.pid!==saved?.pid)throw Error('Service ownership changed');}
const db=new DatabaseSync('data/studio.sqlite',{readOnly:true});const active=db.prepare("SELECT count(*) n FROM jobs WHERE state NOT IN ('blocked','cancelled','complete')").get().n;db.close();
if(active)throw Error('Active jobs exist; restart deferred');
for(const name of ['worker','web'])process.kill(remote.services.find(x=>x.name===name).pid,'SIGTERM');
console.log('Idle Studio worker and web refreshed through their existing supervisor.');
