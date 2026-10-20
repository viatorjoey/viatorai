import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
test('refinement UI sends the chosen text model independently of the generator and unlocks after success or failure',async()=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),nodes=new Map(),$=s=>{if(!nodes.has(s))nodes.set(s,{value:'',disabled:false,selectedOptions:[{textContent:'ChatGPT test model'}]});return nodes.get(s);};
 $('#refinement-model').value='openai:chat';const requests=[];let fail=false;
 const ctx=vm.createContext({$,formValue:()=>({prompt:'숲속 오두막',model:'image-generator'}),sourceKey:()=> 'original',refineBusy:false,refineAttempt:0,promptCandidate:null,crypto,sessionStorage:{removeItem(){}},toast(){},api:async(p,o)=>{assert.equal($('#refinement-model').disabled,true);requests.push({p,body:JSON.parse(o.body)});if(fail)throw Error('API unavailable');return{id:'refinement',prompt:'A forest cabin',negative:'text',refinementModelLabel:'ChatGPT test model'};}});
 vm.runInContext(source.slice(source.indexOf('async function refinePrompt('),source.indexOf('async function waitRefinement(')),ctx);
 await vm.runInContext('refinePrompt()',ctx);assert.equal(requests[0].p,'/api/refinements');assert.equal(requests[0].body.refinementModel,'openai:chat');assert.equal(requests[0].body.model,'image-generator');assert.equal($('#refined-prompt').value,'A forest cabin');assert.equal($('#prompt-choice').value,'refined');assert.equal($('#refinement-model').disabled,false);
 fail=true;await vm.runInContext('refinePrompt()',ctx);assert.equal($('#refine-status').textContent,'API unavailable');assert.equal($('#refinement-model').disabled,false);assert.equal($('#refine-prompt').disabled,false);assert.equal(requests.length,2);
});


test('English refinement receives no Korean dialogue and restores all four verbatim speaker lines',async()=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),nodes=new Map(),$=s=>{if(!nodes.has(s))nodes.set(s,{value:'',disabled:false,selectedOptions:[{textContent:'Test LLM'}]});return nodes.get(s);};
 const lines=['안녕! "친구"','Hello!','こんにちは','你好'];const languages=['Korean','English','Japanese','Chinese'];
 const spoken=lines.map((line,i)=>'Speaker '+(i+1)+' speaks in '+languages[i]+': '+JSON.stringify(line)+'.');let original='Natural scene. '+spoken.join(' '),current=original,fail=false;
 $('#refinement-model').value='openai:chat';const ctx=vm.createContext({$,formValue:()=>({prompt:current,model:'video-generator'}),sourceKey:v=>v?.prompt??current,refineBusy:false,refineAttempt:0,promptCandidate:null,crypto,sessionStorage:{removeItem(){}},toast(){},api:async(p,o)=>{const input=JSON.parse(o.body);assert.doesNotMatch(input.prompt,/안녕|こんにちは|你好|speaks in/);if(fail)throw Error('provider failure');return{id:'example',prompt:'Refined English scene.',negative:'flicker'};}});
 vm.runInContext(source.slice(source.indexOf('async function refinePrompt('),source.indexOf('async function waitRefinement(')),ctx);
 await vm.runInContext('refinePrompt()',ctx);for(const line of spoken)assert.ok($('#refined-prompt').value.includes(line));assert.equal(current,original);
 fail=true;await vm.runInContext('refinePrompt()',ctx);assert.equal($('#refine-status').textContent,'provider failure');assert.equal(current,original);assert.equal($('#refinement-model').disabled,false);
});
