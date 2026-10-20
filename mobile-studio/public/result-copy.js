const editorSelections=value=>Object.fromEntries(Object.entries(value||{}).filter(([k,v])=>k.length<=80&&/^\d{0,3}$/.test(String(v))).slice(0,64).map(([k,v])=>[k,String(v)]));
// UI-only settings: never copy credentials, job identity, or execution state.
export function generationEditorSnapshot(value){
 if(!value||value.version!==1)return null;
 const string=(s,max)=>typeof s==='string'?s.slice(0,max):'';
 const result={version:1,promptChoice:value.promptChoice==='refined'?'refined':'original',refinementModel:string(value.refinementModel,160),refinedPrompt:string(value.refinedPrompt,6000),refinedNegative:string(value.refinedNegative,1000)};
 const b=value.builder;
 if(b&&['general','sensual','dance','exercise'].includes(b.category))result.builder={category:b.category,subject:string(b.subject,500),direction:string(b.direction,700),duration:string(String(b.duration??'10'),3),audio:['speech','ambient','silent'].includes(b.audio)?b.audio:'speech',timing:['sequential','simultaneous','natural'].includes(b.timing)?b.timing:'sequential',selections:Object.fromEntries(Object.entries(b.selections||{}).filter(([k,v])=>k.length<=80&&/^\d{0,3}$/.test(String(v))).slice(0,64).map(([k,v])=>[k,String(v)])),speakers:(Array.isArray(b.speakers)?b.speakers:[]).slice(0,4).map(s=>({name:string(s.name,40),dialogue:string(s.dialogue,500),language:string(s.language,20),voice:string(s.voice,3),...(typeof s.emotion==='string'?{emotion:string(s.emotion,3)}:{}),...(typeof s.pace==='string'?{pace:string(s.pace,3)}:{}),...(s.acting&&typeof s.acting==='object'?{acting:editorSelections(s.acting)}:{}),ttsVoice:string(s.ttsVoice,160)})),positive:string(b.positive,6000),negative:string(b.negative,1000)};
 return result;
}
// Rebuild an editable generation draft; never queue or submit a job here.
export function resultCopyDraft(job){
 const fields=['mode','model','uploadId','aspect','quality','resolution','duration','seed','guidance'];
 const draft={provider:job.provider||(/^(openai|gemini|xai|anthropic):/.test(job.model||'')?job.model.split(':')[0]:'local')};
 for(const key of fields)if(job[key]!==undefined&&job[key]!==null)draft[key]=job[key];
 draft.prompt=job.originalPrompt??job.prompt??'';
 draft.negative=job.originalNegative??job.negative??'';
 draft.generationEditor=generationEditorSnapshot(job.generationEditor);
 draft.refinedPrompt=draft.generationEditor?.refinedPrompt||job.refinedPrompt||job.prompt||draft.prompt;
 draft.refinedNegative=(draft.generationEditor?.refinedPrompt?draft.generationEditor.refinedNegative:undefined)??job.refinedNegative??job.negative??draft.negative;
 draft.useRefined=draft.generationEditor?draft.generationEditor.promptChoice==='refined':job.promptChoice?job.promptChoice==='refined':!!job.refinedAt||draft.refinedPrompt!==draft.prompt||draft.refinedNegative!==draft.negative;
 draft.refinementModel=draft.generationEditor?.refinementModel||job.refinementModel||'';
 return draft;
}
