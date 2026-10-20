import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const wait=ms=>new Promise(r=>setTimeout(r,ms));
const configs=await Promise.all(process.argv.slice(2).map(async path=>JSON.parse(await readFile(path,'utf8'))));
if(!configs.length)throw Error('사용법: node studio-bridge.mjs viator-studio-sandbox.private.json');

function localRequestId(config,job){if(/^[a-f0-9-]{36}$/.test(job.studio_job_id||''))return job.studio_job_id;const hex=createHash('sha256').update(JSON.stringify(['viator-studio-bridge-v1',config.origin,config.project,job.id])).digest('hex').slice(0,32).split('');hex[12]='8';hex[16]='8';const h=hex.join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}

async function json(url,options={}){
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(125000)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||`${response.status} ${url}`);
  return {data,response};
}
async function localSession(config){
  const {response}=await json(`${config.localOrigin}/api/local-session`,{method:'POST'});
  const cookie=(response.headers.get('set-cookie')||'').split(';')[0];
  if(!cookie)throw Error('스튜디오 로컬 세션을 열지 못했습니다.');
  return cookie;
}
async function cloud(config,path,body){
  return (await json(`${config.origin}${path}`,{method:'POST',headers:{...config.headers,'Content-Type':'application/json'},body:JSON.stringify({...body,projectId:config.project})})).data;
}
async function referenceImage(config,job){
  if(!job.reference?.url)return null;
  const target=new URL(job.reference.url,config.origin);target.searchParams.set('projectId',config.project);
  const response=await fetch(target,{headers:config.headers,signal:AbortSignal.timeout(125000)});
  if(!response.ok)throw Error(`기준 사진을 받지 못했습니다 (${response.status}).`);
  const mime=response.headers.get('content-type')||job.reference.mime||'image/png',bytes=new Uint8Array(await response.arrayBuffer());
  return {name:job.reference.name||'reference-image',mime,data:Buffer.from(bytes).toString('base64'),dataUrl:`data:${mime};base64,${Buffer.from(bytes).toString('base64')}`};
}
async function uploadAsset(config,cookie,job,asset,index){
  const source=typeof asset==='string'?asset:asset?.url;
  if(!source)throw Error('완성 파일 주소를 찾을 수 없습니다.');
  const localUrl=new URL(source,config.localOrigin).toString();
  const local=await fetch(localUrl,{headers:{Cookie:cookie},signal:AbortSignal.timeout(125000)});
  if(!local.ok)throw Error(`완성 파일을 읽지 못했습니다 (${local.status}).`);
  const mime=local.headers.get('content-type')||asset?.mime||asset?.contentType||(job.mode==='text-image'?'image/png':'video/mp4');
  const filename=String(asset?.filename||source.split('/').at(-1)?.split('?')[0]||`result-${index+1}`).slice(0,180);
  const target=new URL(`${config.origin}/api/studio/asset`);
  target.searchParams.set('projectId',config.project);target.searchParams.set('jobId',job.id);target.searchParams.set('leaseId',job.lease_id);target.searchParams.set('index',String(index));target.searchParams.set('filename',filename);
  const response=await fetch(target,{method:'PUT',headers:{...config.headers,'Content-Type':mime},body:await local.arrayBuffer(),signal:AbortSignal.timeout(125000)});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||`결과 업로드 오류 (${response.status})`);return data.asset;
}
async function chooseModel(config,cookie,job){
  if(job.model&&job.model!=='studio')return /^(chatgpt-image|gpt-image)/.test(job.model)?'openai:'+job.model:job.model;
  const models=(await json(`${config.localOrigin}/api/models`,{headers:{Cookie:cookie}})).data;
  const list=Array.isArray(models)?models:(models.models||[]);
  const supports=m=>!m.modes||m.modes.includes(job.mode)||m.mode===job.mode;
  const preferred=job.mode==='text-image'&&list.find(m=>String(m.id||m.name).includes('z_image_turbo')&&supports(m));
  const found=preferred||list.find(supports);
  if(!found)throw Error(`${job.mode} 제작 모델을 찾을 수 없습니다.`);
  return found.id||found.name;
}
async function run(config,job){
  let cookie,studioJobId;
  try{
    cookie=await localSession(config);
    const model=await chooseModel(config,cookie,job);
    const reference=await referenceImage(config,job);
    const payload={mode:job.mode,model,enhance:false,prompt:job.prompt,negative:job.negative||'',aspect:job.aspect||'16:9',quality:job.quality||'high',resolution:job.resolution||undefined,duration:job.mode==='text-image'?undefined:(job.duration||10),seed:job.seed??42,guidance:job.guidance??1,...(reference?{referenceImage:{name:reference.name,mime:reference.mime,data:reference.data},inputImage:reference.dataUrl}:{})};
    const submitted=(await json(`${config.localOrigin}/api/jobs`,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','Idempotency-Key':localRequestId(config,job)},body:JSON.stringify(payload)})).data;
    studioJobId=String(submitted.id||submitted.job?.id||submitted.jobId||'');
    if(!studioJobId)throw Error('스튜디오가 작업 번호를 반환하지 않았습니다.');
    await cloud(config,'/api/studio/result',{jobId:job.id,leaseId:job.lease_id,status:'running',studioJobId});
    for(;;){
      await wait(2000);
      const jobs=(await json(`${config.localOrigin}/api/jobs`,{headers:{Cookie:cookie}})).data;
      const list=Array.isArray(jobs)?jobs:(jobs.jobs||[]),current=list.find(x=>String(x.id)===studioJobId);
      if(!current)continue;
      const state=current.state||current.status;
      if(state==='complete'){
        const localAssets=current.assets||[];
        if(!localAssets.length)throw Error('스튜디오 작업은 완료됐지만 결과 파일이 없습니다.');
        const assets=[];for(const [index,asset] of localAssets.entries())assets.push(await uploadAsset(config,cookie,job,asset,index));
        return cloud(config,'/api/studio/result',{jobId:job.id,leaseId:job.lease_id,status:'complete',studioJobId,result:{status:state,assets,completedAt:current.completedAt||new Date().toISOString(),mode:job.mode}});
      }
      if(['blocked','cancelled','failed'].includes(state))throw Error(current.error||current.message||`스튜디오 작업이 ${state} 상태로 끝났습니다.`);
      await cloud(config,'/api/studio/result',{jobId:job.id,leaseId:job.lease_id,status:'running',studioJobId});
    }
  }catch(error){
    await cloud(config,'/api/studio/result',{jobId:job.id,leaseId:job.lease_id,status:'blocked',studioJobId,error:String(error?.message||error).slice(0,1000)}).catch(()=>{});
  }
}

console.log(`VIATOR Studio Bridge 시작: ${configs.map(c=>c.project).join(', ')}`);
for(;;){
  for(const config of configs){
    try{const {job}=await cloud(config,'/api/studio/pull',{});if(job)await run(config,job);else await cloud(config,'/api/studio/heartbeat',{});}catch(error){console.error(`[${config.project}] ${String(error?.message||error)}`);}
  }
  await wait(Math.max(1000,Math.min(...configs.map(c=>(c.pollSeconds||2)*1000))));
}
