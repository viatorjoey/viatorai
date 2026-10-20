import {env} from 'cloudflare:workers';
import {database,HubError,stamp} from './hub-core';
type Connections={anthropic?:string;xai?:string;gemini?:string;openai?:string};
async function schema(){await database().prepare('CREATE TABLE IF NOT EXISTS hub_private_connections (id text PRIMARY KEY NOT NULL,iv text NOT NULL,sealed text NOT NULL,updated_at text NOT NULL)').run();}
async function wrappingKey(){if(!env.SITES_SERVICE_TOKEN)throw new HubError(503,'비공개 서비스 연결을 확인해주세요.');const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.SITES_SERVICE_TOKEN));return crypto.subtle.importKey('raw',digest,'AES-GCM',false,['encrypt','decrypt']);}
const encode=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
const decode=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export async function providerConnections():Promise<Connections>{
 await schema();const row=await database().prepare("SELECT iv,sealed FROM hub_private_connections WHERE id='meeting-api'").first<{iv:string;sealed:string}>();let stored:Connections={};
 if(row)try{const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(row.iv),additionalData:new TextEncoder().encode('viator:meeting-api:v1')},await wrappingKey(),decode(row.sealed));stored=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new HubError(503,'스튜디오 API 연결을 다시 동기화해주세요.');}
 return {openai:stored.openai||env.OPENAI_API_KEY,anthropic:env.ANTHROPIC_API_KEY||stored.anthropic,xai:env.XAI_API_KEY||stored.xai,gemini:stored.gemini||env.GEMINI_API_KEY};
}
export async function importProviderConnections(req:Request){
 // The owner-private Site dispatch boundary authenticates service access.
 // A second server-held token check also keeps this route closed if sharing changes.
 const secret=env.SITES_SERVICE_TOKEN||'',provided=(req.headers.get('authorization')||'').replace(/^Bearer /,'');let different=secret.length^provided.length;for(let i=0;i<Math.max(secret.length,provided.length);i++)different|=(secret.charCodeAt(i)||0)^(provided.charCodeAt(i)||0);if(!secret||different)throw new HubError(401,'비공개 서비스 인증이 필요합니다.');
 if(Number(req.headers.get('content-length')||0)>8192)throw new HubError(413,'연결 설정이 너무 큽니다.');const raw=await req.text();if(raw.length>8192)throw new HubError(413,'연결 설정이 너무 큽니다.');let keys:Connections;try{keys=JSON.parse(raw);}catch{throw new HubError(400,'연결 설정을 확인해주세요.');}
 if(!keys||typeof keys!=='object'||Array.isArray(keys)||!['anthropic','xai','gemini','openai'].some(name=>Object.hasOwn(keys,name)))throw new HubError(400,'스튜디오 API 연결을 확인해주세요.');
 for(const name of ['anthropic','xai'] as const)if(keys[name]!==undefined&&(typeof keys[name]!=='string'||!/^[A-Za-z0-9_-]{20,512}$/.test(keys[name]!)))throw new HubError(400,'스튜디오 API 연결을 확인해주세요.');
 if(keys.gemini!==undefined&&(typeof keys.gemini!=='string'||!/^[A-Za-z0-9_.-]{20,2048}$/.test(keys.gemini)))throw new HubError(400,'재미니 API 연결을 확인해주세요.');
 if(keys.openai!==undefined&&(typeof keys.openai!=='string'||!/^sk-[A-Za-z0-9_-]{17,509}$/.test(keys.openai)))throw new HubError(400,'OpenAI API 연결을 확인해주세요.');
 const previous=await providerConnections(),only={anthropic:keys.anthropic||previous.anthropic,xai:keys.xai||previous.xai,gemini:keys.gemini||previous.gemini,openai:keys.openai||previous.openai},iv=crypto.getRandomValues(new Uint8Array(12)),sealed=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('viator:meeting-api:v1')},await wrappingKey(),new TextEncoder().encode(JSON.stringify(only)));
 await schema();await database().prepare("INSERT INTO hub_private_connections(id,iv,sealed,updated_at) VALUES('meeting-api',?,?,?) ON CONFLICT(id) DO UPDATE SET iv=excluded.iv,sealed=excluded.sealed,updated_at=excluded.updated_at").bind(encode(iv),encode(new Uint8Array(sealed)),stamp()).run();
 return {ok:true,configured:[...(only.anthropic?['claude']:[]),...(only.xai?['grok']:[]),...(only.gemini?['gemini']:[]),...(only.openai?['openai']:[])]};
}

export async function openAIConnection(){const key=(await providerConnections()).openai;return {key,source:key&&key!==env.OPENAI_API_KEY?'studio':key?'environment':null};}
