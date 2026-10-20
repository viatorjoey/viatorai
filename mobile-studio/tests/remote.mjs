// Pairing code and cookies remain in process memory; never write them to logs or files.
import {writeFileSync} from 'node:fs';
const local='http://localhost:8799',remote='https://studio.example.invalid';
const lr=await fetch(local+'/api/local-session',{method:'POST',headers:{Origin:local,'Content-Type':'application/json'},body:'{}'});
if(lr.status!==200)throw Error('Local session failed');
const localCookie=lr.headers.get('set-cookie').split(';')[0];
const setup=await(await fetch(local+'/api/setup',{headers:{Cookie:localCookie}})).json();
if(!setup.pairCode)throw Error('Local pairing code unavailable');
const pair=await fetch(remote+'/api/pair',{method:'POST',headers:{Origin:remote,'Content-Type':'application/json'},body:JSON.stringify({code:setup.pairCode})});
if(pair.status!==200)throw Error('HTTPS pairing failed: '+pair.status);
const sc=pair.headers.get('set-cookie');if(!sc?.includes('Secure')||!sc.includes('HttpOnly')||!sc.includes('SameSite=Strict'))throw Error('Cookie protection missing');
const cookie=sc.split(';')[0];
const pending=['/app.js'],loaded=new Set();while(pending.length){const asset=pending.pop();if(loaded.has(asset))continue;const response=await fetch(remote+asset);if(!response.ok||!response.headers.get('content-type')?.includes('javascript'))throw Error('HTTPS UI module failed: '+asset+' '+response.status);loaded.add(asset);const source=await response.text();for(const match of source.matchAll(/from\s*['"](\.\/[^'"]+\.js)['"]/g))pending.push(new URL(match[1],remote+asset).pathname);}
const runtime=await(await fetch(remote+'/api/runtime',{headers:{Cookie:cookie}})).json();if(runtime.worker!==false)throw Error('HTTPS must target the web server, not the GPU worker');
const [status,rr,sr]=await Promise.all([fetch(remote+'/api/status',{headers:{Cookie:cookie}}),fetch(remote+'/api/jobs',{headers:{Cookie:cookie}}),fetch(remote+'/api/setup',{headers:{Cookie:cookie}})]);
if(status.status!==200||rr.status!==200||sr.status!==200)throw Error('Authenticated HTTPS route failed');
const rs=await sr.json();if(rs.pairCode!==undefined||rs.remoteReady!==true)throw Error('Remote setup boundary failed');
const all=await rr.json(),job=all.find(j=>j.state==='complete'&&!j.deletedAt&&j.assets?.some(a=>a.kind==='video'));
const media=await fetch(remote+job.assets.find(a=>a.kind==='video').url,{headers:{Cookie:cookie,Range:'bytes=0-31'}});if(media.status!==206||(await media.arrayBuffer()).byteLength!==32)throw Error('HTTPS video range failed');
const report={url:remote,tls:'verified',pairing:'passed',sessionCookie:'Secure HttpOnly SameSite=Strict',authenticatedAPI:'passed',uiModules:loaded.size,webServerRoute:'8799 verified',remotePairCode:'not exposed',videoRange:'206 / 32 bytes',iphonePhysicalTest:'pending'};
writeFileSync(new URL('../data/remote-test-results.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
