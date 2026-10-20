// A recognizer belongs to one session. Late events can never clear a newer session.
let activeStop=null;
export function bindDictation({button,input,status,onChange=()=>{},toast=()=>{},getLanguage=()=> 'ko-KR'}){
 let session=null,serial=0;
 const message={ 'not-allowed':'마이크 권한을 허용해 주세요.','service-not-allowed':'음성 인식 권한을 확인하거나 키보드 마이크를 사용하세요.','no-speech':'음성이 들리지 않았어요. 다시 눌러 말씀해 주세요.','audio-capture':'마이크를 찾지 못했습니다.','network':'음성 인식 연결에 실패했습니다. 다시 눌러 주세요.','language-not-supported':'선택한 언어의 음성 인식을 지원하지 않습니다.'};
 function state(on){button.classList.toggle('listening',on);button.setAttribute('aria-pressed',String(on));button.setAttribute('aria-label',on?'받아쓰기 중지':'받아쓰기 시작');}
 function release(s,text=''){if(session!==s)return;clearTimeout(s.timer);clearTimeout(s.watchdog);session=null;if(activeStop===cancel)activeStop=null;state(false);status.textContent=text;}
 function cancel(){if(!session)return;const s=session;release(s);try{s.rec.abort();}catch{}}
 function stop(){if(!session)return;const s=session;s.stopping=true;s.timer=setTimeout(()=>{release(s);try{s.rec.abort();}catch{}},1200);try{s.rec.stop();}catch{release(s);}}
 button.onclick=()=>{
  if(session){stop();return;}
  const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Speech){input.focus();toast('iPhone 키보드의 마이크로 받아쓰기를 사용하세요.');return;}
  activeStop?.();
  const s={id:++serial,rec:new Speech(),base:input.value.trim(),stopping:false};session=s;activeStop=cancel;
  const r=s.rec;r.lang=getLanguage()||'ko-KR';r.continuous=false;r.interimResults=true;r.maxAlternatives=1;
  state(true);status.textContent='듣고 있어요…';
  r.onresult=e=>{if(session!==s)return;const parts=[];for(let i=0;i<e.results.length;i++)parts.push(e.results[i][0]?.transcript||'');const max=input.maxLength>0?input.maxLength:8000;input.value=[s.base,parts.join('')].filter(Boolean).join(' ').slice(0,max);onChange();};
  r.onerror=e=>{if(session!==s)return;const text=e.error==='aborted'?'':message[e.error]||'음성 입력을 다시 시작해 주세요.';release(s,text);try{r.abort();}catch{}};
  r.onend=()=>release(s,s.stopping?'':'입력한 내용을 확인해 주세요.');
  s.watchdog=setTimeout(()=>{try{r.abort();}catch{}release(s,'다시 눌러 받아쓰기를 시작하세요.');},65000);
  try{r.start();}catch{try{r.abort();}catch{}release(s,'마이크를 다시 눌러 시작해 주세요.');}
 };
 const onVisibility=()=>{if(document.hidden&&session){const s=session;try{s.rec.abort();}catch{}release(s);}};
 document.addEventListener('visibilitychange',onVisibility);
 return {stop,cancel,dispose(){cancel();document.removeEventListener?.('visibilitychange',onVisibility);button.onclick=null;}};
}
