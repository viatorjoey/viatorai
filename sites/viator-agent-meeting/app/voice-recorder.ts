// Kept outside React so microphone lifetime and late permission grants are testable.
export function createVoiceRecorder(deps:{media:Pick<MediaDevices,'getUserMedia'>;Recorder:typeof MediaRecorder}){
 let cancelled=false,stream:MediaStream|undefined,recorder:MediaRecorder|undefined,chunks:Blob[]=[],size=0;
 let resolve:(blob:Blob)=>void=()=>{},reject:(error:Error)=>void=()=>{};
 const release=()=>stream?.getTracks().forEach(track=>track.stop());
 const stopped=new Promise<Blob>((ok,fail)=>{resolve=ok;reject=fail;});
 // Cancel can precede stop(), so keep an early rejection handled.
 void stopped.catch(()=>{});
 return {
  async start(){
   stream=await deps.media.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
   if(cancelled){release();throw new Error('녹음을 취소했습니다.');}
   try{
    const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus'].find(type=>deps.Recorder.isTypeSupported(type));
    recorder=mime?new deps.Recorder(stream,{mimeType:mime,audioBitsPerSecond:64000}):new deps.Recorder(stream);
    recorder.ondataavailable=e=>{if(!cancelled&&e.data.size){size+=e.data.size;chunks.push(e.data);if(size>12*1024*1024){cancelled=true;recorder?.stop();release();reject(new Error('녹음이 너무 깁니다. 짧게 다시 녹음해주세요.'));}}};
    recorder.onerror=()=>{cancelled=true;release();reject(new Error('녹음 중 오류가 생겼습니다. 다시 시도해주세요.'));};
    recorder.onstop=()=>{release();if(cancelled){chunks=[];return;}const blob=new Blob(chunks,{type:recorder?.mimeType||mime||'audio/mp4'});chunks=[];if(blob.size)resolve(blob);else reject(new Error('녹음된 음성이 없습니다. 다시 녹음해주세요.'));};
    recorder.start(500);
   }catch(error){release();throw error;}
  },
  stop(){if(recorder?.state==='recording')recorder.stop();else if(!recorder)reject(new Error('녹음이 시작되지 않았습니다.'));return stopped;},
  cancel(){cancelled=true;if(recorder?.state==='recording')recorder.stop();release();chunks=[];reject(new Error('녹음을 취소했습니다.'));}
 };
}
