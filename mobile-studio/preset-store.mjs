import {generationEditorSnapshot} from './public/result-copy.js';
import {cloudInput} from './cloud-studio.mjs';
import {randomUUID} from 'node:crypto';
import {validateInput} from './graphs.mjs';
export function createPresetStore(db){
 db.exec('CREATE TABLE IF NOT EXISTS presets(id TEXT PRIMARY KEY,created INTEGER,body TEXT)');
 const get=id=>{const row=db.prepare('SELECT body FROM presets WHERE id=?').get(id);return row?JSON.parse(row.body):null;};
 function save(x,id=randomUUID()){
  if(!/^[a-f0-9-]{36}$/.test(id))throw Error('저장 요청 번호를 확인하세요.');const prior=get(id);if(prior)return prior;
  const uploadIds=x.uploadIds??(x.uploadId?[x.uploadId]:[]);
  if(!Array.isArray(uploadIds)||uploadIds.length>50||new Set(uploadIds).size!==uploadIds.length||uploadIds.some(id=>typeof id!=='string'||!db.prepare('SELECT 1 FROM uploads WHERE id=?').get(id)))throw Error('저장할 첨부 이미지를 확인하세요.');
  const validate=/^(openai|gemini|xai|anthropic):/.test(x.model||'')?v=>cloudInput(v,[{id:x.model,provider:x.model.split(':')[0],modes:['text-image','image-image','text-video','image-video'],connected:true}]):validateInput;
  const value=validate({...x,prompt:x.prompt||'Saved settings',uploadId:uploadIds[0]||'00000000-0000-0000-0000-000000000000',enhance:false});value.prompt=String(x.prompt||'');value.uploadId=uploadIds[0]||null;
  const refinedPrompt=String(x.refinedPrompt||''),refinedNegative=String(x.refinedNegative||'');if(refinedPrompt.length>3000||refinedNegative.length>1000)throw Error('보정 프롬프트가 너무 깁니다.');
  const preset={...value,generationEditor:generationEditorSnapshot(x.generationEditor),id,created:Date.now(),title:(value.prompt.trim()||'저장한 설정').slice(0,60),uploadIds,refinedPrompt,refinedNegative,promptChoice:x.promptChoice==='original'?'original':'refined'};
  db.prepare('INSERT INTO presets VALUES(?,?,?)').run(id,preset.created,JSON.stringify(preset));return preset;
 }
 return {get,save,remove:id=>db.prepare('DELETE FROM presets WHERE id=?').run(id).changes>0,list:()=>db.prepare('SELECT body FROM presets ORDER BY created DESC').all().map(r=>{const p=JSON.parse(r.body);return {id:p.id,title:p.title,created:p.created,mode:p.mode,imageCount:p.uploadIds.length};})};
}
