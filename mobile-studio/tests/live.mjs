// Explicit live checks against the owned app. Session cookies stay in memory and are never printed.
import {readFileSync,writeFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';
const base='http://localhost:8787';let cookie='';
async function call(p,options={}){const r=await fetch(base+p,{...options,headers:{Cookie:cookie,...options.headers}});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r;}
let r=await call('/api/jobs');if(r.status!==401)throw Error('Anonymous access was not denied');
r=await call('/api/local-session',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}'});if(r.status!==200)throw Error('Local pairing failed');
r=await call('/api/jobs',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:'{}'});if(r.status!==403)throw Error('Cross-origin mutation accepted');
r=await call('/api/results/%2e%2e%2fserver.mjs');if(r.status!==404)throw Error('Traversal guard failed');
const list=await(await call('/api/jobs')).json();
if(process.argv[2]==='reconcile'){const j=list.find(j=>j.state==='blocked');if(!j)throw Error('No blocked test job');const rr=await call('/api/reconcile/'+j.id,{method:'POST',headers:{Origin:base},body:'{}'});console.log(JSON.stringify({job:j.id,status:rr.status,result:await rr.json()}));process.exit(0);}
if(process.argv[2]==='status'){console.log(JSON.stringify(list.map(({id,state,message,executionId,promptId,assets,cleanup,result})=>({id,state,message,executionId,promptId,assets,cleanup,result})),null,2));process.exit(0);}
if(process.argv[2]==='submit'){
 const mode=process.argv[3],source=list.find(j=>j.mode==='text-image'&&j.state==='complete');if(!source)throw Error('A verified test image is needed first');
 let uploadId=null;if(mode.startsWith('image-')){const file=new URL('../data/results/'+source.assets[0].filename,import.meta.url),rr=await call('/api/uploads',{method:'POST',headers:{Origin:base,'Content-Type':'image/png'},body:readFileSync(file)});if(rr.status!==201)throw Error('Photo upload failed');uploadId=(await rr.json()).id;}
 const id=randomUUID(),payload={mode,prompt:mode==='image-text'?'사진 속 풍경을 설명해 주세요.':'A quiet mountain lake at sunrise, subtle mist drifting slowly, gentle cinematic camera movement, stable natural scenery, no text, no people.',negative:'text, watermark, flicker, distortion',aspect:'9:16',quality:'draft',duration:2,seed:42,guidance:1,uploadId};
 const opts={method:'POST',headers:{Origin:base,'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify(payload)};
 const first=await call('/api/jobs',opts);if(first.status!==202)throw Error('Submission failed: '+await first.text());const second=await call('/api/jobs',opts);if(second.status!==200||(await second.json()).id!==id)throw Error('Idempotency check failed');console.log(JSON.stringify({submitted:id,mode,idempotency:'passed'}));
}else{
 const results=[];for(const j of list.filter(j=>j.state==='complete'))for(const a of j.assets||[]){const full=await call(a.url),b=Buffer.from(await full.arrayBuffer());if(full.status!==200||b.length!==a.bytes)throw Error('Media download mismatch');const part=await call(a.url,{headers:{Range:'bytes=0-31'}});if(part.status!==206||(await part.arrayBuffer()).byteLength!==32)throw Error('Playback range failed');results.push({job:j.id,kind:a.kind,bytes:b.length,range:'passed'});}
 for(const f of ['/','/manifest.webmanifest','/sw.js','/icon-192.png','/icon-512.png'])if((await call(f)).status!==200)throw Error('PWA file missing '+f);
 const report={anonymous:'denied',crossOrigin:'denied',traversal:'denied',pwaFiles:'passed',media:results};writeFileSync(new URL('../data/live-test-results.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
