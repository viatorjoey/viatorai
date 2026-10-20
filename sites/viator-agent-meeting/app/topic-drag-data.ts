export const TOPIC_DRAG_TYPE='application/x-viator-topic';
export type DragTopic={id:string;project:string;name:string};
export function parseTopicDrop(raw:string):DragTopic|null{try{const value=JSON.parse(raw);if(!value||Array.isArray(value)||typeof value.id!=='string'||typeof value.project!=='string'||!value.id.trim()||!value.project.trim()||value.id.length>100||value.project.length>100)return null;return {id:value.id,project:value.project,name:typeof value.name==='string'?value.name.slice(0,500):'주제'};}catch{return null;}}
