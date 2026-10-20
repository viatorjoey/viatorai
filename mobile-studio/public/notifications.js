let api,toast,endpoint=null,systemUnread=0;
export const getSystemUnread=()=>systemUnread;
const $=s=>document.querySelector(s);
export function initNotifications(deps){
 ({api,toast}=deps);
 $('#enable-push').onclick=async()=>{const button=$('#enable-push');button.disabled=true;try{
  if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))throw Error('iPhone에서는 Safari에서 홈 화면에 추가한 앱으로 열어 주세요.');
  const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('알림을 허용해야 홈 화면에 빨간 배지를 표시할 수 있어요.');
  const registration=await navigator.serviceWorker.ready,{publicKey}=await api('/api/push/key');let sub=await registration.pushManager.getSubscription();if(!sub){const key=Uint8Array.from(atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});}await api('/api/push/subscribe',{method:'POST',body:JSON.stringify(sub.toJSON())});endpoint=sub.endpoint;$('#push-status').textContent='완료·오류 알림과 홈 화면 배지를 켰어요.';toast('알림을 켰어요.');
 }catch(e){$('#push-status').textContent=e.message;toast(e.message);}finally{button.disabled=false;}};
 if('serviceWorker'in navigator)navigator.serviceWorker.ready.then(r=>r.pushManager?.getSubscription()).then(s=>{endpoint=s?.endpoint||null;if(endpoint)$('#push-status').textContent='이 기기의 알림이 켜져 있어요.';}).catch(()=>{});
 $('#notifications').addEventListener('click',async()=>{try{const since=Number(localStorage.getItem('studio-system-read')||0),events=(await api('/api/notifications')).filter(e=>e.title==='ComfyUI 재시작'&&e.created>since);if(events.length){const list=$('#notification-list');list.querySelector('p.muted')?.remove();for(const e of events){const item=document.createElement('p');item.className='notification-item system-notification';item.textContent=e.body;list.prepend(item);}}}catch{}});
 $('#read-notifications').addEventListener('click',()=>{localStorage.setItem('studio-system-read',String(Date.now()));document.querySelectorAll('.system-notification').forEach(n=>n.remove());});
 let initialized=false;const seen=new Set();let freeing=null;
 setInterval(async()=>{try{
  const [events,jobs,maintenance]=await Promise.all([api('/api/notifications'),api('/api/jobs'),api('/api/maintenance')]);
  systemUnread=events.filter(e=>e.title==='ComfyUI 재시작'&&e.created>Number(localStorage.getItem('studio-system-read')||0)).length;
  const clean=jobs.find(j=>j.mode==='memory-clean');if(clean&&freeing!==clean.id+':'+clean.state){freeing=clean.id+':'+clean.state;$('#memory-note').textContent=['complete','blocked'].includes(clean.state)?clean.message:clean.state==='queued'?'VRAM 비우기 대기 중 · 실행 중인 작업이 끝나면 처리합니다. 응답이 없으면 Comfy Desktop에서 상태를 확인하세요.':clean.message;}
  for(const m of maintenance){const key=m.id+':'+m.state;if(initialized&&!seen.has(key)&&['complete','failed'].includes(m.state))toast(m.message);seen.add(key);}
  for(const e of events){if(initialized&&!seen.has(e.id))toast(e.title+' · '+e.body);seen.add(e.id);}initialized=true;
 }catch{}},5000);
}
export async function readPush(kind){if(!kind){systemUnread=0;localStorage.setItem('studio-system-read',String(Date.now()));}if(!api||!endpoint)return;try{await api('/api/push/read',{method:'POST',body:JSON.stringify({endpoint,kind})});}catch{}}
