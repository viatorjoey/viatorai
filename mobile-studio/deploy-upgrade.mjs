// Drain only this PWA's work; never cancel GPU jobs or change A/B workflows.
import {DatabaseSync} from 'node:sqlite';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url)),db=new DatabaseSync(path.join(root,'data/studio.sqlite'));db.exec('PRAGMA busy_timeout=5000');
let stable=0;const end=Date.now()+3*3600000;
console.log('New PWA requests are held for deployment; existing jobs keep running.');
while(Date.now()<end){
 db.prepare("UPDATE jobs SET state='upgrade_wait' WHERE state='queued'").run();
 const active=db.prepare("SELECT count(*) AS n FROM jobs WHERE state IN ('running','submitting','cleaning','releasing')").get().n;
 stable=active?0:stable+1;if(stable>=15)break;await new Promise(r=>setTimeout(r,1000));
}
if(stable<15){throw Error('Deployment deferred: work is still active. Requests remain preserved for the new worker.');}
try{
 const command="$ErrorActionPreference='Stop'; $l=Get-NetTCPConnection -LocalPort 8787 -State Listen; $p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$l.OwningProcess); if($p.CommandLine -notlike '*mobile-studio*server.mjs*'){throw 'Owned PWA not verified'}; Stop-Process -Id $p.ProcessId";
 execFileSync('powershell.exe',['-NoProfile','-Command',command],{windowsHide:true});
}finally{db.close();}
execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'start.ps1')],{windowsHide:true,stdio:'inherit'});
console.log('DEPLOYED');
