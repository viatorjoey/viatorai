import {generationEditorSnapshot} from '../public/result-copy.js';
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import {webcrypto} from 'node:crypto';import {chatMemoryBudget} from '../cpu-chat.mjs';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('replacing only the reference image submits existing edited English without another refinement',async()=>{
 const nodes=new Map(),$=s=>{if(!nodes.has(s))nodes.set(s,{value:'',checked:false,disabled:false});return nodes.get(s);};
 for(const [k,v] of Object.entries({prompt:'한글 호수',negative:'글씨',aspect:'16:9',quality:'high',resolution:'512x288',duration:'6',seed:'42',guidance:'1',model:'flux', 'refined-prompt':'A tranquil lake','refined-negative':'text','prompt-choice':'refined'}))$('#'+k).value=v;$('#enhance').checked=true;
 const calls=[],store=new Map(),context=vm.createContext({generationEditorSnapshot,$,uploadVersion:0,resetAttachments(){},uploadBusy:false,selectedUploads:[],mode:'image-image',uploadId:'old-image',crypto:webcrypto,TextEncoder,sessionStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},refineBusy:false,view(){},refresh:async()=>{},toast(){},api:async(p,o)=>{calls.push({p,body:JSON.parse(o.body)});return{};},refinePrompt:()=>{throw Error('must reuse');}});
 vm.runInContext(source.slice(source.indexOf('function formValue('),source.indexOf('async function refinePrompt(')),context);
 vm.runInContext("var promptCandidate={id:'preview',source:sourceKey()};uploadId='new-image';",context);
 vm.runInContext(source.slice(source.indexOf("$('#create-form').onsubmit="),source.indexOf('function regenerate(')),context);
 await $('#create-form').onsubmit({preventDefault(){}});assert.equal(calls.length,1);assert.equal(calls[0].p,'/api/jobs');assert.equal(calls[0].body.uploadId,'new-image');assert.equal(calls[0].body.prompt,'A tranquil lake');assert.equal(calls[0].body.originalPrompt,'한글 호수');assert.equal(calls[0].body.editorSourceId,'preview');
 $('#prompt-choice').value='original';vm.runInContext('promptCandidate=null',context);await $('#create-form').onsubmit({preventDefault(){}});assert.equal(calls.length,2);assert.equal(calls[1].body.prompt,'한글 호수');assert.equal(calls[1].body.editorSourceId,undefined);
 context.selectedUploads=[{id:'first'},{id:'second'}];await $('#create-form').onsubmit({preventDefault(){}});assert.deepEqual(calls.at(-1).body.uploadIds,['first','second']);assert.equal(calls.at(-1).body.prompt,'한글 호수');
 const old=vm.runInContext('sourceKey()',context);$('#prompt').value='다른 장면';assert.notEqual(vm.runInContext('sourceKey()',context),old);
});
test('CPU refinement shares one RAM slot with chat, forces CPU and keeps memory reserve',async()=>{
 const text=readFileSync(new URL('../cpu-chat.mjs',import.meta.url),'utf8'),code=text.slice(text.indexOf('async function refine(value)'),text.indexOf('return {dispatch,refine,'));
 let active=0,max=0;const ctx=vm.createContext({testMode:false,busy:false,pendingRefinements:0,Date,Error,Promise,setTimeout,ensureService:async()=>{},os:{freemem:()=>40*1024**3},chatMemoryBudget,cpu(){},managedChat:async(_,value)=>{assert.equal(value.options.num_gpu,0);assert.equal(value.options.num_ctx,4096);max=Math.max(max,++active);await new Promise(r=>setTimeout(r,10));active--;return {done:true};}});vm.runInContext(code,ctx);const value={model:'qwen3.5:9b',options:{}};ctx.value=value;await Promise.all([vm.runInContext('refine(value)',ctx),vm.runInContext('refine(value)',ctx)]);assert.equal(max,1);assert.equal(ctx.busy,false);assert.equal(ctx.pendingRefinements,0);
 ctx.os.freemem=()=>18*1024**3;await assert.rejects(vm.runInContext('refine(value)',ctx),/RAM/);assert.equal(ctx.busy,false);
});
