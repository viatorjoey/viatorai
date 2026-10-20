import {videoResponse} from './video-response.mjs';
import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
export function createDirectCloud({db,data,vault,fetcher=fetch}){
const credentials={};const fetch=(...args)=>fetcher(...args);
const stamp=()=>new Date().toISOString();
const hash=async value=>createHash('sha256').update(value).digest('hex');
class HubError extends Error{constructor(status,message){super(message);this.status=status;}}
db.exec('CREATE TABLE IF NOT EXISTS studio_cloud_requests(project TEXT NOT NULL,id TEXT NOT NULL,fingerprint TEXT NOT NULL,state TEXT NOT NULL,body TEXT NOT NULL,updated TEXT NOT NULL,PRIMARY KEY(project,id))');
const database=()=>({prepare(sql){let args=[];const stmt=db.prepare(sql);return {bind(...values){args=values;return this;},async first(){return stmt.get(...args);},async run(){return {meta:stmt.run(...args)};}};}});
mkdirSync(path.join(data,'results'),{recursive:true});
const env={...process.env,BUCKET:{async put(key,bytes,{httpMetadata}){
 const id=key.split('/').at(-1),mime=httpMetadata.contentType;
 const ext=({'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','video/mp4':'.mp4'})[mime];
 const b=Buffer.from(bytes);const valid=ext==='.png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):ext==='.jpg'?b[0]===255&&b[1]===216:ext==='.webp'?b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP':ext==='.mp4'&&b.subarray(4,8).toString()==='ftyp';
 if(!valid)throw new HubError(502,'제공사 결과 파일 검증에 실패했습니다.');
 const filename=id+'-0'+ext,target=path.join(data,'results',filename);writeFileSync(target+'.tmp',b);renameSync(target+'.tmp',target);
}}};
async function keys(){for(const p of ['openai','gemini','xai','anthropic']){const name={openai:'OPENAI_API_KEY',gemini:'GEMINI_API_KEY',xai:'XAI_API_KEY',anthropic:'ANTHROPIC_API_KEY'}[p];credentials[p]=await vault.get(p)||process.env[name];}}
function safeHost(url,provider){const u=new URL(url);const host=u.hostname;return u.protocol==='https:'&&(provider==='gemini'?(host==='generativelanguage.googleapis.com'||host==='storage.googleapis.com'||host.endsWith('.googleusercontent.com')):(host==='x.ai'||host.endsWith('.x.ai')));}
async function download(url,provider,key){for(let i=0;i<5;i++){if(!safeHost(url,provider))throw new HubError(502,'제공사 결과 다운로드 주소를 확인해야 합니다.');const u=new URL(url);const headers=provider==='gemini'&&u.hostname==='generativelanguage.googleapis.com'?{'x-goog-api-key':key}:{};const r=await fetch(url,{headers,signal:AbortSignal.timeout(120000),redirect:'manual'});if([301,302,303,307,308].includes(r.status)){const next=r.headers.get('location');await r.body?.cancel();if(!next)throw new HubError(502,'다운로드 이동 주소가 없습니다.');url=new URL(next,url).href;continue;}return r;}throw new HubError(502,'다운로드 이동 횟수를 초과했습니다.');}
const definitions = [
    { id: 'openai:chatgpt-image-latest', label: 'OpenAI · ChatGPT 이미지', provider: 'openai', modes: ['text-image', 'image-image'] },
    { id: 'openai:gpt-image-2.5-flare', label: 'OpenAI · 빠른 이미지', provider: 'openai', modes: ['text-image', 'image-image'] },
    { id: 'openai:gpt-image-2.5-sunburst', label: 'OpenAI · 정밀 이미지', provider: 'openai', modes: ['text-image', 'image-image'] },
    { id: 'gemini:gemini-3.1-flash-image', label: 'Gemini · Nano Banana 2', provider: 'gemini', modes: ['text-image', 'image-image'] },
    { id: 'gemini:gemini-3-pro-image', label: 'Gemini · Nano Banana Pro', provider: 'gemini', modes: ['text-image', 'image-image'] },
    { id: 'gemini:veo-3.1-fast-generate-preview', label: 'Gemini · Veo 3.1 Fast', provider: 'gemini', modes: ['text-video', 'image-video'], durations: [4, 6, 8], aspects: ['16:9', '9:16'] },
    { id: 'gemini:veo-3.1-generate-preview', label: 'Gemini · Veo 3.1', provider: 'gemini', modes: ['text-video', 'image-video'], durations: [4, 6, 8], aspects: ['16:9', '9:16'] },
    { id: 'xai:grok-imagine-image-2.0', label: 'Grok · Imagine 이미지', provider: 'xai', modes: ['text-image', 'image-image'] },
    { id: 'xai:grok-imagine-video-1.5-lite', label: 'Grok · Imagine 영상 Lite', provider: 'xai', modes: ['text-video', 'image-video'], durations: [5, 10, 15] },
    { id: 'xai:grok-imagine-video-1.5', label: 'Grok · Imagine 영상', provider: 'xai', modes: ['text-video', 'image-video'], durations: [5, 10, 15] },
    { id: 'openai:chat', label: 'ChatGPT · 대화·분석·작성', provider: 'openai', modes: ['llm-chat'] },
    { id: 'gemini:chat', label: 'Gemini · 대화·이미지 분석', provider: 'gemini', modes: ['llm-chat'] },
    { id: 'xai:chat', label: 'Grok · 대화·이미지 분석', provider: 'xai', modes: ['llm-chat'] },
    { id: 'anthropic:chat', label: 'Claude · 분석·작성·코딩', provider: 'anthropic', modes: ['llm-chat'] }
];
function chatModelName(provider){return {openai:env.OPENAI_MODEL||'gpt-5.4-mini',gemini:env.GEMINI_MODEL||'gemini-3.8-flash',xai:'grok-4.7',anthropic:'claude-sonnet-5-5'}[provider];}
function credential(provider) { return credentials[provider]; }
function studioCapabilities() { return { executionOwner: 'studio', models: definitions.map(m => ({ ...m, textModel:m.modes.includes('llm-chat')?chatModelName(m.provider):undefined, vision: m.modes.includes('llm-chat'), connected: !!credential(m.provider), reason: credential(m.provider) ? null : 'API 키 연결 필요' })), notes: ['Claude는 대화·분석용이며 이미지·영상 생성은 제공하지 않습니다.', 'ChatGPT·Gemini·Grok·Claude 앱 전용 기능은 API 제공 범위와 다를 수 있습니다.', 'OpenAI 영상 API는 제공 종료로 사용할 수 없습니다.'] }; }
async function schema() { }
async function update(pid, id, state, value) { const prior=await database().prepare('SELECT body FROM studio_cloud_requests WHERE project=? AND id=?').bind(pid,id).first();value={...(prior?JSON.parse(prior.body):{}),...value};await database().prepare('UPDATE studio_cloud_requests SET state=?,body=?,updated=? WHERE project=? AND id=?').bind(state, JSON.stringify(value), stamp(), pid, id).run(); return { state, ...value }; }
function providerFailure(status, data, retryAfter = null, secrets = []) {
    const rawError=typeof data==='string'?data:data?.error;const e=typeof rawError==='string'?{message:rawError,code:data?.code}:rawError&&typeof rawError==='object'?rawError:{message:typeof data?.message==='string'?data.message:typeof data?.detail==='string'?data.detail:'',code:data?.code};const details = Array.isArray(e.details) ? e.details : [];
    let original = String(e.message || e.detail || '').replace(/AIza[\w-]{20,}|AQ[\w-]{30,}|sk-[\w-]{10,}|Bearer\s+[^\s]+/gi, '[비공개]');
    for (const secret of secrets)
        if (secret)
            original = original.split(secret).join('[비공개]');
    original = original.slice(0, 700);
    const quotas = details.flatMap((d) => Array.isArray(d.violations) ? d.violations : []).slice(0, 8).map((v) => ({ metric: String(v.quotaMetric || '').slice(0, 160), id: String(v.quotaId || '').slice(0, 160), limit: String(v.quotaValue ?? '').slice(0, 40) }));
    const delay = details.find((d) => d.retryDelay)?.retryDelay;
    const seconds = /^\d+(\.\d+)?s$/.test(String(delay)) ? Math.ceil(parseFloat(delay)) : /^\d+$/.test(retryAfter || '') ? Number(retryAfter) : null;
    const code = String(e.status || e.code || status).slice(0, 80), q = quotas.map((v) => v.id + ' ' + v.metric).join(' '), hint = original + ' ' + q;
    const reason = /incorrect api key|invalid api key|invalid_api_key|api key (?:is )?(?:invalid|expired|revoked)/i.test(original)?'authentication':/content.?policy|moderation|safety|responsible ai|content.?filter/i.test(original)?'content_filtered':status === 429 ? (/prepay|credit.*deplet|billing|payment|balance/i.test(original) ? 'billing' : /perday|daily|daylimit/i.test(hint) ? 'daily_quota' : quotas.length ? 'quota' : seconds ? 'rate_limit' : 'resource_exhausted') : status === 401 || status === 403 ? 'permission' : status >= 500 ? 'unavailable' : 'request';
    const advice = { authentication:'API 키 인증에 실패했습니다. 스튜디오 설정에서 해당 서비스의 유효한 API 키를 다시 저장해주세요.', content_filtered:'제공사의 콘텐츠 검토에서 요청이 제한됐습니다.', billing: 'API 프로젝트의 결제 연결·선불 잔액을 확인해주세요.', daily_quota: '일일 생성 한도에 도달했습니다. Google AI Studio에서 해당 프로젝트의 한도를 확인해주세요.', quota: '해당 모델의 API 할당량 제한입니다. Google AI Studio에서 한도와 사용량을 확인해주세요.', rate_limit: '요청 속도 제한입니다.', resource_exhausted: 'Google이 요청을 제한했습니다. 할당량 또는 일시적 처리 용량을 확인해야 합니다.', permission: 'API 키 또는 모델 접근 권한을 확인해주세요.', unavailable: '제공 서비스가 일시적으로 요청을 처리하지 못했습니다.', request: '요청 설정을 확인해주세요.' };
    return { message: '클라우드 API ' + status + ' · ' + advice[reason] + (seconds ? ' ' + seconds + '초 후 다시 시도할 수 있습니다.' : '') + (original ? '\n제공사 사유: ' + original : ''), diagnostics: { httpStatus: status, code, reason, retryAfterSeconds: seconds, quotas } };
}
async function api(url, headers, value) { const r = await fetch(url, { method: value === undefined ? 'GET' : 'POST', headers: { ...headers, ...(value instanceof FormData ? {} : { 'Content-Type': 'application/json' }) }, body: value === undefined ? undefined : value instanceof FormData ? value : JSON.stringify(value), signal: AbortSignal.timeout(120000) }); let d;const raw=await r.text();try {
    d = JSON.parse(raw);
}
catch {
    d = r.ok?{}:{error:raw.trim().startsWith('<')?'제공사가 JSON 대신 오류 페이지를 반환했습니다.':raw.slice(0,700)};
} if (!r.ok) {
    const failure = providerFailure(r.status, d, r.headers.get('retry-after'), Object.values(headers).map(v => String(v).replace(/^Bearer /, '')));
    const error = new HubError(r.status === 429 ? 429 : 502, failure.message);
    error.diagnostics = failure.diagnostics;
    throw error;
} return d; }
function image(b) { if (!b.image)
    return null; const i = b.image; if (!['image/png', 'image/jpeg', 'image/webp'].includes(i.mime) || typeof i.data !== 'string' || i.data.length > 28 * 1024 * 1024 || !/^[A-Za-z0-9+/=]+$/.test(i.data))
    throw new HubError(400, '첨부 이미지 형식을 확인하세요.'); return i; }
function dataUri(i) { return `data:${i.mime};base64,${i.data}`; }
async function media(pid, id, bytes, mime) { if (mime.startsWith('image/') && bytes[0] === 255 && bytes[1] === 216)
    mime = 'image/jpeg'; if (!env.BUCKET || !bytes.length || bytes.length > 200 * 1024 * 1024)
    throw new HubError(502, '클라우드 결과 저장소 또는 파일 크기를 확인하세요.'); await env.BUCKET.put(`studio-cloud/${pid}/${id}`, bytes, { httpMetadata: { contentType: mime } }); return { asset: { mime, bytes: bytes.length, kind: mime.startsWith('video/') ? 'video' : 'image' } }; }
function decode(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
function textOutput(d) { return d.output_text || d.output?.flatMap((o) => o.content || []).filter((c) => c.type === 'output_text').map((c) => c.text).join('\n') || ''; }
async function chat(provider, b, key) {
    const messages = Array.isArray(b.messages) ? b.messages.slice(-20) : [];
    if (!messages.length || messages.some((m) => !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || m.content.length > 12000))
        throw new HubError(400, '대화 내용을 확인하세요.');
    if (provider === 'gemini') {
        const contents = messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }, ...(m.image ? [{ inlineData: { mimeType: image(m).mime, data: m.image.data } }] : [])] }));
        const d = await api(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(chatModelName('gemini'))}:generateContent`, { 'x-goog-api-key': key }, { contents, generationConfig: { maxOutputTokens: 4096 } });
        return d.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    }
    if (provider === 'anthropic') {
        const d = await api('https://api.anthropic.com/v1/messages', { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, { model: chatModelName('anthropic'), max_tokens: 4096, messages: messages.map((m) => ({ role: m.role, content: [{ type: 'text', text: m.content }, ...(m.image ? [{ type: 'image', source: { type: 'base64', media_type: image(m).mime, data: m.image.data } }] : [])] })) });
        return d.content?.filter((p) => p.type === 'text').map((p) => p.text).join('') || '';
    }
    const input = messages.map((m) => ({ role: m.role, content: [{ type: m.role === 'assistant' ? 'output_text' : 'input_text', text: m.content }, ...(m.image ? [{ type: 'input_image', image_url: dataUri(image(m)) }] : [])] }));
    const d = await api(provider === 'xai' ? 'https://api.x.ai/v1/responses' : 'https://api.openai.com/v1/responses', { Authorization: `Bearer ${key}` }, { model: chatModelName(provider), input, store: false, max_output_tokens: 4096 });
    return textOutput(d);
}
async function studioCloudSubmit(pid, b) {
    await schema();
    const id = String(b.id || '');
    if (!/^[a-f0-9-]{36}$/.test(id))
        throw new HubError(400, '스튜디오 작업 번호가 필요합니다.');
    const model = definitions.find(m => m.id === b.model && m.modes.includes(b.mode));
    if (!model)
        throw new HubError(400, '지원하는 클라우드 모델을 선택하세요.');
    const key = credential(model.provider, b.providerKey);
    if (!key)
        throw new HubError(503, '이 서비스의 API 키를 먼저 연결하세요.');
    const fingerprint = await hash(JSON.stringify(b)), old = await database().prepare('SELECT * FROM studio_cloud_requests WHERE project=? AND id=?').bind(pid, id).first();
    if (old) {
        if (old.fingerprint !== fingerprint)
            throw new HubError(409, '같은 작업 번호의 내용이 변경되었습니다.');
        return { state: old.state, ...JSON.parse(old.body) };
    }
    if (b.mode !== 'llm-chat' && (typeof b.prompt !== 'string' || !b.prompt.trim() || b.prompt.length > 6000))
        throw new HubError(400, '프롬프트를 확인하세요.');
    const img = image(b);
    if (b.mode.startsWith('image-') && !img)
        throw new HubError(400, '첨부 이미지가 필요합니다.');
    if (!env.BUCKET && b.mode !== 'llm-chat')
        throw new HubError(503, '결과 저장소를 연결하세요.');
    const inserted = await database().prepare("INSERT OR IGNORE INTO studio_cloud_requests VALUES(?,?,?,'submitting',?,?)").bind(pid, id, fingerprint, JSON.stringify({ provider: model.provider, model: b.model }), stamp()).run();
    if (!inserted.meta.changes)
        return studioCloudStatus(pid, id);
    try {
        if (b.mode === 'llm-chat') {
            const answer = await chat(model.provider, b, key);
            if (!answer.trim())
                throw new HubError(502, '답변이 비어 있습니다.');
            return update(pid, id, 'complete', { text: answer });
        }
        const originalAspect=b.aspect==='original'&&b.mode==='image-image'&&!!img;
        const raw = b.model.slice(b.model.indexOf(':') + 1), aspect = ['16:9', '9:16', '1:1', '4:3', '3:4'].includes(b.aspect) ? b.aspect : '9:16';
        let d;
        if (b.mode.endsWith('video')) {
            if (model.provider === 'gemini') {
                if (![4, 6, 8].includes(b.duration) || !['16:9', '9:16'].includes(aspect))
                    throw new HubError(400, 'Veo는 4·6·8초와 16:9·9:16을 지원합니다.');
                d = await api(`https://generativelanguage.googleapis.com/v1beta/models/${raw}:predictLongRunning`, { 'x-goog-api-key': key }, { instances: [{ prompt: b.prompt, ...(img ? { image: { bytesBase64Encoded: img.data, mimeType: img.mime } } : {}) }], parameters: { aspectRatio: aspect, durationSeconds: b.duration, resolution: '720p', sampleCount: 1 } });
                if (!/^models\/[\w.-]+\/operations\/[\w.-]+$/.test(d.name || ''))
                    throw Error('operation');
                return update(pid, id, 'pending', { provider: 'gemini', operation: d.name });
            }
            d = await api('https://api.x.ai/v1/videos/generations', { Authorization: `Bearer ${key}` }, { model: raw, prompt: b.prompt, duration: b.duration, aspect_ratio: aspect, resolution: '720p', ...(img ? { image: { url: dataUri(img) } } : {}) });
            if (!/^[\w-]{1,200}$/.test(d.request_id || ''))
                throw Error('operation');
            return update(pid, id, 'pending', { provider: 'xai', operation: d.request_id });
        }
        let bytes, mime = 'image/png';
        if (model.provider === 'openai') {
            const size = originalAspect ? 'auto' : aspect === '1:1' ? '1024x1024' : ['9:16', '3:4'].includes(aspect) ? '1024x1536' : '1536x1024', common = { model: raw, prompt: b.prompt, n: 1, size, quality: 'high', output_format: 'png' };
            if (img) {
                const f = new FormData();
                for (const [k, v] of Object.entries(common))
                    f.append(k, String(v));
                f.append('image', new Blob([decode(img.data)], { type: img.mime }), 'input.' + (img.mime === 'image/jpeg' ? 'jpg' : img.mime.split('/')[1]));
                d = await api('https://api.openai.com/v1/images/edits', { Authorization: `Bearer ${key}` }, f);
            }
            else
                d = await api('https://api.openai.com/v1/images/generations', { Authorization: `Bearer ${key}` }, common);
            bytes = decode(d.data?.[0]?.b64_json || '');
        }
        else if (model.provider === 'gemini') {
            d = await api('https://generativelanguage.googleapis.com/v1beta/interactions', { 'x-goog-api-key': key }, { model: raw, input: [{ type: 'text', text: b.prompt }, ...(img ? [{ type: 'image', data: img.data, mime_type: img.mime }] : [])], response_format: { type: 'image', mime_type: 'image/png', ...(originalAspect?{}:{aspect_ratio: aspect}), image_size: '2K' } });
            const o = d.interaction || d, out = o.output_image || o.outputImage || o.outputs?.find((x) => x.type === 'image');
            bytes = decode(out?.data || '');
            mime = out?.mime_type || 'image/png';
        }
        else {
            d = await api('https://api.x.ai/v1/images/' + (img ? 'edits' : 'generations'), { Authorization: `Bearer ${key}` }, { model: raw, prompt: b.prompt, n: 1, response_format: 'b64_json', ...(originalAspect?{}:{aspect_ratio: aspect}), ...(img ? { image: { url: dataUri(img), type: 'image_url' } } : {}) });
            bytes = decode(d.data?.[0]?.b64_json || '');
        }
        return update(pid, id, 'complete', await media(pid, id, bytes, mime));
    }
    catch (e) {
        const error = e instanceof HubError ? e.message : '클라우드 요청 결과를 확인해야 합니다. 중복 결제 방지를 위해 자동 재요청하지 않았습니다.';
        return update(pid, id, 'blocked', { error, ...(e?.diagnostics ? { diagnostics: e.diagnostics } : {}) });
    }
}
async function studioCloudStatus(pid, id, providerKey) {
    await schema();
    const r = await database().prepare('SELECT * FROM studio_cloud_requests WHERE project=? AND id=?').bind(pid, id).first();
    if (!r)
        return { state: 'missing' };
    const value = JSON.parse(r.body);
    if (r.state !== 'pending')
        return { state: r.state, ...value };
    const key = credential(value.provider, providerKey);
    const d=value.provider==='gemini'
        ?await api('https://generativelanguage.googleapis.com/v1beta/'+value.operation,{'x-goog-api-key':key})
        :await api('https://api.x.ai/v1/videos/'+encodeURIComponent(value.operation),{Authorization:'Bearer '+key});
    const outcome=videoResponse(value.provider,d);
    if(outcome.state==='pending')return {state:'pending'};
    if(outcome.state==='blocked'){
        const detail=providerFailure(200,{error:{message:outcome.detail||''}},null,[key]).message.split('\n제공사 사유: ')[1]||'';
        return update(pid,id,'blocked',{error:outcome.message+(detail?'\n제공사 사유: '+detail:''),diagnostics:{httpStatus:200,phase:'generation',provider:value.provider,reason:outcome.reason,code:outcome.code}});
    }
    const url=outcome.url;
    const u = new URL(url);
    const allowed = value.provider === 'gemini' ? u.hostname === 'generativelanguage.googleapis.com' : u.hostname.endsWith('.x.ai') || u.hostname === 'x.ai';
    if (u.protocol !== 'https:' || !allowed)
        throw new HubError(502, '결과 다운로드 주소를 확인해야 합니다.');
    const res = await download(url, value.provider, key);
    if (!res.ok || Number(res.headers.get('content-length')) > 200 * 1024 * 1024)
        throw new HubError(502, '제공사 결과 다운로드를 확인해야 합니다.');
    const result = await media(pid, id, new Uint8Array(await res.arrayBuffer()), 'video/mp4');
    return update(pid, id, 'complete', result);
}

