import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
import {videoGraph} from '../graphs.mjs';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),context=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('// BEGIN PROMPT BUILDER'),source.indexOf('// END PROMPT BUILDER')),context);
const {PROMPT_SPEC,buildPromptDraft,createBuilderState,mergeBuilderPrompts,applyBuilderDraft}=vm.runInContext('({PROMPT_SPEC,buildPromptDraft,createBuilderState,mergeBuilderPrompts,applyBuilderDraft})',context);
const recoverBuilderSettings=vm.runInContext('recoverBuilderSettings',context);
const actorVoiceStyle=vm.runInContext('actorVoiceStyle',context);

test('each actor has independent timbre and emotion in both video instructions and external voice style',()=>{
 const speakers=Array.from({length:4},(_,i)=>({name:'배우 '+i,dialogue:'대사 '+i,language:'Korean',voice:String(i),emotion:String(7-i)}));
 const draft=buildPromptDraft({speakers}),restored=recoverBuilderSettings(draft,'text-video');
 for(const [i,speaker]of speakers.entries()){
  const tone=PROMPT_SPEC.modes.general['목소리 음색'].options[Number(speaker.voice)].prompt,emotion=PROMPT_SPEC.modes.general['목소리 감정'].options[Number(speaker.emotion)].prompt;
  assert.ok(draft.positive.includes(`Speaker ${i+1} voice: ${tone}.`));assert.ok(draft.positive.includes(`Speaker ${i+1} emotion: ${emotion}.`));assert.equal(actorVoiceStyle(speaker),`Speak in Korean. ${tone}, ${emotion}`);assert.equal(restored.speakers[i].emotion,speaker.emotion);
 }
 assert.equal(restored.selections['목소리 감정'],undefined);assert.equal(actorVoiceStyle({language:'English',voice:'',emotion:''}),'Speak in English. Natural clear delivery');
 assert.equal(buildPromptDraft({...restored,mode:'text-video'}).positive,draft.positive);
});

test('old shared timbre and emotion migrate to each actor while keeping actor overrides and independent saved copies',()=>{
 const source={category:'general',selections:{'목소리 음색':'3','목소리 감정':'4','손과 팔':'0'},speakers:[{dialogue:'A',voice:'2'},{dialogue:'B',voice:'',emotion:'1'}]};
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},state=createBuilderState(storage);state.restore(source);
 assert.equal(state.current.speakers[0].voice,'2');assert.equal(state.current.speakers[0].emotion,'4');assert.equal(state.current.speakers[1].voice,'3');assert.equal(state.current.speakers[1].emotion,'1');assert.equal(state.current.selections['목소리 음색'],undefined);assert.equal(state.current.selections['목소리 감정'],undefined);assert.equal(state.current.selections['손과 팔'],undefined);assert.equal(state.current.speakers[0].acting['손과 팔'],'0');assert.equal(state.current.speakers[1].acting['손과 팔'],'0');
 state.current.speakers[0].emotion='6';assert.equal(source.speakers[0].emotion,undefined);state.update({speakers:state.current.speakers});const reloaded=createBuilderState(storage);assert.equal(reloaded.current.speakers[0].emotion,'6');assert.equal(reloaded.current.speakers[1].emotion,'1');
});

test('legacy results recover directing controls for every catalog option without changing the original prompt',()=>{
 for(const [category,fields]of Object.entries(PROMPT_SPEC.modes))for(const [key,field]of Object.entries(fields))for(const [i]of field.options.entries()){
  const draft=buildPromptDraft({category,mode:'text-video',subject:'A quiet room',duration:'6',selections:{[key]:String(i)}}),restored=recoverBuilderSettings(draft,'text-video');
  assert.equal(restored.recovered,true);assert.equal(restored.subject,'A quiet room');assert.equal(restored.duration,'6');assert.equal(buildPromptDraft({...restored,mode:'text-video'}).positive,draft.positive,`${category}/${key}/${i}`);
 }
});

