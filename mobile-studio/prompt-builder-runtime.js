// Source for the inline browser bundle. Rebuild with node build-prompt-builder.mjs.
const PROMPT_CATEGORIES={general:{label:'일반'},sensual:{label:'센슈얼'},dance:{label:'댄스'},exercise:{label:'운동'}};
const BUILDER_COMMON=['subject','audio','timing','direction'];
const BUILDER_DEFAULTS={subject:'',duration:'10',audio:'speech',timing:'sequential',direction:''};
const VOICE_FIELDS=new Set(['목소리 음색','목소리 감정','속도와 호흡','음성']);
const ACTOR_VOICE_FIELDS=new Set(['목소리 음색','목소리 감정']);
const ACTOR_ACTION_FIELDS=new Set(['운동 동작','운동 속도','운동 호흡','동작 범위','운동 소도구','표정','눈과 시선','입술','고개와 상체','손과 팔','전신','몸짓','음성','장르','골반과 허리','상체','팔과 손','발과 다리','회전','강도','템포','댄스 표정','마무리']);
const LOOK_FIELDS=new Set(['수직 카메라 각도','수평 카메라 방향','프레이밍','카메라 이동','렌즈와 초점','촬영 각도','구도','조명','장르','강도','템포','댄스 카메라']);
const text=value=>String(value??'').trim();
const sentence=value=>{const s=text(value);return s?/[.!?]$/.test(s)?s:s+'.':'';};
function actorSettings(input={}){
 const selections={...input.selections},tone=selections['목소리 음색'],emotion=selections['목소리 감정'],pace=selections['속도와 호흡'],acting=Object.fromEntries(Object.entries(selections).filter(([key])=>ACTOR_ACTION_FIELDS.has(key)));
 for(const key of [...ACTOR_VOICE_FIELDS,...ACTOR_ACTION_FIELDS,'속도와 호흡'])delete selections[key];
 const speakers=input.speakers?.length?input.speakers:[{name:'',dialogue:'',language:'Korean',voice:''}];
 return {...input,selections,speakers:speakers.slice(0,4).map(s=>({...s,voice:s.voice!==undefined&&s.voice!==''?s.voice:tone??'',emotion:s.emotion??emotion??'',pace:s.pace??pace??'',acting:{...acting,...s.acting}}))};
}
function actorVoiceStyle(speaker){
 const cue=(field,value)=>value!==undefined&&value!==''&&/^\d+$/.test(String(value))?PROMPT_SPEC.modes.general[field].options[Number(value)]?.prompt:'';
 return ('Speak in '+(speaker.language||'Korean')+'. '+([cue('목소리 음색',speaker.voice),cue('목소리 감정',speaker.emotion),cue('속도와 호흡',speaker.pace)].filter(Boolean).join(', ')||'Natural clear delivery')).slice(0,500);
}
function createBuilderState(storage){
 let saved;try{saved=JSON.parse(storage?.getItem('creator-director-v1')||'null');}catch{}
 const defaultSpeakers=()=>[{name:'',dialogue:'',language:'Korean',voice:''}];
 const values={};for(const category of Object.keys(PROMPT_CATEGORIES))values[category]=actorSettings({...BUILDER_DEFAULTS,...saved?.values?.[category],selections:{...saved?.values?.[category]?.selections},speakers:Array.isArray(saved?.values?.[category]?.speakers)&&saved.values[category].speakers.length?saved.values[category].speakers.slice(0,4):defaultSpeakers()});
 let category=PROMPT_CATEGORIES[saved?.category]?saved.category:'general';
 const persist=()=>{try{storage?.setItem('creator-director-v1',JSON.stringify({category,values}));}catch{}};
 return {get category(){return category;},get current(){return values[category];},select(next){if(!PROMPT_CATEGORIES[next])return;category=next;persist();},update(patch){values[category]=actorSettings({...values[category],...patch});persist();},restore(snapshot){category=PROMPT_CATEGORIES[snapshot?.category]?snapshot.category:'general';values[category]=actorSettings({...BUILDER_DEFAULTS,...snapshot,selections:{...snapshot?.selections},speakers:snapshot?.speakers?.length?snapshot.speakers.map(s=>({...s})):defaultSpeakers()});persist();}};
}
function buildPromptDraft(input={}){
 const category=PROMPT_CATEGORIES[input.category]?input.category:'general',fields=PROMPT_SPEC.modes[category];
 const duration=Number.isInteger(Number(input.duration))&&Number(input.duration)>=1&&Number(input.duration)<=30?Number(input.duration):10;
 const audio=PROMPT_SPEC.settings.audio_mode.includes(input.audio)?input.audio:'speech';
 const timing=PROMPT_SPEC.settings.timing.includes(input.timing)?input.timing:'sequential';
 const subject=text(input.subject),direction=text(input.direction);
 const speakers=(Array.isArray(input.speakers)?input.speakers:[{dialogue:input.dialogue,language:input.language}]);
 if(speakers.length>4)throw Error('배우는 최대 4명까지 추가할 수 있습니다.');
 for(const speaker of speakers)if(String(speaker.dialogue||'').length>500||text(speaker.name).length>40)throw Error('배우 이름은 40자, 각 대사는 500자 이하로 입력하세요.');
 const speaking=speakers.map((s,i)=>({...s,index:i+1})).filter(s=>text(s.dialogue)),dialogue=speaking.length>0;
 if(subject.length>500||direction.length>700)throw Error('장면·대사는 500자, 자유 연출은 700자 이하로 입력하세요.');
 if(dialogue&&audio!=='speech')throw Error('대사를 사용하려면 오디오 모드를 대사로 선택하세요.');
 const actions=[],look=[],voice=[],finish=[];
 for(const [key,field]of Object.entries(fields)){
  const id=input.selections?.[key];if(id===undefined||id===null||id==='')continue;
  const selected=field.options[Number(id)];if(!/^\d+$/.test(String(id))||!selected)continue;
  (VOICE_FIELDS.has(key)?voice:LOOK_FIELDS.has(key)?look:key==='마무리'?finish:actions).push(selected.prompt);
 }
 const parts=[];
 if(input.mode==='image-video')parts.push('Animate the provided image, preserving the original face, hair, clothing and background throughout the shot');
 else parts.push(subject|| (category==='exercise'?'An adult fitness demonstrator in an uncluttered exercise space':category==='dance'?'An adult dancer':category==='sensual'?'An adult fashion model in an elegant editorial scene':'A person in a natural scene'));
 if(input.mode==='image-video'&&subject)parts.push('Scene direction: '+subject);
 parts.push('One continuous '+duration+'-second shot');
 if(category==='exercise')parts.push('Controlled fitness demonstration with stable balanced posture');
 if(category==='sensual')parts.push('Subtle, tasteful fashion performance');
 parts.push(...look);
 if(timing==='sequential'){
  if(actions.length){parts.push('First: '+actions[0]);if(actions.length>1)parts.push('Then: '+actions.slice(1).join('; '));}
  if(dialogue)parts.push('While speaking, maintain natural lip movements synchronized with the dialogue; closed-mouth expression cues apply before or after each line');
  parts.push('Finally: '+(finish.length?finish.join('; '):'settle into a stable natural pose'));
 }else{
  if(actions.length)parts.push((timing==='simultaneous'?'Combine only physically compatible movements, staggering any conflicting actions: ':'Let the actions unfold naturally without forcing incompatible movements to overlap: ')+actions.join('; '));
  if(finish.length)parts.push('Finally: '+finish.join('; '));
 }
 let actorActionCount=0;
 for(const [index,speaker]of speakers.entries()){
  const performance=[];for(const [key,field]of Object.entries(fields)){const id=speaker.acting?.[key];if(!ACTOR_ACTION_FIELDS.has(key)||!/^\d+$/.test(String(id))||!field.options[Number(id)])continue;if(VOICE_FIELDS.has(key)&&audio!=='speech')continue;performance.push(field.options[Number(id)].prompt);if(!LOOK_FIELDS.has(key)&&!VOICE_FIELDS.has(key))actorActionCount++;}
  if(performance.length){if(text(speaker.name)&&!text(speaker.dialogue))parts.push('Speaker '+(index+1)+' is named '+JSON.stringify(text(speaker.name)));parts.push('Speaker '+(index+1)+' performance: '+performance.join('; '));}
 }
 if(audio==='speech'){
  if(voice.length)parts.push('Default voice direction unless a speaker has an individual override: '+voice.join(', '));
  if(dialogue){
   parts.push('Speakers take turns in numbered order, without overlapping dialogue; only the active speaker moves their lips while the others listen');
   for(const speaker of speaking){
    const lang=PROMPT_SPEC.settings.language.includes(speaker.language)?speaker.language:'Korean';
    const voice=PROMPT_SPEC.modes.general['목소리 음색'].options[Number(speaker.voice)];
    const emotion=PROMPT_SPEC.modes.general['목소리 감정'].options[Number(speaker.emotion)];
    const pace=PROMPT_SPEC.modes.general['속도와 호흡'].options[Number(speaker.pace)];
    if(text(speaker.name))parts.push('Speaker '+speaker.index+' is named '+JSON.stringify(text(speaker.name)));
    if(speaker.voice!==''&&speaker.voice!==undefined&&voice)parts.push('Speaker '+speaker.index+' voice: '+voice.prompt);
    if(speaker.emotion!==''&&speaker.emotion!==undefined&&emotion)parts.push('Speaker '+speaker.index+' emotion: '+emotion.prompt);
    if(speaker.pace!==''&&speaker.pace!==undefined&&pace)parts.push('Speaker '+speaker.index+' pace: '+pace.prompt);
    parts.push('Speaker '+speaker.index+' speaks in '+lang+': '+JSON.stringify(String(speaker.dialogue))+'.');
   }
  }
 }else parts.push(audio==='ambient'?'Only natural ambient sound; no speech or music':'Silent video; no speech, music or ambient audio');
 if(direction)parts.push('Additional direction: '+direction);
 parts.push('Keep motion coherent and anatomy stable; treat camera angles, BPM and timing as approximate directing cues');
 const positive=parts.map(sentence).filter(Boolean).join(' '),negative=PROMPT_SPEC.negative_prompt;
 if(positive.length>3000)throw Error('조합이 3,000자를 넘었습니다. 대사나 연출 지시를 줄여주세요.');
 return {positive,negative,duration,actionCount:actions.length+finish.length+actorActionCount};
}
function recoverBuilderSettings(draft={},mode='text-video'){
 const positive=String(draft.positive||''),negative=String(draft.negative||'');
 const result={...BUILDER_DEFAULTS,category:'general',duration:String(draft.duration||10),selections:{},speakers:[{name:'',dialogue:'',language:'Korean',voice:''}],positive,negative};
 const shot=/\bOne continuous (\d{1,2})-second shot\./.exec(positive),ending='Keep motion coherent and anatomy stable; treat camera angles, BPM and timing as approximate directing cues';
 if(!shot||!positive.endsWith(ending+'.')){if(positive.length<=500)result.subject=positive;return result;}
 const withoutPeriod=s=>s.trim().replace(/\.$/,'');
 const prefix=positive.slice(0,shot.index).trim();
 result.subject=mode==='image-video'?withoutPeriod(prefix.split('Scene direction: ').slice(1).join('Scene direction: ')):withoutPeriod(prefix);
 result.duration=shot[1];
 let cues=positive.slice(shot.index+shot[0].length,positive.lastIndexOf(ending)).trim();
 const direction=cues.lastIndexOf('Additional direction: ');if(direction>=0){result.direction=withoutPeriod(cues.slice(direction+'Additional direction: '.length));cues=cues.slice(0,direction);}
 result.audio=cues.includes('Silent video; no speech, music or ambient audio')?'silent':cues.includes('Only natural ambient sound; no speech or music')?'ambient':'speech';
 result.timing=cues.includes('Combine only physically compatible movements, staggering any conflicting actions:')?'simultaneous':cues.includes('Let the actions unfold naturally without forcing incompatible movements to overlap:')?'natural':cues.includes('Finally:')?'sequential':'natural';
 const speakers=[],performances=new Map([...cues.matchAll(/Speaker ([1-4]) performance: ([^.]*)\./g)].map(m=>[Number(m[1])-1,m[2]]));
 for(const match of cues.matchAll(/Speaker ([1-4]) (?:performance|pace):/g))while(speakers.length<Number(match[1]))speakers.push({name:'',dialogue:'',language:'Korean',voice:''});
 for(const match of cues.matchAll(/Speaker ([1-4]) speaks in (Korean|English|Japanese|Chinese|Spanish): ("(?:\\.|[^"\\])*")\./g)){
  const index=Number(match[1])-1;while(speakers.length<=index)speakers.push({name:'',dialogue:'',language:'Korean',voice:''});
  try{speakers[index].dialogue=JSON.parse(match[3]);speakers[index].language=match[2];}catch{}
 }
 for(const match of cues.matchAll(/Speaker ([1-4]) is named ("(?:\\.|[^"\\])*")\./g)){try{if(speakers[Number(match[1])-1])speakers[Number(match[1])-1].name=JSON.parse(match[2]);}catch{}}
 for(const [i,speaker]of speakers.entries()){const voice=PROMPT_SPEC.modes.general['목소리 음색'].options.findIndex(o=>cues.includes('Speaker '+(i+1)+' voice: '+o.prompt+'.'));if(voice>=0)speaker.voice=String(voice);const emotion=PROMPT_SPEC.modes.general['목소리 감정'].options.findIndex(o=>cues.includes('Speaker '+(i+1)+' emotion: '+o.prompt+'.'));if(emotion>=0)speaker.emotion=String(emotion);const pace=PROMPT_SPEC.modes.general['속도와 호흡'].options.findIndex(o=>cues.includes('Speaker '+(i+1)+' pace: '+o.prompt+'.'));if(pace>=0)speaker.pace=String(pace);}
 if(speakers.length)result.speakers=speakers;
 // Only authored directing clauses can select options; quoted dialogue and per-speaker voices cannot.
 cues=cues.replace(/"(?:\\.|[^"\\])*"/g,'""').replace(/Speaker [1-4] (?:voice|emotion|pace|performance): [^.]*\./g,'');
 const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const matches=(field,source)=>field.options.map((option,index)=>({option,index})).filter(({option})=>new RegExp('(?:^|[\\s:;,])'+escape(option.prompt)+'(?=[.!?;,]|$)').test(source)).sort((a,b)=>b.option.prompt.length-a.option.prompt.length);
 const classification=cues+' '+[...performances.values()].join('; ');
 const candidates=Object.entries(PROMPT_SPEC.modes).map(([category,fields])=>{let score=0;const selections={};for(const [key,field]of Object.entries(fields)){const selected=matches(field,cues)[0],scored=matches(field,classification)[0];if(selected)selections[key]=String(selected.index);if(scored)score+=scored.option.prompt.length;}return {category,selections,score};});
 const forced=cues.includes('Controlled fitness demonstration with stable balanced posture')?'exercise':cues.includes('Subtle, tasteful fashion performance')?'sensual':prefix==='An adult dancer.'?'dance':null;
 const chosen=forced?candidates.find(c=>c.category===forced):candidates.sort((a,b)=>b.score-a.score)[0];
 for(const [index,performance]of performances){const acting={};for(const [key,field]of Object.entries(PROMPT_SPEC.modes[chosen.category])){if(!ACTOR_ACTION_FIELDS.has(key))continue;const selected=matches(field,performance)[0];if(selected)acting[key]=String(selected.index);}speakers[index].acting=acting;}
 result.category=chosen.category;result.selections=chosen.selections;result.recovered=true;return result;
}
function mergeBuilderPrompts(existing,draft,operation){
 const positive=operation==='append'?[text(existing.positive),draft.positive].filter(Boolean).join('\n\n'):draft.positive;
 const negative=operation==='append'?[...new Set([text(existing.negative),draft.negative].join(',').split(',').map(text).filter(Boolean))].join(', '):draft.negative;
 if(positive.length>3000||negative.length>1000)throw Error('적용하면 입력 한도를 넘습니다. 기존 프롬프트를 줄이거나 교체해 주세요.');
 return {positive,negative};
}
async function applyBuilderDraft({existing,draft,operation,confirmReplace,onApply}){
 if(operation==='replace'&&(text(existing.positive)||text(existing.negative))&&!await confirmReplace())return false;
 const next=mergeBuilderPrompts(existing,draft,operation);await onApply(next);return true;
}
function initPromptBuilder({api,getMode,getContext=()=>({}),getExisting,onApply,onNegativeChange=()=>{},bindDictation,icon,canApply=()=>true,toast=()=>{},storage=globalThis.localStorage}){
 const $=id=>document.getElementById(id),panel=$('prompt-builder'),state=createBuilderState(storage);let busy=false,dictations=[],voiceChoices=[],voiceStudio=null,restoredPreview=null,negativeSyncPending=true;
 const option=(value,label)=>{const o=document.createElement('option');o.value=value;o.textContent=label;return o;};
 const labels={language:{Korean:'한국어',English:'영어',Japanese:'일본어',Chinese:'중국어',Spanish:'스페인어'},audio:{speech:'대사',ambient:'주변 소리',silent:'무음'},timing:{sequential:'순서대로',simultaneous:'함께 · 호환되는 동작만',natural:'자연스럽게'}};
 for(const [key,list]of Object.entries({audio:PROMPT_SPEC.settings.audio_mode,timing:PROMPT_SPEC.settings.timing}))$('builder-'+key).replaceChildren(...list.map(v=>option(v,labels[key]?.[v]||v)));
 const read=()=>({...Object.fromEntries(BUILDER_COMMON.map(k=>[k,$('builder-'+k).value])),duration:String(getContext().duration||$('duration').value),speakers:[...$('builder-speakers').querySelectorAll('.builder-speaker')].map(row=>({...Object.fromEntries([...row.querySelectorAll('[data-speaker-key]')].map(n=>[n.dataset.speakerKey,n.value])),acting:Object.fromEntries([...row.querySelectorAll('[data-actor-field]')].map(n=>[n.dataset.actorField,n.value]))})),selections:Object.fromEntries([...$('builder-fields').querySelectorAll('select')].map(s=>[s.dataset.field,s.value]))});
 const save=(clearPreview=true)=>{if(clearPreview){restoredPreview=null;negativeSyncPending=true;}state.update(read());};
 function refresh(){
  panel.hidden=!getMode().endsWith('video');if(panel.hidden){for(const d of dictations)d.cancel();return;}
  const duration=String(getContext().duration||$('duration').value);if(duration&&state.current.duration!==duration){state.update({duration});if(restoredPreview)restoredPreview.positive=restoredPreview.positive.replace(/One continuous \d{1,2}-second shot\./,'One continuous '+duration+'-second shot.');}
  if($('builder-audio').value!=='speech')for(const d of dictations)d.cancel();
  voiceStudio?.refresh();
  const context=getContext();
  $('builder-audio-support').textContent=context.provider==='local'&&String(context.model).startsWith('ltx-')?'LTX 2.5 · 현재 ComfyUI 워크플로는 오디오 생성·디코딩·영상 결합을 지원합니다. 실제 발화와 무음 반영은 결과를 확인해 주세요.':'오디오 출력은 선택한 서비스·모델에 따라 다릅니다. 이 패널의 오디오 선택은 연출 지시이며 출력 지원을 보장하지 않습니다.';
  for(const node of $('builder-speakers').querySelectorAll('[data-speaker-key]:not([data-speaker-key=name]),.builder-dictate'))node.disabled=$('builder-audio').value!=='speech';
  for(const node of $('builder-speakers').querySelectorAll('[data-actor-field]'))node.disabled=VOICE_FIELDS.has(node.dataset.actorField)&&$('builder-audio').value!=='speech';
  for(const select of $('builder-fields').querySelectorAll('select'))select.disabled=VOICE_FIELDS.has(select.dataset.field)&&$('builder-audio').value!=='speech';
  $('builder-dance-note').hidden=!['dance','exercise'].includes(state.category);$('builder-dance-note').textContent=state.category==='exercise'?'전신과 매트가 보이는 구도를 권장합니다. 운동 동작은 스트레칭·요가·필라테스별로 10개씩 고를 수 있습니다.':'전신이 보이는 원본 사진과 10초당 주요 동작 2~3개를 권장합니다.';
  try{const draft=restoredPreview||buildPromptDraft({...read(),category:state.category,mode:getMode()});$('builder-result').value=draft.positive;$('builder-negative').value=draft.negative;
   if(!restoredPreview&&negativeSyncPending){negativeSyncPending=false;onNegativeChange(draft.negative);}
   $('builder-note').textContent=restoredPreview?(restoredPreview.recovered?'이전 프롬프트에서 장면·대사·연출 선택을 복원했습니다.':restoredPreview.legacy?'이전 작업의 프롬프트를 불러왔습니다. 확인할 수 없는 세부 옵션은 선택하지 않았습니다.':'이 작업의 고급연출 설정과 프롬프트를 불러왔습니다.'):(['dance','exercise'].includes(state.category)&&draft.actionCount>3?'동작이 많습니다. 10초당 주요 동작 2~3개를 권장합니다. ':'')+'선택한 '+PROMPT_CATEGORIES[state.category].label+' 옵션으로 작성했습니다.';
   for(const id of ['builder-append','builder-replace','builder-copy-positive','builder-copy-negative'])$(id).disabled=busy;
  }catch(e){$('builder-result').value='';$('builder-negative').value='';$('builder-note').textContent=e.message;for(const id of ['builder-append','builder-replace','builder-copy-positive','builder-copy-negative'])$(id).disabled=true;}
 }
 function renderSpeakers(){
  for(const d of dictations)d.dispose();dictations=[];
  const holder=$('builder-speakers'),voicePanel=panel.querySelector('.builder-voice-studio'),assignedVoices=new Set(state.current.speakers.map(s=>s.ttsVoice).filter(Boolean));if(voicePanel)holder.before(voicePanel);holder.replaceChildren();
  state.current.speakers.forEach((speaker,index)=>{
   const row=document.createElement('fieldset');row.className='builder-speaker';const legend=document.createElement('legend');legend.textContent='배우 '+(index+1);row.append(legend);
   const grid=document.createElement('div');grid.className='builder-grid';
   for(const key of ['name','language','ttsVoice','voice','emotion','pace']){
    const label=document.createElement('label'),control=document.createElement(key==='name'?'input':'select');label.textContent={name:'이름 (선택)',language:'대사 언어',voice:'목소리 음색',emotion:'목소리 감정',pace:'속도와 호흡',ttsVoice:'음성 서비스 · 목소리'}[key];control.dataset.speakerKey=key;if(['language','ttsVoice','pace'].includes(key))label.className='builder-actor-wide';
    control.id='builder-speaker-'+index+'-'+key;label.htmlFor=control.id;
    if(key==='name'){control.maxLength=40;control.placeholder='예: 민지';}
    else if(key==='language')control.append(...PROMPT_SPEC.settings.language.map(v=>option(v,labels.language[v])));
    else if(key==='ttsVoice'){control.append(option('','목소리 선택'),...voiceChoices.map(v=>{const o=option(v.id,voiceOptionLabel(v));o.disabled=!v.connected;return o;}));}
    else control.append(option('','선택 안 함'),...PROMPT_SPEC.modes.general[key==='emotion'?'목소리 감정':key==='pace'?'속도와 호흡':'목소리 음색'].options.map((v,i)=>option(i,v.label)));
    if(key==='ttsVoice'&&speaker.ttsVoice&&!voiceChoices.some(v=>v.id===speaker.ttsVoice)){const recorded=option(speaker.ttsVoice,speaker.ttsVoice+' · 저장된 목소리');recorded.disabled=true;control.append(recorded);}
    control.value=speaker[key]??(key==='language'?'Korean':'');if(key==='ttsVoice'&&!control.value){const available=voiceChoices.filter(v=>v.connected),provider=available.some(v=>v.provider==='gemini')?'gemini':'openai',unused=available.filter(v=>v.provider===provider&&!assignedVoices.has(v.id));control.value=unused.find(v=>v.id==='gemini:Kore')?.id||unused[0]?.id||available[0]?.id||'';}if(key==='ttsVoice'&&control.value)assignedVoices.add(control.value);control.addEventListener(key==='name'?'input':'change',()=>{save();refresh();});label.append(control);grid.append(label);
   }
   row.append(grid);const actingGrid=document.createElement('div');actingGrid.className='builder-grid builder-acting';let actingIndex=0;
   for(const [key,field]of Object.entries(PROMPT_SPEC.modes[state.category])){if(!ACTOR_ACTION_FIELDS.has(key))continue;const label=document.createElement('label'),select=document.createElement('select');label.textContent=field.label;select.id='builder-speaker-'+index+'-acting-'+actingIndex++;label.htmlFor=select.id;select.dataset.actorField=key;select.append(option('','선택 안 함'));const groups=new Map();for(const [i,v]of field.options.entries()){let target=select;if(v.group){if(!groups.has(v.group)){const group=document.createElement('optgroup');group.label=v.group;groups.set(v.group,group);select.append(group);}target=groups.get(v.group);}target.append(option(i,v.label));}select.value=speaker.acting?.[key]??'';select.onchange=()=>{save();refresh();};label.append(select);actingGrid.append(label);}row.append(actingGrid);
   const label=document.createElement('label'),input=document.createElement('textarea');label.textContent='대사';input.rows=2;input.maxLength=500;input.placeholder='대사를 입력하거나 받아쓰기 버튼을 누르세요.';input.value=speaker.dialogue||'';input.dataset.speakerKey='dialogue';input.id='builder-speaker-'+index+'-dialogue';label.htmlFor=input.id;input.addEventListener('input',()=>{save();refresh();});row.append(label);const dialogueBox=document.createElement('div');dialogueBox.className='builder-dialogue-field';dialogueBox.append(input);row.append(dialogueBox);
   const actions=document.createElement('div');actions.className='builder-actions';const mic=document.createElement('button');mic.type='button';mic.className='builder-dictate';mic.append(icon('mic'));mic.title='대사 받아쓰기';mic.setAttribute('aria-label','배우 '+(index+1)+' 대사 받아쓰기 시작');mic.setAttribute('aria-pressed','false');dialogueBox.append(mic);
   if(state.current.speakers.length>1){const remove=document.createElement('button');remove.type='button';remove.textContent='배우 삭제';remove.setAttribute('aria-label','배우 '+(index+1)+' 삭제');remove.onclick=()=>{for(const d of dictations)d.cancel();save();state.update({speakers:state.current.speakers.filter((_,i)=>i!==index)});renderSpeakers();refresh();};actions.append(remove);}
   const status=document.createElement('span');status.className='dictation-status';status.setAttribute('role','status');actions.append(status);row.append(actions);holder.append(row);
   dictations.push(bindDictation({button:mic,input,status,toast,getLanguage:()=>({Korean:'ko-KR',English:'en-US',Japanese:'ja-JP',Chinese:'zh-CN',Spanish:'es-ES'})[row.querySelector('[data-speaker-key=language]').value],onChange:()=>{save();refresh();}}));
  });
  if(voicePanel)holder.lastElementChild?.append(voicePanel);
  $('builder-add-speaker').disabled=state.current.speakers.length>=4;
 }
 function render(){
  for(const key of BUILDER_COMMON)$('builder-'+key).value=state.current[key]??BUILDER_DEFAULTS[key];
  const fields=$('builder-fields');fields.replaceChildren();let i=0;
  for(const [key,field]of Object.entries(PROMPT_SPEC.modes[state.category])){
   if(ACTOR_VOICE_FIELDS.has(key)||ACTOR_ACTION_FIELDS.has(key)||key==='속도와 호흡')continue;
   const label=document.createElement('label'),select=document.createElement('select'),id='builder-option-'+i++;
   label.htmlFor=id;label.append(document.createTextNode(field.label));select.id=id;select.dataset.field=key;
   select.append(option('','선택 안 함'),...field.options.map((o,index)=>option(index,o.label)));select.value=state.current.selections[key]??'';
   select.onchange=()=>{save();refresh();};label.append(select);fields.append(label);
  }
  renderSpeakers();
  const active='builder-tab-'+state.category;$('builder-panel').setAttribute('aria-labelledby',active);
  for(const b of panel.querySelectorAll('[data-prompt-category]')){const selected=b.dataset.promptCategory===state.category;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;}
  refresh();
 }
 function selectCategory(category){for(const d of dictations)d.cancel();save();state.select(category);render();}
 const tabs=[...panel.querySelectorAll('[data-prompt-category]')];tabs.forEach((b,i)=>{b.onclick=()=>selectCategory(b.dataset.promptCategory);b.onkeydown=e=>{const n=e.key==='ArrowRight'?(i+1)%tabs.length:e.key==='ArrowLeft'?(i+tabs.length-1)%tabs.length:e.key==='Home'?0:e.key==='End'?tabs.length-1:-1;if(n<0)return;e.preventDefault();selectCategory(tabs[n].dataset.promptCategory);tabs[n].focus();};});
 for(const key of BUILDER_COMMON)$('builder-'+key).addEventListener(['subject','dialogue','direction'].includes(key)?'input':'change',()=>{save();refresh();});
 function confirmReplacement(){return new Promise(resolve=>{
  const dialog=$('builder-confirm-dialog');dialog.returnValue='cancel';
  const cancel=e=>{e.preventDefault();dialog.close('cancel');};
  dialog.addEventListener('cancel',cancel);
  dialog.addEventListener('close',()=>{dialog.removeEventListener('cancel',cancel);resolve(dialog.returnValue==='replace');},{once:true});
  $('builder-confirm-cancel').onclick=()=>dialog.close('cancel');$('builder-confirm-apply').onclick=()=>dialog.close('replace');dialog.showModal();
 });}
 async function apply(operation,askBeforeReplace=true){
  if(busy||!canApply())return toast('진행 중인 보정이 끝나면 적용해 주세요.');busy=true;
  try{for(const d of dictations)d.cancel();const draft=restoredPreview||buildPromptDraft({...read(),category:state.category,mode:getMode()});const applied=await applyBuilderDraft({existing:getExisting(),draft,operation,confirmReplace:askBeforeReplace?confirmReplacement:()=>true,onApply});if(applied){$('builder-note').textContent='Positive와 Negative 프롬프트에 '+(operation==='append'?'추가':'교체')+'했습니다. 내용을 확인하고 만들기를 누르세요.';toast('프롬프트를 '+(operation==='append'?'추가':'교체')+'했습니다.');}}catch(e){toast(e.message);}finally{busy=false;}
 }
 $('builder-add-speaker').onclick=()=>{if(state.current.speakers.length>=4)return;for(const d of dictations)d.cancel();save();state.update({speakers:[...state.current.speakers,{name:'',dialogue:'',language:'Korean',voice:''}]});renderSpeakers();refresh();};
 $('builder-append').onclick=()=>void apply('replace',false);$('builder-replace').onclick=()=>void apply('replace');
 for(const [id,target]of [['builder-copy-positive','builder-result'],['builder-copy-negative','builder-negative']])$(id).onclick=async()=>{try{await navigator.clipboard.writeText($(target).value);toast('프롬프트를 복사했습니다.');}catch{$(target).focus();$(target).select();toast('자동 복사가 지원되지 않습니다. 선택한 내용을 복사하세요.');}};
 panel.addEventListener('toggle',()=>{if(panel.open)refresh();else for(const d of dictations)d.cancel();});
 for(const node of document.querySelectorAll('[data-mode],#provider,#model,#duration'))node.addEventListener(node.matches('[data-mode]')?'click':'change',refresh);
 const observer=new MutationObserver(refresh);observer.observe($('model'),{childList:true});observer.observe($('duration'),{childList:true});
 voiceStudio=initBuilderVoices({api,autoload:false,getDuration:()=>getContext().duration,getDurations:()=>Array.from($('duration').options).filter(o=>!o.disabled).map(o=>Number(o.value)),setDuration:value=>{$('duration').value=String(value);$('duration').dispatchEvent(new Event('change',{bubbles:true}));},onCatalog:choices=>{save(false);voiceChoices=choices;renderSpeakers();refresh();},getScript:()=>read().audio==='speech'?read().speakers.map(s=>({voiceId:s.ttsVoice,text:s.dialogue,style:actorVoiceStyle(s)})):[],toast});
 function restore(snapshot,fallback){for(const d of dictations)d.cancel();voiceStudio.reset();const restored=snapshot||recoverBuilderSettings({...fallback,duration:getContext().duration},getMode());state.restore(restored);negativeSyncPending=false;restoredPreview=restored.positive?{positive:restored.positive,negative:restored.negative||'',recovered:restored.recovered,legacy:!snapshot&&!restored.recovered}:null;render();panel.open=!panel.hidden;}
 function snapshot(){save(false);return {category:state.category,...read(),positive:$('builder-result').value,negative:$('builder-negative').value};}
 render();return {refresh,state,restore,snapshot,loadVoices:()=>voiceStudio.load(),voiceAudioId:()=>voiceStudio.selectedAudioId()};
}
