import readline from 'node:readline';
process.stdin.setRawMode?.(true);
const line=await new Promise(resolve=>{const r=readline.createInterface({input:process.stdin,output:process.stdout,terminal:false});r.once('line',x=>{r.close();resolve(x);});});
const x=JSON.parse(line);
for(const id of x.ids){const r=await fetch('https://viator-agent-meeting.viator-joey.chatgpt.site/api/hub/production/retry',{method:'POST',headers:{'Content-Type':'application/json','OAI-Sites-Authorization':`Bearer ${x.token}`,'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({projectId:'sandbox',id})});console.log(JSON.stringify({id,status:r.status,body:await r.text()}));}
