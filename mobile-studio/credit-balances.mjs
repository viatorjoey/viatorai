export const CREDIT_INTERVAL_MS=12*60*60*1000;
export const CREDIT_PROVIDERS=Object.freeze([
 {id:'openai',label:'OpenAI',billingUrl:'https://platform.openai.com/settings/organization/billing/overview'},
 {id:'gemini',label:'Gemini',account:'Default Gemini Project',billingUrl:'https://aistudio.google.com/billing'},
 {id:'xai',label:'Grok',billingUrl:'https://console.x.ai/'},
 {id:'anthropic',label:'Claude',billingUrl:'https://platform.claude.com/settings/billing'},
]);
const statuses=new Set(['verified','postpaid','needs_login','account_mismatch','unavailable']);
export function createCreditBalances(db,{now=Date.now}={}){
 db.exec('CREATE TABLE IF NOT EXISTS api_credit_balances(provider TEXT PRIMARY KEY,body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS api_credit_monitor(id INTEGER PRIMARY KEY CHECK(id=1),body TEXT NOT NULL)');
 const read=id=>{const r=db.prepare('SELECT body FROM api_credit_balances WHERE provider=?').get(id);return r?JSON.parse(r.body):null;};
 function update(items){
  if(!Array.isArray(items)||!items.length||items.length>4)throw Error('1~4개 서비스의 확인 결과가 필요합니다.');
  const stamp=now(),seen=new Set();
  const rows=items.map(item=>{
   const provider=CREDIT_PROVIDERS.find(p=>p.id===item.provider);
   if(!provider||seen.has(provider.id)||!statuses.has(item.status))throw Error('서비스 또는 확인 상태를 확인하세요.');
   seen.add(provider.id);
   let url;try{url=new URL(item.sourceUrl);}catch{throw Error('공식 결제 페이지 주소가 필요합니다.');}
   if(url.protocol!=='https:'||url.hostname!==new URL(provider.billingUrl).hostname||url.username||url.password||url.hash)throw Error('해당 서비스의 공식 결제 페이지를 사용하세요.');
   const previous=read(provider.id)||{};
   const row={...previous,provider:provider.id,status:item.status,checkedAt:stamp};
   if(['verified','postpaid'].includes(item.status)){
    if(typeof item.account!=='string'||!item.account.trim()||item.account.length>100||/[\r\n<>]/.test(item.account))throw Error('확인한 프로젝트 또는 조직 이름이 필요합니다.');
    if(provider.account&&item.account!==provider.account)throw Error('Gemini는 Default Gemini Project의 잔액만 저장할 수 있습니다.');
    if(previous.account&&previous.account!==item.account)throw Error('이전에 확인한 조직 또는 프로젝트와 다릅니다. 연결 계정을 확인하세요.');
    if(item.status==='verified'&&(typeof item.amount!=='number'||!Number.isFinite(item.amount)||item.amount<0||item.amount>1e9||!/^[A-Z]{3}$/.test(item.currency||'')))throw Error('실제 잔액과 통화를 확인하세요.');
    row.amount=item.status==='verified'?item.amount:null;
    row.currency=item.status==='verified'?item.currency:null;
    row.balanceType=item.status==='verified'?'prepaid':'postpaid';
    row.observedAt=stamp;row.account=item.account;row.sourceUrl=url.origin+url.pathname;
   }
   return row;
  });
  db.exec('BEGIN IMMEDIATE');try{for(const row of rows)db.prepare('INSERT INTO api_credit_balances VALUES(?,?) ON CONFLICT(provider) DO UPDATE SET body=excluded.body').run(row.provider,JSON.stringify(row));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  return snapshot();
 }
 function setMonitor({automationId,startedAt=now()}){
  if(typeof automationId!=='string'||!automationId.trim()||automationId.length>200||!Number.isSafeInteger(startedAt)||startedAt>now()+60000)throw Error('자동 확인 일정을 확인하세요.');
  db.prepare('INSERT INTO api_credit_monitor VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(JSON.stringify({automationId,startedAt,intervalMs:CREDIT_INTERVAL_MS}));
 }
 function snapshot(){
  const at=now(),r=db.prepare('SELECT body FROM api_credit_monitor WHERE id=1').get(),monitor=r?JSON.parse(r.body):null;
  return {intervalMs:CREDIT_INTERVAL_MS,scheduled:!!monitor,nextCheckAt:monitor?monitor.startedAt+(Math.floor(Math.max(0,at-monitor.startedAt)/CREDIT_INTERVAL_MS)+1)*CREDIT_INTERVAL_MS:null,providers:CREDIT_PROVIDERS.map(p=>{
   const v=read(p.id)||{};
   return {...p,...v,status:v.status||'pending',amount:v.amount??null,currency:v.currency??null,observedAt:v.observedAt??null,checkedAt:v.checkedAt??null,stale:!!v.observedAt&&(v.status!=='verified'&&v.status!=='postpaid'||at-v.observedAt>CREDIT_INTERVAL_MS)};
  })};
 }
 return {snapshot,update,setMonitor};
}
