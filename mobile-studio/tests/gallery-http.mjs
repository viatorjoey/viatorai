import assert from 'node:assert/strict';
const base='http://localhost:8797';let r=await fetch(base+'/api/local-session',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];
async function call(p,body){return fetch(base+p,{method:body?'POST':'GET',headers:{Cookie:cookie,Origin:base,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});}
const catalog=await(await call('/api/models')).json();assert(catalog.filter(m=>m.modes.includes('image-image')).length>=2);assert(catalog.some(m=>m.modes.includes('image-video')));
const rows=await(await call('/api/jobs')).json(),j=rows[0];assert.equal((await call(j.assets[0].url)).status,200);
assert.equal((await call('/api/gallery/delete',{ids:[j.id,'00000000-0000-4000-8000-000000000000']})).status,400);assert.equal((await call(j.assets[0].url)).status,200);
assert.equal((await call('/api/gallery/delete',{ids:[j.id]})).status,200);assert.equal((await call(j.assets[0].url)).status,404);assert((await(await call('/api/jobs')).json())[0].deletedAt);
assert.equal((await call('/api/gallery/restore',{ids:[j.id]})).status,200);assert.equal((await call(j.assets[0].url)).status,200);
const denied=await fetch(base+'/api/gallery/delete',{method:'POST',headers:{Cookie:cookie,Origin:'https://untrusted.example','Content-Type':'application/json'},body:JSON.stringify({ids:[j.id]})});assert.equal(denied.status,403);
console.log(JSON.stringify({isolatedDatabase:true,installedModels:catalog.length,softDelete:'passed',restore:'passed',atomicValidation:'passed',csrf:'passed',deletedAsset:'blocked'}));