test('legacy image-video restores four speakers, names, voices and escaped multiline dialogue without treating dialogue as option selections',()=>{
 const speakers=[{name:'A',dialogue:'golden-hour light "안녕"\n두 번째 줄',language:'Korean',voice:'2'},{name:'B',dialogue:'Hello!',language:'English',voice:'1'},{name:'C',dialogue:'こんにちは',language:'Japanese',voice:'3'},{name:'D',dialogue:'你好',language:'Chinese',voice:'0'}];
 for(const timing of ['sequential','simultaneous','natural']){
  const draft=buildPromptDraft({mode:'image-video',subject:'A group conversation',direction:'A gentle camera movement',duration:'6',timing,speakers,selections:{'손과 팔':'0'}}),restored=recoverBuilderSettings(draft,'image-video');
  assert.equal(restored.subject,'A group conversation');assert.equal(restored.direction,'A gentle camera movement');assert.equal(restored.timing,timing);assert.equal(restored.selections['조명'],undefined);assert.deepEqual(JSON.parse(JSON.stringify(restored.speakers)),speakers);assert.equal(buildPromptDraft({...restored,mode:'image-video'}).positive,draft.positive);
 }
 const arbitrary=recoverBuilderSettings({positive:'A plain scene',negative:'blur'},'text-video');assert.equal(arbitrary.subject,'A plain scene');assert.equal(arbitrary.recovered,undefined);assert.equal(arbitrary.positive,'A plain scene');
});
test('catalog has all 369 options and every option appears in its category prompt',()=>{
 const counts={};for(const [category,fields]of Object.entries(PROMPT_SPEC.modes)){counts[category]=0;for(const [key,field]of Object.entries(fields))for(const [i,option]of field.options.entries()){counts[category]++;const d=buildPromptDraft({mode:'text-video',category,audio:'speech',selections:{[key]:String(i)}});assert.ok(d.positive.includes(option.prompt),key+': '+option.label);assert.ok(d.positive.length<=3000);assert.equal(d.negative,PROMPT_SPEC.negative_prompt);}}
 assert.deepEqual(counts,{general:114,sensual:89,dance:94,exercise:72});
 const canonical=JSON.parse(readFileSync(new URL('../prompt-builder-catalog.json',import.meta.url),'utf8'));assert.deepEqual(JSON.parse(JSON.stringify(PROMPT_SPEC)),canonical);
});
test('I2V always retains original face hair clothes background, even with custom direction',()=>{
 const d=buildPromptDraft({mode:'image-video',subject:'The person waves',direction:'A subtle gesture',selections:{'손과 팔':'0'}});assert.match(d.positive,/original face, hair, clothing and background/);assert.match(d.positive,/waves right hand/);assert.match(d.positive,/A subtle gesture/);
});
test('up to four speakers retain verbatim quotes, lines, language, voice and ordered turn-taking',()=>{
 const speakers=[{name:'민지',dialogue:'안녕! "반가워"\n정말.',language:'Korean',voice:'2'},{dialogue:'Hello!',language:'English'},{dialogue:'こんにちは',language:'Japanese'},{dialogue:'你好',language:'Chinese'}];
 const d=buildPromptDraft({speakers,selections:{'전신':'1','손과 팔':'0'},timing:'sequential'});
 speakers.forEach((s,i)=>assert.ok(d.positive.includes('Speaker '+(i+1)+' speaks in '+s.language+': '+JSON.stringify(s.dialogue)+'.')));
 assert.match(d.positive,/First:/);assert.match(d.positive,/Then:/);assert.match(d.positive,/While speaking/);assert.match(d.positive,/Finally:/);assert.match(d.positive,/without overlapping dialogue/);assert.match(d.positive,/warm husky voice/);
 assert.throws(()=>buildPromptDraft({speakers:[...speakers,{}]}),/4명/);
});
test('silent and ambient modes cannot silently drop typed dialogue or add selected voice cues',()=>{
 assert.throws(()=>buildPromptDraft({audio:'silent',speakers:[{dialogue:'안녕'}]}),/대사/);
 for(const audio of ['silent','ambient']){const d=buildPromptDraft({audio,selections:{'목소리 음색':'2'}});assert.doesNotMatch(d.positive,/husky|speaks in/);assert.match(d.positive,audio==='silent'?/Silent video/:/ambient sound/);}
});
test('simultaneous mode explicitly staggers incompatible actions and rejects malformed choices',()=>{
 const d=buildPromptDraft({timing:'simultaneous',selections:{'손과 팔':'3','전신':'3','프레이밍':'9999','조명':'oops'}});assert.match(d.positive,/staggering any conflicting/);assert.match(d.positive,/peace sign/);assert.match(d.positive,/sits down/);assert.doesNotMatch(d.positive,/undefined|NaN/);
 assert.throws(()=>buildPromptDraft({speakers:[{dialogue:'x'.repeat(501)}]}),/500/);
 assert.throws(()=>buildPromptDraft({subject:'x'.repeat(501)}),/500/);
});
test('tab settings and four speaker dialogue survive tab switches and storage reload',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};let s=createBuilderState(storage);
 s.update({selections:{'눈과 시선':'3'},speakers:[{dialogue:'첫 번째',language:'Korean'},{dialogue:'두 번째'}],duration:'8'});s.select('dance');s.update({selections:{'장르':'18'},speakers:[{dialogue:'댄스'}]});s.select('general');assert.equal(s.current.speakers[0].acting['눈과 시선'],'3');assert.equal(s.current.speakers[1].dialogue,'두 번째');assert.equal(s.current.duration,'8');s=createBuilderState(storage);assert.equal(s.category,'general');s.select('dance');assert.equal(s.current.speakers[0].acting['장르'],'18');assert.equal(s.current.speakers[0].dialogue,'댄스');
});

