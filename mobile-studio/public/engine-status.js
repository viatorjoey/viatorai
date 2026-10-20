export function engineView(status={}){
 const state=status.engineState||(status.online?'ready':'unknown');
 const views={ready:['비아토르 AI 연결됨','작업이 없을 때 생성 엔진을 다시 시작할 수 있어요.'],busy:['생성 엔진 작업 중','작업을 보호하기 위해 엔진 재시작을 잠시 막았어요.'],starting:['생성 엔진 시작 중','시작이 끝날 때까지 기다려 주세요.'],stopped:['생성 엔진 꺼짐','Windows의 Comfy Desktop에서 인스턴스를 실행해 주세요.'],unresponsive:['생성 엔진 응답 대기','Comfy Desktop에서 상태를 확인해 주세요. 작업은 유지됩니다.'],foreign:['엔진 연결 확인 필요','8188 포트의 프로그램을 Comfy Desktop에서 확인해 주세요.'],unknown:['생성 엔진 확인 중','연결을 다시 확인하고 있어요.']};
 const [label,note]=views[state]||views.unknown;
 return {label,note,canRestart:!status.maintenanceActive&&!['starting','foreign'].includes(state)};
}
