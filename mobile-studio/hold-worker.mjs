import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {writeFileSync} from 'node:fs';
writeFileSync(new URL('./data/worker-v2.json',import.meta.url),JSON.stringify({version:0,pid:process.pid}));
const db=new DatabaseSync(fileURLToPath(new URL('./data/studio.sqlite',import.meta.url)));
db.exec('PRAGMA busy_timeout=5000');
db.prepare("UPDATE jobs SET state='upgrade_wait' WHERE state='queued'").run();
const n=db.prepare("SELECT count(*) AS n FROM jobs WHERE state IN ('running','submitting','cleaning','releasing') AND coalesce(json_extract(body,'$.chatLane'),'gpu')!='cpu'").get().n;
db.close();if(n){console.log('Active jobs: '+n+'. Queued requests preserved.');process.exit(2);}console.log('Worker idle; queued requests preserved.');
