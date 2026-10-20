const fs=require('fs'),path=require('path'),root=path.join(__dirname,'../mobile-studio');
let p=path.join(root,'provider-vault.mjs'),s=fs.readFileSync(p,'utf8');
s=s.replace(/if\(!\['gemini','xai','anthropic'\]\.includes\(provider\).*?throw Error\('서비스와 API 키 형식을 확인하세요\.'\);/,"if(!validProviderKey(provider,key))throw Error('서비스와 API 키 형식을 확인하세요.');");fs.writeFileSync(p,s);
p=path.join(root,'server.mjs');s=fs.readFileSync(p,'utf8').replace("if(p==='/api/cloud/keys'&&req.method==='POST'){const x=await json(req,2048);","if(p==='/api/cloud/keys'&&req.method==='POST'){const x=await json(req,8192);");fs.writeFileSync(p,s);
p=path.join(__dirname,'viator-agent-meeting/app/studio-gateway.ts');s=fs.readFileSync(p,'utf8').replace('/^[A-Za-z0-9_-]{20,512}$/.test(override)',"(provider==='gemini'?/^[A-Za-z0-9._~+/=-]{20,4096}$/:/^[A-Za-z0-9_-]{20,512}$/).test(override)");fs.writeFileSync(p,s);
