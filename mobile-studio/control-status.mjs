export function controlStatus({jobs=[],cancellations=[],maintenance=[],webReset,online,running,pending,usedGB,totalGB}){
 const memory=jobs.filter(j=>j.mode==='memory-clean').sort((a,b)=>b.created-a.created)[0];
 const restart=maintenance[0];
 const stopping=cancellations.filter(c=>!c.confirmed).length;
 const latest=[...cancellations].sort((a,b)=>b.requested-a.requested)[0];
 const labels={queued:'대기 중',running:'처리 중',cleaning:'메모리 정리 중',releasing:'반환 확인 중',complete:'완료',blocked:'실패',cancelled:'취소됨'};
 return {
  memory:{state:memory?.state||'idle',text:`${memory?'최근 실행 · '+(labels[memory.state]||memory.state):'요청 없음'} · VRAM ${usedGB??'?'} / ${totalGB??'?'}GB`,detail:memory?.message||'',at:memory?.completedAt||memory?.created},
  stop:{state:stopping?'running':latest?'complete':'idle',text:stopping?`중단 확인 중 ${stopping}건`:latest?'중단 확인 완료':'중단 요청 없음',detail:online?`엔진 실행 ${running??'?'}건 · 대기 ${pending??'?'}건`:'엔진 오프라인 · 작업 목록 확인 불가',at:latest?.confirmed||latest?.requested},
  restart:{state:restart?.state||'idle',text:restart?({running:'재시작 진행 중',complete:'재시작 완료',failed:'재시작 실패'}[restart.state]||restart.state):'재시작 요청 없음',detail:restart?.message?.includes('Command failed:')?'이전 엔진 실행 요청 실패':restart?.message||'',at:restart?.completed||restart?.created},
  web:{state:webReset?.state||'idle',text:webReset?webReset.state==='complete'?'화면 서버 재시작 완료':'화면 서버 재시작 중':'재시작 요청 없음',at:webReset?.completed||webReset?.created}
 };
}
