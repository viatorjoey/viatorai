// Local observation writer. Input contains balances/status only; never credentials.
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createCreditBalances} from './credit-balances.mjs';
const chunks=[];for await(const chunk of process.stdin){chunks.push(chunk);if(chunks.reduce((n,b)=>n+b.length,0)>16384)throw Error('확인 결과가 너무 큽니다.');}
const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
const data=process.env.STUDIO_DATA_DIR||path.join(path.dirname(fileURLToPath(import.meta.url)),'data');
const db=new DatabaseSync(path.join(data,'studio.sqlite'));
db.exec('PRAGMA busy_timeout=5000');
try{const store=createCreditBalances(db);if(input.monitor)store.setMonitor(input.monitor);if(input.observations)store.update(input.observations);console.log(JSON.stringify(store.snapshot()));}finally{db.close();}
