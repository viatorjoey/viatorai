import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync('data/studio.sqlite',{readOnly:true});
console.log(JSON.stringify(db.prepare("SELECT body FROM jobs WHERE json_extract(body,'$.executionLane')='cloud' ORDER BY created DESC LIMIT 8").all().map(r=>{const j=JSON.parse(r.body);return {id:j.id,state:j.state,created:j.created,startedAt:j.startedAt,model:j.model,provider:j.provider,cloudRoute:j.cloudRoute,cloudSubmitted:j.cloudSubmitted,message:j.message};}),null,2));db.close();
