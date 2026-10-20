// Owner-approved recovery: import an existing provider operation, never create a video.
import {DatabaseSync} from 'node:sqlite';
import {createDirectCloud} from './direct-cloud.mjs';
import {providerVault} from './provider-vault.mjs';
import {createInterface} from 'node:readline';
const reader=createInterface({input:process.stdin});const input=await new Promise(resolve=>reader.once('line',resolve));reader.close();
const source=JSON.parse(input),db=new DatabaseSync('data/studio.sqlite');
const row=db.prepare('SELECT body FROM jobs WHERE id=?').get(source.id);if(!row)throw Error('작업을 찾지 못했습니다.');const j=JSON.parse(row.body);
if(j.state!=='blocked'||!j.cloudSubmitted||j.cloudRoute==='direct'||j.executionLane!=='cloud'||!j.mode.endsWith('video'))throw Error('복구 대상 기존 영상 작업이 아닙니다.');
const direct=createDirectCloud({db,data:'data',vault:providerVault('data')});
direct.adoptVideo({...source,model:j.model,provider:j.provider});
const result=await direct.status(j.id);
j.cloudRoute='direct';j.legacyRecoveredAt=Date.now();
if(result.state==='complete'){j.assets=result.assets;j.state='complete';j.completedAt=Date.now();j.cleanup={verified:true,cloudOnly:true};j.message='기존에 접수된 영상 결과를 직접 조회하여 스튜디오에 저장했습니다.';}
else if(result.state==='blocked'){j.state='blocked';j.message=result.error;}
else{j.state='queued';j.message='기존 영상 접수 번호로 제공사 상태를 직접 조회합니다. 새 생성 요청은 보내지 않습니다.';}
db.prepare('UPDATE jobs SET state=?,body=? WHERE id=?').run(j.state,JSON.stringify(j),j.id);console.log(JSON.stringify({id:j.id,state:j.state,message:j.message,assets:j.assets?.length||0,providerRequests:'GET only'}));db.close();
