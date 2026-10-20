import {resultCopyDraft} from '../public/result-copy.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('regenerate opens an editable bilingual draft, preserves settings and submits no job',()=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const nodes=new Map();const $=s=>{if(!nodes.has(s))nodes.set(s,{value:'',options:[],append(o){this.options.push(o);},hidden:false,checked:false,onchange(){},oninput(){},close(){}});return nodes.get(s);};
 let currentView,restored,apiCalls=0;const context=vm.createContext({$,resultCopyDraft,refineBusy:false,promptDictation:{cancel(){}},promptBuilder:{restore:(...v)=>restored=v},renderAttachments(){},refinementModelNote(){},el:()=>({}),productionModel:()=> 'LTX',resetAttachments(){},choose(){},modelOptions(preferred){$('#model').value=preferred;},sourceKey:()=> 'source',sessionStorage:{removeItem(){}},view:v=>currentView=v,api(){apiCalls++;}});
 vm.runInContext('let promptCandidate,uploadId;'+source.slice(source.indexOf('function regenerate('),source.indexOf('const galleryJobs=')),context);
 context.job={id:'source',state:'complete',mode:'text-video',model:'ltx',originalPrompt:'노을의 호수',prompt:'A lake at sunset',originalNegative:'글씨',negative:'text',refinedAt:123,aspect:'16:9',resolution:'512x288',duration:6,seed:987,guidance:1};
 vm.runInContext('regenerate(job)',context);assert.equal(currentView,'create');assert.equal(apiCalls,0);assert.equal($('#prompt').value,'노을의 호수');assert.equal($('#refined-prompt').value,'A lake at sunset');assert.equal($('#negative').value,'글씨');assert.equal($('#refined-negative').value,'text');assert.equal($('#seed').value,987);assert.equal($('#resolution').value,'512x288');assert.equal($('#refine-result').hidden,false);assert.equal($('#prompt-choice').value,'refined');assert.equal(vm.runInContext('promptCandidate.editor',context),true);assert.equal(restored[1].positive,'노을의 호수');
 context.job={...context.job,mode:'image-video',uploadId:'original-photo',generationEditor:{version:1,promptChoice:'refined',refinementModel:'gemini:text',refinedPrompt:'Final scene',refinedNegative:'blur',builder:{category:'general',subject:'Lake',duration:'6',speakers:[]}}};vm.runInContext('regenerate(job)',context);assert.equal(vm.runInContext('selectedUploads[0].id',context),'original-photo');assert.equal($('#refinement-model').value,'gemini:text');assert.equal(restored[0].subject,'Lake');assert.equal(apiCalls,0);
});