function assets(id,result){if(result.state!=='complete'||!result.asset)return result;const ext=({'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','video/mp4':'.mp4'})[result.asset.mime];const filename=id+'-0'+ext;const b=readFileSync(path.join(data,'results',filename));return {...result,assets:[{filename,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex'),url:'/api/results/'+filename,kind:result.asset.kind}]};}
return {async validateKey(provider,key){if(provider==='xai'&&key)await api('https://api.x.ai/v1/models',{Authorization:'Bearer '+key});},async caps(){await keys();return {...studioCapabilities(),route:'direct'};},
 adoptVideo({id,provider,operation,model}){
  if(!/^[a-f0-9-]{36}$/.test(id)||!definitions.some(m=>m.id===model&&m.provider===provider&&m.modes.includes('text-video')))throw Error('기존 영상 작업 정보를 확인하세요.');
  const valid=provider==='gemini'?/^models\/[\w.-]+\/operations\/[\w.-]+$/.test(operation)&&operation.split('/')[1]===model.split(':')[1]:provider==='xai'&&/^[\w-]{1,200}$/.test(operation);
  if(!valid)throw Error('기존 제공사 접수 번호를 확인하세요.');
  const prior=db.prepare('SELECT body FROM studio_cloud_requests WHERE project=? AND id=?').get('local',id);
  if(prior){const p=JSON.parse(prior.body);if(p.operation&&p.operation!==operation)throw Error('다른 접수 번호가 이미 저장되어 있습니다.');return;}
  // An imported operation is status-only: its fingerprint cannot authorize a new submit.
  db.prepare('INSERT INTO studio_cloud_requests VALUES(?,?,?,?,?,?)').run('local',id,'legacy-status-only','pending',JSON.stringify({provider,operation,model,importedFromMeeting:true}),stamp());
 },
 async refine(model,request){
  await keys();const selected=definitions.find(m=>m.id===model&&m.modes.includes('llm-chat'));
  if(!selected||!credential(selected.provider))throw Error('연결된 보정 모델을 선택하세요.');
  const content=request.messages.map(m=>m.content).join('\n\nScene data (JSON):\n');
  const text=await chat(selected.provider,{messages:[{role:'user',content}]},credential(selected.provider));
  return {done:true,message:{content:text}};
 },
 async submit(b){await keys();return assets(b.id,await studioCloudSubmit('local',b));},async status(id){await keys();return assets(id,await studioCloudStatus('local',id));}};
}