test('restoring a director snapshot replaces previous controls rather than mixing another job settings',()=>{
 const state=createBuilderState();state.update({subject:'Other job',selections:{'조명':'1'},speakers:[{dialogue:'Old line'}]});
 const snapshot={category:'dance',subject:'New scene',duration:'6',audio:'speech',timing:'natural',direction:'Slowly',selections:{'장르':'2'},speakers:[{name:'A',dialogue:'New line',language:'Korean',voice:'2',ttsVoice:'openai:coral'}]};
 state.restore(snapshot);assert.equal(state.category,'dance');assert.equal(state.current.subject,'New scene');assert.equal(state.current.selections['조명'],undefined);assert.equal(state.current.speakers[0].ttsVoice,'openai:coral');state.current.speakers[0].dialogue='Edited';assert.equal(snapshot.speakers[0].dialogue,'New line');
 state.restore(null);assert.equal(state.category,'general');assert.equal(state.current.subject,'');assert.equal(state.current.speakers[0].dialogue,'');
});
test('append preserves existing positive, merges negative without duplicates; replace cancellation is atomic',async()=>{
 const draft=buildPromptDraft({}),existing={positive:'Existing scene',negative:'flicker, watermark'};
 const appended=mergeBuilderPrompts(existing,draft,'append');assert.ok(appended.positive.startsWith('Existing scene\n\n'));assert.equal(appended.negative.split(', ').filter(s=>s==='flicker').length,1);
 let applied=0,confirmed=0;assert.equal(await applyBuilderDraft({existing,draft,operation:'replace',confirmReplace:()=>{confirmed++;return false;},onApply:()=>applied++}),false);assert.equal(applied,0);assert.equal(confirmed,1);
 await applyBuilderDraft({existing,draft,operation:'replace',confirmReplace:()=>true,onApply:value=>{applied++;assert.equal(value.positive,draft.positive);assert.equal(value.negative,draft.negative);}});assert.equal(applied,1);
 assert.throws(()=>mergeBuilderPrompts({positive:'x'.repeat(2999)},draft,'append'),/한도/);
});
test('builder is folded below LLM, its controls cannot submit, speaker UI has microphone integration',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),part=html.slice(html.indexOf('<details id="prompt-builder">'),html.indexOf('<details id="settings">'));
 assert.ok(html.indexOf('id="prompt-options"')<html.indexOf('id="prompt-builder"'));assert.ok(part.includes('고급 연출 프롬프트'));assert.ok(part.startsWith('<details id="prompt-builder">'));
 for(const button of part.matchAll(/<button\b([^>]*)>/g))assert.match(button[1],/type="button"/);
 assert.ok(source.includes('dictations.push(bindDictation('));assert.ok(source.includes('d.dispose()'));
});
test('audio support message is backed by actual executable ComfyUI audio path',()=>{
 for(const mode of ['text-video','image-video']){const g=videoGraph({mode,prompt:'test',quality:'high',duration:10,seed:42,guidance:1,aspect:'9:16'},'audio-check','reference.png');const create=Object.values(g).find(n=>n.class_type==='CreateVideo');assert.ok(create.inputs.audio);assert.equal(g[create.inputs.audio[0]].class_type,'LTXVAudioVAEDecode');assert.ok(Object.values(g).some(n=>n.class_type==='LTXVEmptyLatentAudio'));}
});


