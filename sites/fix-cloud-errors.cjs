const fs=require('fs'),path=require('path'),p=path.join(__dirname,'viator-agent-meeting/app/studio-gateway.ts');let s=fs.readFileSync(p,'utf8');
const start=s.indexOf('async function api('),end=s.indexOf('\nfunction image(',start);
s=s.slice(0,start)+`export function providerFailure(status:number,data:any,retryAfter:string|null=null,secrets:string[]=[]){
 const e=data?.error||{},details=Array.isArray(e.details)?e.details:[];
 let original=String(e.message||'').replace(/AIza[\\w-]{20,}|sk-[\\w-]{10,}|Bearer\\s+[^\\s]+/gi,'[비공개]');
 for(const secret of secrets)if(secret)original=original.split(secret).join('[비공개]');
 original=original.slice(0,700);
 const quotas=details.flatMap((d:any)=>Array.isArray(d.violations)?d.violations:[]).slice(0,8).map((v:any)=>({metric:String(v.quotaMetric||'').slice(0,160),id:String(v.quotaId||'').slice(0,160),limit:String(v.quotaValue??'').slice(0,40)}));
 const delay=details.find((d:any)=>d.retryDelay)?.retryDelay;
 const seconds=/^\\d+(\\.\\d+)?s$/.test(String(delay))?Math.ceil(parseFloat(delay)):/^\\d+$/.test(retryAfter||'')?Number(retryAfter):null;
 const code=String(e.status||e.code||status).slice(0,80),q=quotas.map((v:any)=>v.id+' '+v.metric).join(' '),hint=original+' '+q;
 const reason=status===429?(/prepay|credit.*deplet|billing|payment|balance/i.test(original)?'billing':/perday|daily|daylimit/i.test(hint)?'daily_quota':quotas.length?'quota':seconds?'rate_limit':'resource_exhausted'):status===401||status===403?'permission':status>=500?'unavailable':'request';
 const advice:any={billing:'API 프로젝트의 결제 연결·선불 잔액을 확인해주세요.',daily_quota:'일일 생성 한도에 도달했습니다. Google AI Studio에서 해당 프로젝트의 한도를 확인해주세요.',quota:'해당 모델의 API 할당량 제한입니다. Google AI Studio에서 한도와 사용량을 확인해주세요.',rate_limit:'요청 속도 제한입니다.',resource_exhausted:'Google이 요청을 제한했습니다. 할당량 또는 일시적 처리 용량을 확인해야 합니다.',permission:'API 키 또는 모델 접근 권한을 확인해주세요.',unavailable:'제공 서비스가 일시적으로 요청을 처리하지 못했습니다.',request:'요청 설정을 확인해주세요.'};
 return {message:'클라우드 API '+status+' · '+advice[reason]+(seconds?' '+seconds+'초 후 다시 시도할 수 있습니다.':'')+(original?'\\n제공사 사유: '+original:''),diagnostics:{httpStatus:status,code,reason,retryAfterSeconds:seconds,quotas}};
}
async function api(url:string,headers:any,value?:any){const r=await fetch(url,{method:value===undefined?'GET':'POST',headers:{...headers,...(value instanceof FormData?{}:{'Content-Type':'application/json'})},body:value===undefined?undefined:value instanceof FormData?value:JSON.stringify(value),signal:AbortSignal.timeout(120000)});let d:any;try{d=await r.json();}catch{d={};}if(!r.ok){const failure=providerFailure(r.status,d,r.headers.get('retry-after'),Object.values(headers).map(v=>String(v).replace(/^Bearer /,'')));const error=new HubError(r.status===429?429:502,failure.message);(error as any).diagnostics=failure.diagnostics;throw error;}return d;}
`+s.slice(end);
s=s.replace("return update(pid,id,'blocked',{error});}","return update(pid,id,'blocked',{error,...((e as any)?.diagnostics?{diagnostics:(e as any).diagnostics}:{})});}");fs.writeFileSync(p,s);
