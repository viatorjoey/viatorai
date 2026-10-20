import {providerVault} from './provider-vault.mjs';
import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,existsSync,renameSync,statSync} from 'node:fs';
import path from 'node:path';
export const OPENAI_VOICES=['alloy','ash','ballad','coral','echo','fable','nova','onyx','sage','shimmer','verse','marin','cedar'];
export const GEMINI_VOICES=['Zephyr','Puck','Charon','Kore','Fenrir','Leda','Orus','Aoede','Callirrhoe','Autonoe','Enceladus','Iapetus','Umbriel','Algieba','Despina','Erinome','Algenib','Rasalgethi','Laomedeia','Achernar','Alnilam','Schedar','Gacrux','Pulcherrima','Achird','Zubenelgenubi','Vindemiatrix','Sadachbia','Sadaltager','Sulafat'];
export function normalizeVoiceGender(value){const gender=String(value||'').trim().toLowerCase();return ['female','male','neutral'].includes(gender)?gender:'unknown';}
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex'),uuid=x=>/^[a-f0-9-]{36}$/.test(x||'');
export function wav(pcm,rate=24000){const b=Buffer.alloc(44+pcm.length);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(pcm.length,40);pcm.copy(b,44);return b;}
export function pcm24k(b){
 if(b.length<44||b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE')throw Error('음성 파일 형식을 확인하지 못했습니다.');
 let format,pcm;for(let i=12;i+8<=b.length;){const type=b.toString('ascii',i,i+4),size=b.readUInt32LE(i+4),end=Math.min(b.length,i+8+size);if(type==='fmt ')format=b.subarray(i+8,end);if(type==='data')pcm=b.subarray(i+8,end);i+=8+size+(size%2);}
 if(!format||format.length<16||!pcm||format.readUInt16LE(0)!==1||format.readUInt16LE(14)!==16)throw Error('지원하는 PCM 음성 파일이 아닙니다.');
 const channels=format.readUInt16LE(2),rate=format.readUInt32LE(4);if(![1,2].includes(channels)||rate<8000||rate>96000)throw Error('음성 샘플 설정을 확인해주세요.');
 const frames=Math.floor(pcm.length/(2*channels)),count=Math.floor(frames*24000/rate);if(count<1||count>24000*120)throw Error('음성은 120초 이내로 만들어주세요.');
 const out=Buffer.alloc(count*2),sample=i=>{let value=0;for(let c=0;c<channels;c++)value+=pcm.readInt16LE((Math.min(frames-1,i)*channels+c)*2);return value/channels;};
 for(let i=0;i<count;i++){const pos=i*rate/24000,a=Math.floor(pos);out.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(sample(a)*(1-(pos-a))+sample(a+1)*(pos-a)))),i*2);}return out;
}
export function createVoiceStudio({db,data,root,jobs,getJob,save,python,execFileAsync,fetcher=fetch,vault=providerVault(data),enabled=true}){
 const dir=path.join(data,'voices');mkdirSync(dir,{recursive:true});
 db.exec('CREATE TABLE IF NOT EXISTS voice_requests(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,state TEXT NOT NULL,body TEXT NOT NULL,created INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS voice_segments(id TEXT PRIMARY KEY,file TEXT NOT NULL); CREATE TABLE IF NOT EXISTS voice_catalog(id TEXT PRIMARY KEY,body TEXT NOT NULL);');
 const active=new Set(),segmentPending=new Map();let muxBusy=false;
 const credentials=async p=>await vault.get(p)||process.env[p==='openai'?'OPENAI_API_KEY':'GEMINI_API_KEY'];
 const model=p=>p==='openai'?(process.env.OPENAI_TTS_MODEL||'gpt-4o-mini-tts'):(process.env.GEMINI_TTS_MODEL||'gemini-3.8-flash-lite-tts');
 async function catalog(refresh=false){
  const connected={openai:!!await credentials('openai'),gemini:!!await credentials('gemini')};let warning='';
  if(refresh&&connected.gemini)try{let page='';const found=[];for(let i=0;i<3;i++){const url=new URL('https://generativelanguage.googleapis.com/v1beta/voices');url.searchParams.set('page_size','100');if(page)url.searchParams.set('page_token',page);const response=await fetcher(url,{headers:{'x-goog-api-key':await credentials('gemini')},signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error();const body=await response.json();for(const v of body.voices||[])if(typeof v.id==='string'&&/^[\w-]{1,150}$/.test(v.id))found.push({id:'gemini:'+v.id,provider:'gemini',voice:v.id,name:String(v.display_name||v.id).slice(0,100),description:String(v.description||v.persona||'').slice(0,200),language:String(v.language_code||'').slice(0,30),gender:normalizeVoiceGender(v.gender)});page=body.next_page_token||'';if(!page)break;}
   db.exec('BEGIN');try{db.prepare("DELETE FROM voice_catalog WHERE id LIKE 'gemini:%'").run();for(const v of found)db.prepare('INSERT OR REPLACE INTO voice_catalog VALUES(?,?)').run(v.id,JSON.stringify(v));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  }catch{warning='외부 음성 목록을 새로 불러오지 못했습니다. 기본 목소리와 기존 목록은 유지했습니다.';}
  const builtin=[...OPENAI_VOICES.map(voice=>({id:'openai:'+voice,provider:'openai',voice,name:voice})),...GEMINI_VOICES.map(voice=>({id:'gemini:'+voice,provider:'gemini',voice,name:voice}))],stored=db.prepare('SELECT body FROM voice_catalog').all().map(r=>JSON.parse(r.body));
  const genders=new Map(stored.filter(v=>normalizeVoiceGender(v.gender)!=='unknown').map(v=>[v.provider+':'+v.voice.toLowerCase(),normalizeVoiceGender(v.gender)]));
  return {voices:[...new Map([...builtin,...stored].map(v=>[v.id,{...v,gender:normalizeVoiceGender(v.gender)!=='unknown'?normalizeVoiceGender(v.gender):genders.get(v.provider+':'+v.voice.toLowerCase())||'unknown',connected:connected[v.provider],model:model(v.provider)}])).values()],connected,warning};
 }
 const get=id=>{if(!uuid(id))throw Error('음성 번호를 확인해주세요.');const row=db.prepare('SELECT * FROM voice_requests WHERE id=?').get(id);if(!row)throw Error('저장한 음성을 찾을 수 없습니다.');return {...JSON.parse(row.body),id,state:row.state};};
 const put=(id,state,value)=>db.prepare('UPDATE voice_requests SET state=?,body=? WHERE id=?').run(state,JSON.stringify(value),id);
 async function synthesizeFresh(s){
  const cache=hash(s),file=path.join(dir,cache+'.wav');if(existsSync(file)&&db.prepare('SELECT 1 FROM voice_segments WHERE id=?').get(cache))return pcm24k(readFileSync(file));
  const key=await credentials(s.provider);if(!key)throw Error('선택한 음성 서비스의 API 연결을 확인해주세요.');
  let response;try{response=await fetcher(s.provider==='openai'?'https://api.openai.com/v1/audio/speech':'https://generativelanguage.googleapis.com/v1beta/interactions',{method:'POST',headers:{'Content-Type':'application/json',...(s.provider==='openai'?{Authorization:'Bearer '+key}:{'x-goog-api-key':key})},signal:AbortSignal.timeout(60000),body:JSON.stringify(s.provider==='openai'?{model:s.model,voice:s.voice,input:s.text,instructions:s.style,response_format:'wav'}:{model:s.model,input:[{type:'user_input',content:[{type:'text',text:s.text,annotations:[{type:'speech_metadata',style:s.style}]}]}],response_format:{type:'audio',mime_type:'audio/wav'},generation_config:{speech_config:[{voice:s.voice}]}})});}catch{throw Error('음성 응답 연결이 끊겼습니다. 중복 호출하지 않았습니다.');}
  if(!response.ok)throw Error((s.provider==='openai'?'OpenAI':'Gemini')+' 음성 응답 '+response.status+' · API 잔액·권한·모델 연결을 확인해주세요.');
  let bytes;if(s.provider==='openai')bytes=Buffer.from(await response.arrayBuffer());else{const d=await response.json(),r=d.interaction||d,a=r.output_audio||(r.steps||[]).filter(step=>step.type==='model_output').flatMap(step=>step.content||[]).filter(c=>c.type==='audio').at(-1);if(!a?.data)throw Error('Gemini 응답에 음성 파일이 없습니다.');bytes=Buffer.from(a.data,'base64');}
  if(bytes.length>12*1024*1024)throw Error('음성 파일이 너무 큽니다.');const pcm=pcm24k(bytes);writeFileSync(file+'.tmp',wav(pcm));renameSync(file+'.tmp',file);db.prepare('INSERT OR REPLACE INTO voice_segments VALUES(?,?)').run(cache,cache+'.wav');return pcm;
 }
 async function synthesize(s){const id=hash(s);if(segmentPending.has(id))return segmentPending.get(id);const pending=synthesizeFresh(s);segmentPending.set(id,pending);try{return await pending;}finally{segmentPending.delete(id);}}
 async function start(x,id){
  if(!uuid(id))throw Error('음성 요청 번호가 필요합니다.');if(!Array.isArray(x.speakers)||!x.speakers.length||x.speakers.length>4)throw Error('배우는 1~4명까지 사용할 수 있습니다.');
  const available=(await catalog()).voices,script=x.speakers.map(s=>{const v=available.find(v=>v.id===s.voiceId&&v.connected);if(!v)throw Error('연결된 목소리를 선택해주세요.');if(typeof s.text!=='string'||!s.text.trim()||s.text.length>500||typeof s.style!=='string'||s.style.length>500)throw Error('배우별 대사와 목소리 설정을 확인해주세요.');return {provider:v.provider,voice:v.voice,model:v.model,text:s.text,style:s.style};});
  const fingerprint=hash(script),prior=db.prepare('SELECT * FROM voice_requests WHERE id=?').get(id);if(prior){if(prior.fingerprint!==fingerprint)throw Error('같은 음성 요청의 내용이 바뀌었습니다.');return get(id);}
  db.prepare('INSERT INTO voice_requests VALUES(?,?,?,?,?)').run(id,fingerprint,'processing',JSON.stringify({speakers:script.length}),Date.now());active.add(id);
  void(async()=>{try{const chunks=[];for(const [i,s]of script.entries()){if(i)chunks.push(Buffer.alloc(8640));chunks.push(await synthesize(s));}const pcm=Buffer.concat(chunks),duration=pcm.length/48000;if(duration>120)throw Error('합친 음성이 120초를 넘습니다. 대사를 줄여주세요.');const filename=id+'.wav';writeFileSync(path.join(dir,filename+'.tmp'),wav(pcm));renameSync(path.join(dir,filename+'.tmp'),path.join(dir,filename));put(id,'complete',{duration,speakers:script.length,voices:script.map(s=>({provider:s.provider,voice:s.voice,model:s.model})),filename,url:'/api/voices/audio/'+id});}catch(e){put(id,'failed',{error:e.code?'음성 파일 저장을 확인해야 합니다. 자동으로 다시 생성하지 않았습니다.':e.message||'음성 생성을 확인해주세요.'});}finally{active.delete(id);}})();return get(id);
 }
 function status(id){const record=get(id);if(record.state==='processing'&&!active.has(id)){const row=db.prepare('SELECT created FROM voice_requests WHERE id=?').get(id);if(Date.now()-row.created>180000){put(id,'failed',{error:'음성 처리 결과를 확인하지 못했습니다. 자동 재호출하지 않았습니다.'});return get(id);}}return record;}
 function asset(id){const record=get(id);if(record.state!=='complete'||!existsSync(path.join(dir,record.filename)))throw Error('완성된 음성 파일을 찾을 수 없습니다.');return path.join(dir,record.filename);}
 function validate(id,duration){const record=get(id);asset(id);if(record.duration>Number(duration)+.05)throw Error(`음성 ${record.duration.toFixed(1)}초가 영상 ${duration}초보다 깁니다. 영상 길이를 늘리거나 대사를 줄여주세요.`);return id;}
 async function sync(){if(!enabled||muxBusy)return;const row=db.prepare("SELECT body FROM jobs WHERE state='complete' AND json_extract(body,'$.deletedAt') IS NULL AND json_extract(body,'$.voiceAudioId') IS NOT NULL AND coalesce(json_extract(body,'$.voiceApplied'),0)=0 AND coalesce(json_extract(body,'$.voiceStatus'),'')!='failed' ORDER BY created LIMIT 1").get(),j=row?JSON.parse(row.body):null;if(!j)return;muxBusy=true;
  try{const record=get(j.voiceAudioId),audio=asset(j.voiceAudioId),videos=(j.voiceOriginalAssets||j.assets||[]).filter(a=>a.kind==='video');if(!videos.length)throw Error('목소리를 적용할 영상 파일을 찾을 수 없습니다.');validate(j.voiceAudioId,j.duration);const originals=j.voiceOriginalAssets||j.assets,assets=[];
   for(const [i,a]of originals.entries()){if(a.kind!=='video'){assets.push(a);continue;}const filename=j.id+'-'+(500+i)+'.mp4',output=path.join(data,'results',filename);await execFileAsync(python,[path.join(root,'voice-media.py'),path.join(data,'results',path.basename(a.filename)),audio,output+'.tmp.mp4'],{windowsHide:true,timeout:120000,maxBuffer:65536});renameSync(output+'.tmp.mp4',output);assets.push({...a,filename,url:'/api/results/'+filename,bytes:statSync(output).size,sha256:createHash('sha256').update(readFileSync(output)).digest('hex')});}
   const current=getJob(j.id);if(current?.state==='complete'&&!current.deletedAt&&current.voiceAudioId===j.voiceAudioId)save({...current,voiceOriginalAssets:originals,assets,voiceApplied:true,voiceStatus:'complete',voiceInfo:{duration:record.duration,voices:record.voices},message:'선택한 목소리를 영상에 적용했습니다.'});
  }catch(e){const current=getJob(j.id);if(current?.state==='complete'&&!current.deletedAt)save({...current,voiceStatus:'failed',message:'영상 음성 적용에 실패했습니다. 원본은 보관했습니다. 재시작하면 영상 생성 없이 음성만 다시 적용합니다.'});}finally{muxBusy=false;}
 }
 return {catalog,start,status,asset,validate,sync,isBusy:()=>active.size>0||muxBusy};
}
