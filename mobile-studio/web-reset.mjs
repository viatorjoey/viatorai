export function verifyWebReset({apiOnly,pid,supervisor,jobs,maintenanceActive,cpuBusy=false}){
 if(!apiOnly)throw Error('웹앱 서버에서만 사용할 수 있습니다.');
 if(cpuBusy||maintenanceActive||jobs.some(j=>j.mode==='llm-chat'&&!['queued','complete','cancelled','blocked'].includes(j.state)))throw Error('서버 작업이 끝난 뒤 다시 시도하세요.');
 const web=supervisor?.services?.find(s=>s.name==='web');
 if(web?.pid!==pid||!web.ready||!Number.isFinite(Date.parse(supervisor.checkedAt))||Date.now()-Date.parse(supervisor.checkedAt)>20000||Date.parse(supervisor.checkedAt)>Date.now()+1000)throw Error('웹앱 자동 복구 연결을 확인할 수 없습니다.');
 return {pid};
}
