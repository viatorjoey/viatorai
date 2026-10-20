import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
test('background reply polling preserves a newly selected model and ignores results for another chat',async()=>{
 const src=readFileSync(new URL('../public/chat.js',import.meta.url),'utf8'),nodes={'#chat-model':{value:'gpt-oss:20b'},'#chat-messages':{scrollHeight:0,scrollTop:0,clientHeight:0,replaceChildren(){},append(){}},'#chat-progress':{},'#chat-send':{}};
 const context={current:{id:'first'},requestedChat:'first',lastMessages:'',sessionStorage:{setItem(){}},$:s=>nodes[s],api:async()=>({id:'first',model:'qwen3.5:9b',messages:[],pending:{state:'complete'}})};
 vm.runInNewContext(src.slice(src.indexOf('async function load('),src.indexOf('async function history(')),context);
 await context.load('first',false);assert.equal(nodes['#chat-model'].value,'gpt-oss:20b');await context.load('first',true);assert.equal(nodes['#chat-model'].value,'qwen3.5:9b');context.requestedChat='second';context.current={id:'second'};await context.load('first',false);assert.equal(context.current.id,'second');
});


test('chat Enter sends once, Shift+Enter inserts a newline, and Korean composition never sends',()=>{
 const src=readFileSync(new URL('../public/chat.js',import.meta.url),'utf8');let sent=0,prevented=0;
 const input={},send={disabled:false},form={requestSubmit(){sent++;}},context={$:s=>({'#chat-input':input,'#chat-send':send,'#chat-form':form}[s])};
 vm.runInNewContext(src.slice(src.indexOf(" $('#chat-input').onkeydown="),src.indexOf(" bindDictation(")),context);
 const press=extra=>input.onkeydown({key:'Enter',preventDefault(){prevented++;},...extra});
 press({});assert.equal(sent,1);assert.equal(prevented,1);
 press({shiftKey:true});assert.equal(sent,1);assert.equal(prevented,1);
 press({isComposing:true});press({keyCode:229});assert.equal(sent,1);assert.equal(prevented,1);
 press({repeat:true});assert.equal(sent,1);
 send.disabled=true;press({});assert.equal(sent,1);
 send.disabled=false;press({ctrlKey:true});assert.equal(sent,2);
 press({key:'a'});assert.equal(sent,2);
});