test('replacement dialog resolves cancel, Escape and confirm separately and resets between openings',async()=>{
 const runtime=readFileSync(new URL('../prompt-builder-runtime.js',import.meta.url),'utf8'),code=runtime.slice(runtime.indexOf(' function confirmReplacement(){'),runtime.indexOf(' async function apply('));
 class Dialog extends EventTarget{showModal(){this.open=true;}close(value){this.returnValue=value;this.open=false;this.dispatchEvent(new Event('close'));}}
 const dialog=new Dialog(),nodes={'builder-confirm-dialog':dialog,'builder-confirm-cancel':{},'builder-confirm-apply':{}};
 const ctx=vm.createContext({$:id=>nodes[id],Promise});vm.runInContext(code,ctx);
 let pending=vm.runInContext('confirmReplacement()',ctx);assert.equal(dialog.open,true);nodes['builder-confirm-cancel'].onclick();assert.equal(await pending,false);
 pending=vm.runInContext('confirmReplacement()',ctx);nodes['builder-confirm-apply'].onclick();assert.equal(await pending,true);
 pending=vm.runInContext('confirmReplacement()',ctx);dialog.dispatchEvent(new Event('cancel',{cancelable:true}));assert.equal(await pending,false);assert.equal(dialog.open,false);
});

test('applying the latest draft repeatedly replaces older positive and negative text without accumulating',async()=>{let value={positive:'old prompt',negative:'old exclusions'};const first=buildPromptDraft({subject:'First scene'}),last=buildPromptDraft({subject:'Final scene'});for(const draft of [first,last,last])await applyBuilderDraft({existing:value,draft,operation:'replace',confirmReplace:()=>true,onApply:next=>{value=next;}});assert.equal(value.positive,last.positive);assert.equal(value.negative,last.negative);assert.doesNotMatch(value.positive,/old prompt|First scene/);});

test('advanced draft uses the screen duration as its single source and no longer has a second duration selector',()=>{
 const runtime=readFileSync(new URL('../prompt-builder-runtime.js',import.meta.url),'utf8'),html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/id="builder-duration"/);assert.equal((html.match(/id="duration"/g)||[]).length,1);
 const nodes={'builder-subject':{value:''},'builder-audio':{value:'speech'},'builder-timing':{value:'natural'},'builder-direction':{value:''},duration:{value:'6'},'builder-speakers':{querySelectorAll:()=>[]},'builder-fields':{querySelectorAll:()=>[]}};
 const ctx=vm.createContext({$:id=>nodes[id],getContext:()=>({duration:Number(nodes.duration.value)}),BUILDER_COMMON:['subject','audio','timing','direction']});
 vm.runInContext(runtime.slice(runtime.indexOf(' const read=()=>'),runtime.indexOf(' const save='))+';globalThis.readDraft=read;',ctx);
 for(const duration of ['4','6','8','15']){nodes.duration.value=duration;const draft=buildPromptDraft(ctx.readDraft());assert.equal(draft.duration,Number(duration));assert.match(draft.positive,new RegExp(duration+'-second shot'));}
});

