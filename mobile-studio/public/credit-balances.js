const statusLabels={pending:'첫 확인 대기',needs_login:'결제 페이지 로그인 필요',account_mismatch:'연결된 프로젝트 확인 필요',unavailable:'이번 확인 실패 · 다시 확인 예정'};
const date=value=>value?new Date(value).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'아직 확인 전';
export function renderCreditBalances(target,data){
 target.replaceChildren();
 const element=(tag,className,text)=>{const n=document.createElement(tag);n.className=className;n.textContent=text;return n;};
 for(const p of data.providers){
  const row=element('div','credit-balance-row',''),heading=element('div','credit-balance-heading','');
  heading.append(element('strong','',p.label));
  const value=p.balanceType==='postpaid'?'후불 결제':typeof p.amount==='number'?new Intl.NumberFormat('ko-KR',{style:'currency',currency:p.currency,minimumFractionDigits:2,maximumFractionDigits:4}).format(p.amount):'—';
  heading.append(element('span','credit-balance-value',value));row.append(heading);
  if(p.account)row.append(element('div','credit-account',p.account));
  if(p.stale)row.append(element('div','credit-check-status','마지막 확인 잔액 · '+(statusLabels[p.status]||'갱신 대기')));
  else if(statusLabels[p.status])row.append(element('div','credit-check-status',statusLabels[p.status]));
  const foot=element('div','credit-balance-footer','');foot.append(element('span','',p.observedAt?'잔액 확인 '+date(p.observedAt):'확인 시도 '+date(p.checkedAt)));
  const link=element('a','','결제 확인 ↗');link.href=p.billingUrl;link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label',p.label+' 공식 결제 페이지');foot.append(link);row.append(foot);target.append(row);
 }
 const note=document.querySelector('#credit-balance-schedule');
 if(note)note.textContent=data.scheduled?Math.round(data.intervalMs/3600000)+'시간마다 확인 · 다음 '+date(data.nextCheckAt)+' · PC와 Codex 실행 중':'자동 확인 일정 준비 중';
}
export function initCreditBalances(){
 const target=document.querySelector('#credit-balance-list');if(!target)return {refresh:async()=>{}};
 const toggle=document.querySelector('#toggle-credit-balances'),details=document.querySelector('#credit-balance-details');
 if(toggle&&details)toggle.onclick=()=>{const expanded=details.hidden;details.hidden=!expanded;toggle.setAttribute('aria-expanded',String(expanded));const label='API 크레딧 잔액 '+(expanded?'접기':'펼치기');toggle.setAttribute('aria-label',label);toggle.title=label;};
 let pending=null;
 const refresh=()=>pending|| (pending=(async()=>{try{const r=await fetch('/api/cloud/credits',{cache:'no-store'});if(!r.ok)throw Error();renderCreditBalances(target,await r.json());}catch{if(!target.children.length)target.textContent='잔액 정보를 불러오지 못했습니다. 잠시 후 다시 확인합니다.';}finally{pending=null;}})());
 const timer=setInterval(()=>{if(!document.hidden&&!document.querySelector('#connect')?.hidden)void refresh();},60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
 return {refresh,stop:()=>clearInterval(timer)};
}
