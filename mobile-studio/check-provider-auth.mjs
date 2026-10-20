import {providerVault} from './provider-vault.mjs';
import {DatabaseSync} from 'node:sqlite';
const vault=providerVault('data'),key=await vault.get('xai');
const metadata={configured:!!key,hasXaiPrefix:!!key?.startsWith('xai-'),otherProviderMatch:[]};
for(const p of ['gemini','anthropic','openai']){const other=await vault.get(p);if(key&&other===key)metadata.otherProviderMatch.push(p);}
if(key){const r=await fetch('https://api.x.ai/v1/models',{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(20000)});const d=await r.json();const error=typeof d.error==='string'?d.error:d.error?.message||d.message||'';metadata.httpStatus=r.status;metadata.reason=String(error).split(key).join('[비공개]').replace(/xai-[\w-]+|sk-[\w-]+|AIza[\w-]+|AQ[\w.-]{20,}/g,'[비공개]').slice(0,400);metadata.models=r.ok&&Array.isArray(d.data)?d.data.map(m=>m.id).filter(id=>id.includes('imagine')):[];}
const db=new DatabaseSync('data/studio.sqlite',{readOnly:true});
const latest=db.prepare("SELECT id,state,body FROM jobs WHERE json_extract(body,'$.executionLane')='cloud' ORDER BY created DESC LIMIT 8").all().map(r=>{const j=JSON.parse(r.body);return {id:r.id,state:r.state,mode:j.mode,provider:j.provider,message:j.message,diagnostics:j.cloudDiagnostics};});
console.log(JSON.stringify({xai:metadata,latest},null,2));db.close();