test('actor performance and pace remain independent through reconstruction and silent performance',()=>{
 const speakers=[{name:'A',dialogue:'First',language:'Korean',voice:'1',emotion:'2',pace:'0',acting:{'표정':'1','눈과 시선':'2','손과 팔':'0'}},{name:'B',dialogue:'Second',language:'English',voice:'2',emotion:'3',pace:'2',acting:{'표정':'3','전신':'1'}}];
 const draft=buildPromptDraft({speakers,selections:{'조명':'1'},timing:'natural'}),restored=recoverBuilderSettings(draft);
 for(const [i,speaker]of speakers.entries()){assert.deepEqual(JSON.parse(JSON.stringify(restored.speakers[i])),speaker);assert.ok(actorVoiceStyle(speaker).includes(PROMPT_SPEC.modes.general['속도와 호흡'].options[Number(speaker.pace)].prompt));}
 assert.equal(restored.selections['표정'],undefined);assert.equal(restored.selections['속도와 호흡'],undefined);assert.equal(restored.selections['조명'],'1');assert.equal(buildPromptDraft(restored).positive,draft.positive);
 const silent=buildPromptDraft({audio:'silent',speakers:speakers.map(s=>({...s,dialogue:''}))}),recovered=recoverBuilderSettings(silent);
 assert.ok(silent.positive.includes('Speaker 1 performance:'));assert.ok(silent.positive.includes('Speaker 2 performance:'));assert.doesNotMatch(silent.positive,/Speaker [12] pace:/);assert.deepEqual(JSON.parse(JSON.stringify(recovered.speakers[1].acting)),speakers[1].acting);
});

test('sensual adds ten options per requested actor field and restores each actor independently',()=>{
 const keys=['눈과 시선','입술','고개와 상체','손과 팔'];
 for(const key of keys){const field=PROMPT_SPEC.modes.sensual[key];assert.equal(field.options.length,10);assert.equal(new Set(field.options.map(o=>o.label)).size,10);}
 for(let option=0;option<10;option++){
  const speakers=Array.from({length:4},(_,i)=>({name:'배우 '+(i+1),dialogue:'',acting:Object.fromEntries(keys.map(key=>[key,String((option+i)%10)]))}));
  const draft=buildPromptDraft({category:'sensual',speakers,audio:'silent'}),restored=recoverBuilderSettings(draft);
  assert.equal(restored.category,'sensual');
  for(const [i,speaker]of speakers.entries())for(const key of keys)assert.equal(restored.speakers[i].acting[key],speaker.acting[key]);
  assert.equal(buildPromptDraft({...restored,audio:'silent'}).positive,draft.positive);
 }
});

test('exercise contains ten stretching, yoga and Pilates moves and preserves the new tab and actor settings',()=>{
 const options=PROMPT_SPEC.modes.exercise['운동 동작'].options;
 for(const group of ['스트레칭','요가','필라테스'])assert.equal(options.filter(o=>o.group===group).length,10);
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},state=createBuilderState(storage);
 state.select('exercise');state.update({speakers:[{name:'강사',dialogue:'',acting:{'운동 동작':'23','운동 속도':'1','운동 호흡':'2','동작 범위':'1'}}],selections:{'촬영 각도':'2'}});state.select('dance');state.select('exercise');
 assert.equal(state.current.speakers[0].acting['운동 동작'],'23');assert.equal(createBuilderState(storage).category,'exercise');
 const draft=buildPromptDraft({...state.current,category:'exercise',audio:'silent'}),restored=recoverBuilderSettings(draft);assert.equal(restored.category,'exercise');assert.equal(restored.speakers[0].acting['운동 동작'],'23');assert.equal(buildPromptDraft({...restored,mode:'text-video'}).positive,draft.positive);
 for(const [i]of options.entries()){const d=buildPromptDraft({category:'exercise',speakers:[{acting:{'운동 동작':String(i)}}]}),r=recoverBuilderSettings(d);assert.equal(r.speakers[0].acting['운동 동작'],String(i));}
});
