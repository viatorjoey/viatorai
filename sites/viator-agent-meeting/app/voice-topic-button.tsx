'use client';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Mic,Square} from 'lucide-react';
import {createVoiceRecorder} from './voice-recorder';
type Pending={id:string;project:string};
type Result={commandId:string;projectId:string;status:string;roomId?:string;title?:string;error?:string;director?:{error?:string}};
const storageKey='viator.pending-voice-topic';
export default function VoiceTopicButton({project,onOpen,onStarted}:{project:string;onOpen:()=>void;onStarted:(project:string,room:string,error?:string)=>void}){
 const [open,setOpen]=useState(false),[phase,setPhase]=useState<'idle'|'permission'|'recording'|'processing'|'error'>('idle'),[seconds,setSeconds]=useState(0),[error,setError]=useState('');
 const recorder=useRef<ReturnType<typeof createVoiceRecorder>|null>(null),pending=useRef<Pending|null>(null),generation=useRef(0),mounted=useRef(true),working=useRef(false),dialog=useRef<HTMLElement>(null),trigger=useRef<HTMLButtonElement>(null),callbacks=useRef({onOpen,onStarted});
 callbacks.current={onOpen,onStarted};
 function remember(value:Pending|null){pending.current=value;try{if(value)sessionStorage.setItem(storageKey,JSON.stringify(value));else sessionStorage.removeItem(storageKey);}catch{}}
 async function json(url:string,options:RequestInit={},timeout=130000){const res=await fetch(url,{...options,signal:AbortSignal.timeout(timeout)}),data=await res.json() as Result;if(!res.ok)throw Object.assign(Error(data.error||'음성 지시 연결을 확인해주세요.'),{status:res.status});return data;}
 function complete(data:Result){if(data.status==='failed'){remember(null);throw Error(data.error||'음성을 인식하지 못했습니다. 다시 녹음해주세요.');}if(data.status==='done'&&data.roomId){remember(null);if(mounted.current){setOpen(false);setPhase('idle');callbacks.current.onStarted(data.projectId,data.roomId,data.director?.error);}return true;}return false;}
 async function advance(data:Result,task:Pending){
  if(complete(data))return true;
  if(data.status==='ready'){const started=await json('/api/hub/voice-topic/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:task.project,commandId:task.id})});return complete(started);}
  return false;
 }
 async function recover(task:Pending){
  const deadline=Date.now()+90000;
  for(let i=0;i<45&&mounted.current&&Date.now()<deadline;i++){
   try{const data=await json('/api/hub/voice-topic?project='+encodeURIComponent(task.project)+'&id='+encodeURIComponent(task.id),{},15000);if(await advance(data,task))return;}catch(e){const status=(e as {status?:number}).status||0;if([400,401,403].includes(status)){remember(null);throw e;}if(!pending.current)throw e;if(i===44||Date.now()>=deadline){if(status===404){remember(null);throw Error('음성 지시를 전송하지 못했습니다. 다시 녹음해주세요.');}throw e;}}
   await new Promise(resolve=>setTimeout(resolve,2000));
  }
  throw Error('아직 음성 지시를 처리하고 있습니다. 상태 확인을 눌러 이어서 확인해주세요.');
 }
 async function check(){if(working.current||!pending.current)return;working.current=true;setPhase('processing');setError('');try{await recover(pending.current);}catch(e){if(mounted.current){setError((e as Error).message);setPhase('error');}}finally{working.current=false;}}
 async function finish(){
  if(working.current||!recorder.current)return;working.current=true;setPhase('processing');setError('');
  try{const audio=await recorder.current.stop();recorder.current=null;const task={id:crypto.randomUUID(),project:recordingProject.current};remember(task);const form=new FormData();form.set('audio',audio,'voice.'+(audio.type.includes('mp4')?'mp4':'webm'));
   try{const data=await json('/api/hub/voice-topic?project='+encodeURIComponent(task.project),{method:'POST',headers:{'Idempotency-Key':task.id},body:form});if(!await advance(data,task))await recover(task);}catch(e){if([400,401,403,413,503].includes((e as {status?:number}).status||0)){remember(null);throw e;}if(pending.current)await recover(task);else throw e;}
  }catch(e){recorder.current?.cancel();recorder.current=null;if(mounted.current){setError((e as Error).message);setPhase('error');}}finally{working.current=false;}
 }
 const finishRef=useRef(finish);finishRef.current=finish;
 const recordingProject=useRef(project);
 async function begin(){
  if(!project||working.current)return;setOpen(true);callbacks.current.onOpen();
  if(pending.current){void check();return;}
  const token=++generation.current;recordingProject.current=project;setError('');setSeconds(0);setPhase('permission');
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){setError('이 브라우저에서는 녹음을 지원하지 않습니다. Safari 또는 Chrome에서 열어주세요.');setPhase('error');return;}
  const controller=createVoiceRecorder({media:navigator.mediaDevices,Recorder:MediaRecorder});recorder.current=controller;
  try{await controller.start();if(token===generation.current&&mounted.current)setPhase('recording');}catch(e){if(token!==generation.current||!mounted.current)return;controller.cancel();recorder.current=null;setError((e as Error).name==='NotAllowedError'?'마이크 사용을 허용한 뒤 다시 눌러주세요.':(e as Error).message||'마이크를 연결하지 못했습니다.');setPhase('error');}
 }
 function close(){if(working.current)return;++generation.current;recorder.current?.cancel();recorder.current=null;setOpen(false);setPhase('idle');}
 useEffect(()=>{mounted.current=true;try{const saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');if(saved?.id&&saved?.project)pending.current=saved;}catch{}return()=>{mounted.current=false;++generation.current;recorder.current?.cancel();};},[]);
 useEffect(()=>{if(phase!=='recording')return;const started=Date.now(),timer=setInterval(()=>{const elapsed=Math.floor((Date.now()-started)/1000);setSeconds(elapsed);if(elapsed>=120)void finishRef.current();},250);return()=>clearInterval(timer);},[phase]);
 useEffect(()=>{if(!open)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';dialog.current?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape')close();if(e.key==='Tab'){const buttons=dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');if(!buttons?.length){e.preventDefault();return;}const first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===dialog.current)){e.preventDefault();first.focus();}}};document.addEventListener('keydown',key);return()=>{document.body.style.overflow=previous;document.removeEventListener('keydown',key);trigger.current?.focus({preventScroll:true});};},[open]);
 return <><button ref={trigger} className="voice-topic-trigger" disabled={!project} title={project?'말로 지시하고 새 회의 시작':'프로젝트를 먼저 선택해주세요'} aria-haspopup="dialog" aria-expanded={open} onClick={()=>void begin()}><Mic size={17}/>음성지시</button>{open&&createPortal(<div className="backdrop voice-topic-backdrop"><section ref={dialog} tabIndex={-1} className="modal voice-topic-modal" role="dialog" aria-modal="true" aria-labelledby="voice-topic-title"><h2 id="voice-topic-title">음성지시</h2><div className="voice-topic-content"><div className={'voice-record-indicator '+(phase==='recording'?'recording':'')}><Mic size={28}/></div><p role="status" aria-live="polite">{phase==='permission'?'마이크 사용을 허용해주세요.':phase==='recording'?'회의할 내용을 말씀해주세요.':phase==='processing'?'챗지피티가 지시를 정리하고 새 회의를 시작합니다.':error}</p>{phase==='recording'&&<><time>{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</time><p className="voice-topic-hint">녹음은 최대 2분입니다. 종료하면 제목을 정하고 회의를 시작합니다.</p></>}{phase==='error'&&!pending.current&&<p className="voice-topic-hint">녹음 파일은 서버에 보관하지 않습니다.</p>}</div><footer className="voice-topic-footer">{phase==='recording'&&<button className="primary" onClick={()=>void finish()}><Square size={13}/>녹음 종료 · 회의 시작</button>}{phase==='error'&&<button className="primary" onClick={()=>void (pending.current?check():begin())}>{pending.current?'처리 상태 확인':'다시 녹음'}</button>}<button className="outline" disabled={phase==='processing'} onClick={close}>{phase==='permission'||phase==='recording'?'취소':'닫기'}</button></footer></section></div>,document.body)}</>;
}
