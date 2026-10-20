import test from 'node:test';
import assert from 'node:assert/strict';
import {resultCopyDraft,generationEditorSnapshot} from '../public/result-copy.js';
test('copied generation draft retains the exact recorded settings without randomizing or retaining execution identity',()=>{
 const source={id:'old-job',state:'complete',mode:'image-video',provider:'gemini',model:'gemini:veo',prompt:'Final prompt',negative:'blur',aspect:'9:16',resolution:'1280x720',quality:'standard',duration:8,seed:0,guidance:1,uploadId:'source-image',apiKey:'private',assets:[],meeting:{jobId:'remote-job'}};
 const draft=resultCopyDraft(source);
 for(const key of ['mode','provider','model','prompt','negative','aspect','resolution','quality','duration','seed','guidance','uploadId'])assert.equal(draft[key],source[key],key);
 for(const key of ['id','state','apiKey','assets','meeting'])assert.equal(draft[key],undefined,key);
 assert.equal(draft.useRefined,false);
});
test('copy keeps both original and final prompts and selects the actual final version even when it is Korean',()=>{
 const draft=resultCopyDraft({model:'openai:image',originalPrompt:'  원문\n',prompt:'  최종 프롬프트\n',originalNegative:'원본 제외',negative:'보정 제외'});
 assert.equal(draft.provider,'openai');assert.equal(draft.prompt,'  원문\n');assert.equal(draft.refinedPrompt,'  최종 프롬프트\n');assert.equal(draft.negative,'원본 제외');assert.equal(draft.refinedNegative,'보정 제외');assert.equal(draft.useRefined,true);
});
test('empty original prompts and zero settings are preserved, while absent values remain absent',()=>{
 const draft=resultCopyDraft({mode:'text-image',prompt:'Final',originalPrompt:'',seed:0,guidance:0});
 assert.equal(draft.prompt,'');assert.equal(draft.refinedPrompt,'Final');assert.equal(draft.useRefined,true);assert.equal(draft.seed,0);assert.equal(draft.guidance,0);assert.equal(draft.duration,undefined);
});

test('copy restores independent LLM and director snapshots including four verbatim speaker lines',()=>{
 const editor={version:1,promptChoice:'original',refinementModel:'gemini:text',refinedPrompt:'Unused polished draft',refinedNegative:'polished negative',builder:{category:'general',subject:'A meeting',duration:'8',audio:'speech',timing:'natural',direction:'Slow camera movement',selections:{'손과 팔':'2'},speakers:Array.from({length:4},(_,i)=>({name:'화자 '+i,dialogue:'대사 "'+i+'"\n다음 줄',language:'Korean',voice:'1',emotion:String(i),pace:String(i),acting:{'표정':String(i),'손과 팔':'0'},ttsVoice:'gemini:Kore'})),positive:'Exact builder prompt',negative:'Exact builder negative',apiKey:'never-copy'}};
 const draft=resultCopyDraft({prompt:'Used original',negative:'used negative',generationEditor:editor});
 assert.equal(draft.refinementModel,'gemini:text');assert.equal(draft.useRefined,false);assert.equal(draft.refinedPrompt,'Unused polished draft');assert.deepEqual(draft.generationEditor.builder.speakers,editor.builder.speakers);assert.equal(draft.generationEditor.builder.positive,'Exact builder prompt');assert.equal(draft.generationEditor.builder.apiKey,undefined);
 draft.generationEditor.builder.speakers[0].dialogue='Changed';draft.generationEditor.builder.selections['손과 팔']='3';assert.notEqual(editor.builder.speakers[0].dialogue,'Changed');assert.equal(editor.builder.selections['손과 팔'],'2');
 assert.equal(generationEditorSnapshot({version:2}),null);
});

test('exercise director snapshots retain actor movements and camera settings when copied',()=>{
 const builder={category:'exercise',speakers:[{name:'강사',dialogue:'',acting:{'운동 동작':'23','운동 호흡':'2'}}],selections:{'촬영 각도':'1'},positive:'Workout demo'};
 const saved=generationEditorSnapshot({version:1,builder});assert.equal(saved.builder.category,'exercise');assert.equal(saved.builder.speakers[0].acting['운동 동작'],'23');assert.equal(saved.builder.selections['촬영 각도'],'1');
});
