import {readFileSync} from 'node:fs';
const videoTemplate=JSON.parse(readFileSync(new URL('./templates/ltx25.json',import.meta.url),'utf8'));
export const MODES=['text-image','image-image','image-text','text-video','image-video'];
export const MODEL_CONFIG={
 'z_image_turbo_bf16.safetensors':{label:'Z-Image Turbo',kind:'image',family:'zimage',modes:['text-image'],clip:'qwen_3_4b.safetensors',vae:'ae.safetensors',steps:8},
 'flux-2-klein-4b.safetensors':{label:'FLUX.2 Klein 4B · 빠르게',kind:'image',clip:'qwen_3_4b.safetensors',steps:4},
 'flux-2-klein-4b-fp8.safetensors':{label:'FLUX.2 Klein 4B FP8 · 메모리 절약',kind:'image',clip:'qwen_3_4b.safetensors',steps:4},
 'flux-2-klein-base-4b.safetensors':{label:'FLUX.2 Klein Base 4B · 세밀하게',kind:'image',clip:'qwen_3_4b.safetensors',steps:20},
 'flux-2-klein-base-9b-fp8.safetensors':{label:'FLUX.2 Klein Base 9B FP8 · 오래 걸려요',kind:'image',clip:'qwen_3_8b_fp8mixed.safetensors',steps:20},
 'ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors':{label:'LTX 2.5 · 이미지·텍스트 영상',kind:'video'}
};
export function selectedModel(j){const model=j.model||(j.mode.endsWith('video')?'ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors':'flux-2-klein-4b.safetensors'),config=MODEL_CONFIG[model];if(!config||config.kind!==(j.mode.endsWith('video')?'video':'image')||(config.modes&&!config.modes.includes(j.mode)))throw Error('이 생성 방식에 맞는 모델을 선택해 주세요.');return {model,...config};}
export const RESOLUTIONS=['512x288','768x432','1024x576','1280x720','1536x864','2048x1152','2560x1440'];
export function validateInput(x){
 if(!x||!MODES.includes(x.mode))throw Error('만들기 종류를 선택해 주세요.');
 const v={mode:x.mode,prompt:String(x.prompt||'').trim(),negative:String(x.negative||'').trim(),aspect:x.aspect||'9:16',quality:x.quality||'high',resolution:x.resolution||null,enhance:x.enhance===true,duration:Number(x.duration??10),seed:Number(x.seed??42),guidance:Number(x.guidance??1),uploadId:x.uploadId||null,model:x.model||null};
 if(v.mode==='text-image'&&!v.model)v.model='z_image_turbo_bf16.safetensors';
 if(v.mode!=='image-text')v.model=selectedModel(v).model;
 if(!v.prompt&&v.mode!=='image-text')throw Error('만들고 싶은 장면을 적어 주세요.');
 if(v.prompt.length>3000||v.negative.length>1000)throw Error('설명이 너무 깁니다.');
 if(!(v.aspect==='original'&&v.mode==='image-image')&&!['9:16','16:9','1:1','4:3','3:4'].includes(v.aspect)||!['draft','standard','high'].includes(v.quality))throw Error('지원하지 않는 화면 또는 화질입니다.');
 if(v.resolution&&!RESOLUTIONS.includes(v.resolution))throw Error('지원하지 않는 해상도입니다.');
 if(![2,4,6,10,15,20].includes(v.duration)||!Number.isSafeInteger(v.seed)||v.seed<0||v.seed>2147483647||!Number.isFinite(v.guidance)||v.guidance<1||v.guidance>3)throw Error('설정값을 확인해 주세요.');
 if(v.mode.startsWith('image-')&&!/^[a-f0-9-]{36}$/.test(v.uploadId||''))throw Error('사진을 먼저 선택해 주세요.');
 return v;
}
export function dimensions(j,video=false){if(j.resolution&&!RESOLUTIONS.includes(j.resolution))throw Error('지원하지 않는 해상도입니다.');const edge=video?({draft:512,standard:768,high:1280}[j.quality]):({draft:512,standard:768,high:1024}[j.quality]);const [w,h]=j.resolution?j.resolution.split('x').map(Number):[edge,edge*9/16];return j.aspect==='9:16'?[h,w]:j.aspect==='1:1'?(j.resolution?[h,h]:[w,w]):j.aspect==='4:3'?[w,w*3/4]:j.aspect==='3:4'?[w*3/4,w]:[w,h];}
export function imageGraph(j,id,imageName){
 if(selectedModel(j).family==='zimage')return zImageGraph(j,id);
 const [w,h]=dimensions(j),m=selectedModel(j),g={
 unet:{class_type:'UNETLoader',inputs:{unet_name:m.model,weight_dtype:'default'}},
 clip:{class_type:'CLIPLoader',inputs:{clip_name:m.clip,type:'flux2',device:'cpu'}},
 vae:{class_type:'VAELoader',inputs:{vae_name:'flux2-vae.safetensors'}},
 text:{class_type:'CLIPTextEncode',inputs:{clip:['clip',0],text:j.prompt}},
 neg:{class_type:j.negative?'CLIPTextEncode':'ConditioningZeroOut',inputs:j.negative?{clip:['clip',0],text:j.negative}:{conditioning:['text',0]}},
 guide:{class_type:'CFGGuider',inputs:{model:['unet',0],positive:['text',0],negative:['neg',0],cfg:j.guidance}},
 noise:{class_type:'RandomNoise',inputs:{noise_seed:j.seed}},sampler:{class_type:'KSamplerSelect',inputs:{sampler_name:'euler'}},
 sigmas:{class_type:'Flux2Scheduler',inputs:{steps:m.steps,width:w,height:h}},empty:{class_type:'EmptyFlux2LatentImage',inputs:{width:w,height:h,batch_size:1}},
 sample:{class_type:'SamplerCustomAdvanced',inputs:{noise:['noise',0],guider:['guide',0],sampler:['sampler',0],sigmas:['sigmas',0],latent_image:['empty',0]}},
 decode:{class_type:'VAEDecode',inputs:{samples:['sample',0],vae:['vae',0]}},save:{class_type:'SaveImage',inputs:{images:['decode',0],filename_prefix:'mobile/'+id}}
 };if(j.mode==='image-image'){
  if(!imageName)throw Error('참고 사진이 필요합니다.');
  g.source={class_type:'LoadImage',inputs:{image:imageName}};
  g.referenceScale={class_type:'ImageScaleToTotalPixels',inputs:{image:['source',0],upscale_method:'lanczos',megapixels:Math.min(1,w*h/1000000),resolution_steps:16}};
  if(j.aspect==='original'){g.referenceSize={class_type:'GetImageSize',inputs:{image:['referenceScale',0]}};for(const n of ['sigmas','empty']){g[n].inputs.width=['referenceSize',0];g[n].inputs.height=['referenceSize',1];}}
  g.reference={class_type:'VAEEncode',inputs:{pixels:['referenceScale',0],vae:['vae',0]}};
  g.refPositive={class_type:'ReferenceLatent',inputs:{conditioning:['text',0],latent:['reference',0]}};
  g.refNegative={class_type:'ReferenceLatent',inputs:{conditioning:['neg',0],latent:['reference',0]}};
  g.guide.inputs.positive=['refPositive',0];g.guide.inputs.negative=['refNegative',0];
 }return g;
}
export function zImageGraph(j,id){const [width,height]=dimensions(j);return {
 unet:{class_type:'UNETLoader',inputs:{unet_name:'z_image_turbo_bf16.safetensors',weight_dtype:'default'}},
 clip:{class_type:'CLIPLoader',inputs:{clip_name:'qwen_3_4b.safetensors',type:'lumina2',device:'cpu'}},
 vae:{class_type:'VAELoader',inputs:{vae_name:'ae.safetensors'}},
 positive:{class_type:'CLIPTextEncode',inputs:{clip:['clip',0],text:j.prompt}},
 negative:Number(j.guidance??1)>1?{class_type:'CLIPTextEncode',inputs:{clip:['clip',0],text:j.negative||''}}:{class_type:'ConditioningZeroOut',inputs:{conditioning:['positive',0]}},
 shifted:{class_type:'ModelSamplingAuraFlow',inputs:{model:['unet',0],shift:3}},
 empty:{class_type:'EmptySD3LatentImage',inputs:{width,height,batch_size:1}},
 sample:{class_type:'KSampler',inputs:{model:['shifted',0],positive:['positive',0],negative:['negative',0],latent_image:['empty',0],seed:j.seed,steps:8,cfg:Number(j.guidance??1),sampler_name:'res_multistep',scheduler:'simple',denoise:1}},
 decode:{class_type:'VAEDecode',inputs:{samples:['sample',0],vae:['vae',0]}},
 save:{class_type:'SaveImage',inputs:{images:['decode',0],filename_prefix:'mobile/'+id}}
 };}
