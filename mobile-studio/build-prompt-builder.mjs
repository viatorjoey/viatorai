import {readFileSync,writeFileSync} from 'node:fs';
const url=name=>new URL(name,import.meta.url);
const spec=JSON.parse(readFileSync(url('prompt-builder-catalog.json'),'utf8'));
const runtime=readFileSync(url('prompt-builder-runtime.js'),'utf8');
const bundle='// BEGIN PROMPT BUILDER\nconst {initPromptBuilder,buildPromptDraft,recoverBuilderSettings,actorSettings,actorVoiceStyle,PROMPT_CATEGORIES,PROMPT_SPEC,createBuilderState,mergeBuilderPrompts,applyBuilderDraft}=(()=>{\nconst PROMPT_SPEC='+JSON.stringify(spec)+';\n'+runtime+'\nreturn {initPromptBuilder,buildPromptDraft,recoverBuilderSettings,actorSettings,actorVoiceStyle,PROMPT_CATEGORIES,PROMPT_SPEC,createBuilderState,mergeBuilderPrompts,applyBuilderDraft};\n})();\n// END PROMPT BUILDER';
const appUrl=url('public/app.js'),app=readFileSync(appUrl,'utf8');
if(!app.includes('// BEGIN PROMPT BUILDER')||!app.includes('// END PROMPT BUILDER'))throw Error('Builder markers missing');
const next=app.replace(/\/\/ BEGIN PROMPT BUILDER[\s\S]*?\/\/ END PROMPT BUILDER/,()=>bundle);
if(process.argv.includes('--check')){if(app!==next)throw Error('Run node build-prompt-builder.mjs to refresh the inline bundle');}else writeFileSync(appUrl,next);
