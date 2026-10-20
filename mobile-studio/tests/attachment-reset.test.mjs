import {generationEditorSnapshot} from '../public/result-copy.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('accepted jobs clear only attachments; failed submissions retain images and settings',async()=>{
 const nodes=new Map(),$=s=>{if(!nodes.has(s))nodes.set(s,{value:'',src:'',hidden:false,disabled:false,textContent:'',replaceChildren(){this.empty=true;},removeAttribute(k){this[k]='';}});return nodes.get(s);};
 for(const [k,v]of Object.entries({prompt:'Original scene',negative:'text',model:'flux','prompt-choice':'original',seed:'99',duration:'6',guidance:'1.5',aspect:'16:9',resolution:'512x288',quality:'high','refined-prompt':'Edited scene','refined-negative':'blur'}))$('#'+k).value=v;
 const before=Object.fromEntries([...nodes].map(([k,n])=>[k,n.value])),revoked=[];let fail=true,sent;
 const context=vm.createContext({generationEditorSnapshot,$,mode:'image-image',uploadVersion:0,uploadBusy:false,uploadId:'one',selectedUploads:[{id:'one',url:'blob:one'},{id:'two',url:'blob:two'}],URL:{revokeObjectURL:u=>revoked.push(u)},crypto:webcrypto,TextEncoder,refineBusy:false,promptCandidate:null,sessionStorage:{getItem(){},setItem(){},removeItem(){}},toast(){},view(){},refresh:async()=>{},api:async(p,o)=>{sent=JSON.parse(o.body);if(fail)throw Error('network');}});
 vm.runInContext(source.slice(source.indexOf('function resetAttachments('),source.indexOf("$('#photo').onchange=")),context);
 vm.runInContext(source.slice(source.indexOf('function formValue('),source.indexOf('async function refinePrompt(')),context);
 vm.runInContext(source.slice(source.indexOf("$('#create-form').onsubmit="),source.indexOf('function regenerate(')),context);
 await $('#create-form').onsubmit({preventDefault(){}});assert.equal(context.uploadId,'one');assert.equal(context.selectedUploads.length,2);assert.equal(revoked.length,0);
 fail=false;await $('#create-form').onsubmit({preventDefault(){}});assert.deepEqual(sent.uploadIds,['one','two']);assert.equal(context.uploadId,null);assert.equal(context.selectedUploads.length,0);assert.equal($('#photo-preview').hidden,true);assert.equal($('#upload-previews').hidden,true);assert.equal($('#photo').value,'');assert.deepEqual(revoked,['blob:one','blob:two']);for(const [k,v]of Object.entries(before))assert.equal($(k).value,v,k);
});
