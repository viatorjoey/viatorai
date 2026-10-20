export function voiceOptionLabel(voice){const gender={female:'여성',male:'남성',neutral:'중성'}[voice.gender]||'중성';return (voice.provider==='gemini'?'Gemini':'OpenAI')+' · '+voice.name+' · '+gender+(voice.language?' · '+voice.language:'');}
export function initBuilderVoices({api,getScript,getDuration,getDurations=()=>[Number(getDuration())],setDuration=()=>{},onCatalog,toast,autoload=true}){
 const $=id=>document.getElementById(id);let catalog=[],track=null,attached=false,signature='',pending=null,busy=false,version=0;
 const script=()=>getScript().filter(s=>s.text?.trim()),fingerprint=()=>JSON.stringify(script());
 function refresh(){
  if(track&&signature!==fingerprint()){attached=false;$('builder-voice-status').textContent='대사나 목소리가 바뀌었습니다. 음성을 다시 만들어 적용해주세요.';}
  const tooLong=track&&track.duration>Number(getDuration())+.05,next=tooLong?getDurations().map(Number).filter(n=>Number.isFinite(n)&&n+.05>=track.duration).sort((a,b)=>a-b)[0]:null,changed=!!track&&signature!==fingerprint();
  $('builder-voice-generate').disabled=busy||!script().length;$('builder-voice-apply').disabled=busy||!track||changed||!!(tooLong&&!next);
  $('builder-voice-apply').textContent=attached?'영상에 적용됨':tooLong&&next?'영상 길이 맞춰 적용':'영상에 적용';$('builder-voice-remove').hidden=!attached;
  $('builder-voice-apply').title=busy?'음성 생성 중입니다.':!track?'대사 음성을 먼저 만들어주세요.':changed?'변경된 대사·목소리로 음성을 다시 만들어주세요.':tooLong&&!next?'음성이 이 모델의 최대 영상 길이보다 깁니다. 대사를 줄이거나 영상 모델을 변경해주세요.':'';
  if(tooLong&&!changed){attached=false;$('builder-voice-status').textContent=next?`음성 ${track.duration.toFixed(1)}초 · 현재 영상 ${getDuration()}초. 적용하면 영상 길이를 ${next}초로 맞춥니다.`:`음성 ${track.duration.toFixed(1)}초가 이 모델의 최대 영상 길이를 넘습니다. 대사를 줄이거나 더 긴 영상을 지원하는 모델로 바꿔주세요.`;}
 }
 async function load(library=false){$('builder-voice-library').disabled=true;try{const data=await api('/api/voices'+(library?'?refresh=1':''));catalog=data.voices;onCatalog(catalog);if(library)$('builder-voice-status').textContent=data.warning||`목소리 ${catalog.filter(v=>v.connected).length}개를 불러왔습니다.`;}catch(e){$('builder-voice-status').textContent=e.message;}finally{$('builder-voice-library').disabled=false;refresh();}}
 $('builder-voice-library').onclick=()=>void load(true);
 $('builder-voice-generate').onclick=async()=>{
  if(busy)return;const speakers=script();if(!speakers.length)return toast('먼저 대사를 입력해주세요.');if(speakers.some(s=>!catalog.some(v=>v.id===s.voiceId&&v.connected)))return toast('각 배우에 사용할 음성 서비스와 목소리를 선택해주세요.');
  const input=JSON.stringify(speakers);if(!pending||pending.input!==input)pending={input,id:crypto.randomUUID()};busy=true;attached=false;track=null;const current=++version;$('builder-voice-preview').hidden=true;$('builder-voice-status').textContent='대사 음성을 만들고 있습니다…';refresh();
  try{let result=await api('/api/voices/render',{method:'POST',headers:{'Idempotency-Key':pending.id},body:JSON.stringify({speakers})});for(let i=0;result.state==='processing'&&i<180;i++){await new Promise(resolve=>setTimeout(resolve,1000));result=await api('/api/voices/status/'+pending.id);if(current!==version)return;}
   if(current!==version)return;if(result.state==='failed')pending=null;if(result.state!=='complete')throw Error(result.error||'음성 결과 확인이 필요합니다. 같은 요청을 중복 생성하지 않았습니다.');track=result;signature=input;$('builder-voice-audio').src=result.url;$('builder-voice-preview').hidden=false;$('builder-voice-download').href=result.url+'?download=1';$('builder-voice-download').download='대사-음성.wav';$('builder-voice-status').textContent=`AI 생성 음성 · ${result.speakers}명 · ${result.duration.toFixed(1)}초. 들어본 뒤 영상에 적용해주세요.`;
  }catch(e){$('builder-voice-status').textContent=e.message;}finally{busy=false;refresh();}
 };
 $('builder-voice-apply').onclick=()=>{if(busy||!track||signature!==fingerprint())return;if(track.duration>Number(getDuration())+.05){const next=getDurations().map(Number).filter(n=>Number.isFinite(n)&&n+.05>=track.duration).sort((a,b)=>a-b)[0];if(!next){refresh();return toast('대사를 줄이거나 더 긴 영상을 지원하는 모델로 바꿔주세요.');}setDuration(next);if(track.duration>Number(getDuration())+.05)return refresh();}attached=true;$('builder-voice-status').textContent='다음 영상 생성 시 원래 오디오를 선택한 목소리로 교체합니다. 입 모양 동기화는 별도입니다.';refresh();};
 $('builder-voice-remove').onclick=()=>{attached=false;$('builder-voice-status').textContent='영상에 목소리 적용을 해제했습니다.';refresh();};
 function reset(){version++;attached=false;track=null;signature='';pending=null;$('builder-voice-audio').pause?.();$('builder-voice-audio').removeAttribute('src');$('builder-voice-preview').hidden=true;$('builder-voice-status').textContent='';refresh();}
 if(autoload)void load();return {refresh,reset,load,selectedAudioId(){refresh();return attached&&signature===fingerprint()?track?.id:null;}};
}
