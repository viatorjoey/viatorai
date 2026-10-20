// Interpret terminal provider responses without creating another generation request.
export function videoResponse(provider,data){
 const response=data?.response?.generateVideoResponse||data?.response||{};
 if(provider==='gemini'&&!data.done&&!data.error)return {state:'pending'};
 if(provider==='xai'&&['pending','queued','processing','running'].includes(data.status))return {state:'pending'};
 const reasons=response.raiMediaFilteredReasons||response.rai_media_filtered_reasons||[];
 const count=Number(response.raiMediaFilteredCount||response.rai_media_filtered_count||0);
 if(count>0||(Array.isArray(reasons)&&reasons.length)||data.video?.respect_moderation===false){
  return {state:'blocked',reason:'content_filtered',code:'CONTENT_FILTERED',message:'제공사의 콘텐츠 검토에서 생성이 제한됐습니다.',detail:Array.isArray(reasons)?reasons.filter(x=>typeof x==='string').join(' · '):''};
 }
 if(data.error){const error=data.error;return {state:'blocked',reason:'generation_failed',code:String(error.code||data.code||'GENERATION_FAILED'),message:'제공사가 영상 생성을 완료하지 못했습니다.',detail:typeof error==='string'?error:error.message||data.message||''};}
 const url=provider==='gemini'?response.generatedSamples?.[0]?.video?.uri||response.generatedVideos?.[0]?.video?.uri:data.video?.url;
 if(url&&(provider==='gemini'||data.status==='done'))return {state:'complete',url};
 if(provider==='xai'&&data.status==='expired')return {state:'blocked',reason:'expired',code:'EXPIRED',message:'제공사의 작업 조회 기간이 만료됐습니다.'};
 return {state:'blocked',reason:'empty_result',code:'EMPTY_VIDEO_RESULT',message:'제공사 응답에 영상 파일이 없습니다. 응답에 구체적인 실패 사유가 없어 원인을 확정할 수 없습니다.'};
}
