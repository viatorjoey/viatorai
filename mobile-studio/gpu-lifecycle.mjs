export const CHAT_MODELS=['qwen3.5:9b','gpt-oss:20b'];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export async function unloadModels(request,names){
 for(const model of [...new Set(names)])await request('/api/generate',{model,keep_alive:0},90000);
 for(let i=0;i<30;i++){const ps=await request('/api/ps');if(!ps.models?.some(m=>names.includes(m.name||m.model)))return;await pause(1000);}
 throw Error('LLM 언로드를 확인하지 못했습니다. 다음 모델을 시작하지 않습니다.');
}
export async function managedChat(request,value,onIntent=()=>{}){
 onIntent(true);
 try{return await request('/api/chat',{...value,stream:false,keep_alive:0,options:{num_ctx:4096,num_predict:1200,...value.options}},300000);}
 finally{await unloadModels(request,[value.model]);onIntent(false);}
}