export function videoGraph(j,id,imageName){
 const g=structuredClone(videoTemplate),[w,h]=dimensions(j,true);
 g['398:384'].inputs.unet_name=selectedModel(j).model;
 g['398:372'].inputs.value=Math.ceil(w/64)*64;g['398:360'].inputs.value=Math.ceil(h/64)*64;
 g['398:362'].inputs.value=j.duration;g['398:363'].inputs.value=j.mode==='text-video';
 // Disable the optional prompt enhancer: the user's scene is the sole positive prompt.
 g['398:364'].inputs.text=j.prompt;g['398:373'].inputs.text=j.negative||'distortion, flicker, watermark, text';
 g['398:388'].inputs.video_cfg=j.guidance;g['398:391'].inputs.video_cfg=j.guidance;
 g['398:339'].inputs.noise_seed=j.seed;g['398:338'].inputs.noise_seed=j.seed+1;
 g['395'].inputs.image=imageName||'';
 g['mobile_scale']={class_type:'ImageScale',inputs:{image:['398:374',0],upscale_method:'lanczos',width:w,height:h,crop:'center'}};
 g['398:370'].inputs.images=['mobile_scale',0];g['398:370'].inputs.codec='h264';
 g['mobile_slice']={class_type:'Video Slice',inputs:{video:['398:370',0],start_time:0,duration:j.duration,strict_duration:true}};
 g['75'].inputs.format='mp4';g['75'].inputs['format.codec']='h264';g['75'].inputs['format.codec.encoding']='re-encode';g['75'].inputs['format.codec.encoding.crf']={draft:24,standard:18,high:12}[j.quality]??18;
 g['75'].inputs.video=['mobile_slice',0];g['75'].inputs.filename_prefix='mobile/'+id;
 // Text-to-video doesn't need a placeholder photo. Remove image branches and their dependencies.
 if(j.mode==='text-video'){
  g['398:377'].inputs.video_latent=['398:356',0];g['398:340'].inputs.video_latent=['398:348',0];
 }
 const active=prune(g,['75']);
 // Keep the large text encoder off the 16GB GPU; ComfyUI offloads diffusion/VAE as needed.
 for(const node of Object.values(active))if(node.class_type==='CLIPLoader')node.inputs.device='cpu';
 return active;
}
export function prune(g,roots){const keep=new Set();function visit(id){if(keep.has(id))return;if(!g[id])throw Error('Missing graph node '+id);keep.add(id);for(const v of Object.values(g[id].inputs))if(Array.isArray(v)&&typeof v[0]==='string'&&Number.isInteger(v[1]))visit(v[0]);}roots.forEach(visit);return Object.fromEntries([...keep].map(id=>[id,g[id]]));}
export function isIdle(q){return Array.isArray(q?.queue_running)&&Array.isArray(q?.queue_pending)&&!q.queue_running.length&&!q.queue_pending.length;}
export function memoryReleased(s){const ds=s?.devices?.filter(d=>d.type==='cuda');return !!ds?.length&&ds.every(d=>Number.isFinite(d.torch_vram_total)&&Number.isFinite(d.torch_vram_free)&&d.torch_vram_free>=0&&d.torch_vram_free<=d.torch_vram_total&&d.torch_vram_total<=134217728&&d.torch_vram_total-d.torch_vram_free<=16777216);}
export function ownOutputs(history,id,prefix){const h=history?.[id];if(!h)return null;if(h.status?.status_str==='error')throw Error('생성 엔진에서 오류가 발생했습니다. 잠금을 보존했습니다.');if(h.status?.completed!==true)return null;if(h.status.status_str!=='success')throw Error('완료 성공을 확인하지 못했습니다.');const a=[];for(const v of Object.values(h.outputs||{}))for(const key of ['images','gifs','videos'])for(const x of v[key]||[])if(x.type==='output'&&x.filename.startsWith(prefix+'_')&&/\.(png|jpg|jpeg|webp|mp4|webm)$/i.test(x.filename))a.push(x);if(!a.length)throw Error('저장된 결과 파일을 확인하지 못했습니다.');return a;}
