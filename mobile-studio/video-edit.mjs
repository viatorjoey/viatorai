export function videoEditSettings(x){
 const number=(value,min,max,label)=>{const n=Number(value);if(!Number.isFinite(n)||n<min||n>max)throw Error(label+' 값을 확인하세요.');return n;};
 if(!Array.isArray(x.scenes)||!x.scenes.length||x.scenes.length>30)throw Error('편집할 클립을 1~30개 넣어주세요.');
 const scenes=x.scenes.map(s=>({title:String(s.title||'클립').slice(0,120),text:String(s.text||'').trim().slice(0,500),media:s.media,sourceDuration:Number.isFinite(Number(s.sourceDuration))?Math.max(0,Math.min(1800,Number(s.sourceDuration))):0,mediaType:s.mediaType==='image'?'image':'video',start:number(s.start??0,0,1800,'시작 시간'),duration:number(s.duration,.1,1800,'클립 길이'),speed:number(s.speed??1,.25,4,'재생 속도'),volume:number(s.volume??1,0,2,'볼륨')}));
 if(scenes.reduce((n,s)=>n+s.duration,0)>1800)throw Error('전체 영상은 30분 이내로 구성하세요.');
 if(scenes.some(s=>!s.media||!((s.media.kind==='upload'&&/^[a-f0-9-]{36}$/.test(s.media.id||''))||(s.media.kind==='result'&&/^[a-f0-9-]{36}$/.test(s.media.jobId||'')&&/^[a-f0-9-]{36}-\d+\.(png|jpg|jpeg|webp|mp4|webm)$/.test(s.media.filename||'')))))throw Error('클립의 에셋을 다시 선택하세요.');
 return {scenes,aspect:['9:16','16:9','1:1','4:3','3:4'].includes(x.aspect)?x.aspect:'9:16',fit:x.fit==='cover'?'cover':'contain',keepAudio:true};
}
