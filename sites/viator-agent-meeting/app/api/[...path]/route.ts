import {moveTopic} from '../../topic-move';
import {meetingDocuments,meetingDocument,meetingDocumentDownload} from '../../meeting-documents';
import {noticeFeed,noticeRead,noticeKey,noticeSubscribe,noticeUnsubscribe} from '../../notifications';
import {prepareVoiceTopic,startVoiceTopic,voiceTopicStatus} from '../../voice-topic';
import {importProviderConnections} from '../../provider-connections';
import {studioCapabilities,studioCloudSubmit,studioCloudStatus,studioCloudAsset} from '../../studio-gateway';
import {resumeApiParticipants,retryApiParticipant,recoverFinalPrompt,archiveProject,restoreProject,renameProject,projectTrash,sidebarState,sidebarPage,createProject,listProjects,body,cursor,database,event,history,HubError,muse,musePublicationAsset,musePublicationPull,musePublicationResult,owner,productionAsset,project,projectMemory,pull,receiveReply,response,roomMemory,sameOrigin,saveProjectMemory,state,stamp,studio,studioProgressFeed,studioAssetUpload,studioPull,studioReferenceAsset,studioResult,text} from '../../hub-core';
import {editBlockedProduction,cancelPublication,approveActionItem,approveProduction,approveProductionResult,connectMuse,connectStudio,createProduction,createRoom,deleteProductionResult,deleteRoom,productionCapabilities,productionReferenceAsset,rejectActionItem,rejectProduction,renameRoom,retryProduction,reviseProduction,restoreRoom,retryDirector,sendChief,startRoom,stopRoom,syncVideoJobs,trash,uploadProductionReference} from '../../hub-actions';
export const dynamic='force-dynamic';
async function cloudBody(req:Request){if(Number(req.headers.get('content-length')||0)>30*1024*1024)throw new HubError(413,'첨부 파일이 너무 큽니다.');const raw=await req.text();if(raw.length>30*1024*1024)throw new HubError(413,'첨부 파일이 너무 큽니다.');return JSON.parse(raw);}
async function handle(req:Request){try{
  const path=new URL(req.url).pathname;
  if(req.method==='POST'&&path==='/api/internal/meeting-provider-keys')return response(await importProviderConnections(req));
  if(path.startsWith('/api/muse/')){
    const principal=await muse(req),pid=principal.project;
    if(req.method==='GET'&&path==='/api/muse/info')return response({projectId:pid,protocol:'viator-muse-pull-v3',leaseSeconds:600,maxDirectorReplies:null,replyMode:'text_reply_no_hub_approval',agentPolicyRequired:true,memory:{scope:'room',path:'/api/muse/memory',includedWithPull:true},generation:{capabilities:{method:'GET',path:'/api/muse/generation/capabilities'},propose:{method:'POST',path:'/api/muse/generation/propose'},chiefApprovalRequired:true},externalActionsEnabled:true,publication:{platform:'threads',account:'chief',approvalRequired:true,pull:{method:'POST',path:'/api/muse/publication/pull'},asset:{method:'GET',path:'/api/muse/publication/asset'},result:{method:'POST',path:'/api/muse/publication/result'}},receive:{method:'POST',path:'/api/muse/pull',body:{projectId:pid}},reply:{method:'POST',path:'/api/muse/reply',body:{deliveryId:'<delivery.id>',leaseId:'<delivery.lease_id>',reply:'<actual Muse response>'},headers:{'Idempotency-Key':'<stable unique reply key>'}}});
    if(req.method==='GET'&&path==='/api/muse/memory')return response(await roomMemory(pid,text(new URL(req.url).searchParams.get('roomId'),'대화 ID',100),true));
    if(req.method==='GET'&&path==='/api/muse/generation/capabilities')return response(productionCapabilities());
    if(req.method==='GET'&&path==='/api/muse/publication/asset')return musePublicationAsset(req,pid);
    if(req.method!=='POST')throw new HubError(405,'POST 요청이 필요합니다.');
    const b=path.startsWith('/api/studio/cloud/')?await cloudBody(req):await body(req);if(b.projectId!==undefined&&b.projectId!==pid)throw new HubError(403,'이 프로젝트에는 접근할 수 없습니다.');
    if(path==='/api/muse/heartbeat')return response({ok:true,projectId:pid,lastSeen:stamp()});
    if(path==='/api/muse/pull')return response(await pull(pid,principal.id));
    if(path==='/api/muse/reply')return response(await receiveReply(pid,principal.id,b,req.headers.get('idempotency-key')||''));
    if(path==='/api/muse/generation/propose')return response(await createProduction(`muse:${principal.id}`,pid,b,`muse:${req.headers.get('idempotency-key')||''}`));
    if(path==='/api/muse/publication/pull')return response(await musePublicationPull(pid,principal.id));
    if(path==='/api/muse/publication/result')return response(await musePublicationResult(pid,principal.id,b));
    throw new HubError(404,'연결 경로를 확인해주세요.');
  }
  if(path.startsWith('/api/studio/')){
    const principal=await studio(req),pid=principal.project;
    if(req.method==='GET'&&path==='/api/studio/info')return response({projectId:pid,protocol:'viator-studio-bridge-v2',leaseSeconds:600,externalPublicationAllowed:false,receive:{method:'POST',path:'/api/studio/pull'},reference:{method:'GET',path:'/api/studio/reference'},result:{method:'POST',path:'/api/studio/result'}});
    if(req.method==='GET'&&path==='/api/studio/reference')return studioReferenceAsset(req,pid);
    if(req.method==='GET'&&path==='/api/studio/capabilities')return response(await studioCapabilities());
    if(req.method==='GET'&&path==='/api/studio/cloud/asset')return studioCloudAsset(pid,text(new URL(req.url).searchParams.get('id'),'작업 ID',100));
    if(req.method==='PUT'&&path==='/api/studio/asset')return response(await studioAssetUpload(req,pid,principal.id));
    if(req.method!=='POST')throw new HubError(405,'POST 요청이 필요합니다.');
    const b=path.startsWith('/api/studio/cloud/')?await cloudBody(req):await body(req);if(b.projectId!==undefined&&b.projectId!==pid)throw new HubError(403,'이 프로젝트에는 접근할 수 없습니다.');
    if(path==='/api/studio/cloud/submit')return response(await studioCloudSubmit(pid,b));
    if(path==='/api/studio/cloud/status')return response(await studioCloudStatus(pid,text(b.id,'작업 ID',100),b.providerKey));
    if(path==='/api/studio/heartbeat')return response({ok:true,projectId:pid,lastSeen:stamp()});
    if(path==='/api/studio/pull')return response(await studioPull(pid,principal.id));
    if(path==='/api/studio/result')return response(await studioResult(pid,principal.id,b));
    throw new HubError(404,'스튜디오 연결 경로를 확인해주세요.');
  }
  const actor=owner(req);
  const params=new URL(req.url).searchParams;
  if(req.method==='GET'&&path==='/api/hub/voice-topic')return response(await voiceTopicStatus(actor,await project(params.get('project')),params.get('id')));
  if(req.method==='POST'&&path==='/api/hub/voice-topic'){sameOrigin(req);return response(await prepareVoiceTopic(actor,await project(params.get('project')),req));}
  if(req.method==='GET'&&path==='/api/hub/notifications')return response(await noticeFeed(actor));
  if(req.method==='GET'&&path==='/api/hub/notifications/key')return response(await noticeKey());
  if(req.method==='GET'&&path==='/api/hub/sidebar'){const selected=params.get('project');return response(selected?await sidebarPage(await project(selected),cursor(params.get('before'))):await sidebarState());}
  if(req.method==='GET'&&path==='/api/hub/projects/trash')return response({projects:await projectTrash()});
  if(req.method==='GET'&&path==='/api/hub/projects')return response({projects:await listProjects()});
  if(req.method==='GET'&&path==='/api/hub/documents'){const q=new URL(req.url).searchParams;return response(await meetingDocuments(await project(q.get('project')),q.get('roomId'),q.get('before')?Number(q.get('before')):null,q.get('search')||''));}
  if(req.method==='GET'&&path==='/api/hub/document'){const q=new URL(req.url).searchParams,pid=await project(q.get('project')),id=text(q.get('id'),'문서 ID',100);return q.has('download')?await meetingDocumentDownload(pid,id):response(await meetingDocument(pid,id));}
  if(req.method==='GET'&&path==='/api/hub'){const pid=await project(params.get('project')||'sandbox');return response(await state(pid,params.get('roomId'),cursor(params.get('before'))));}
  if(req.method==='GET'&&path==='/api/hub/studio/progress')return response(await studioProgressFeed(await project(params.get('project')),text(params.get('roomId'),'대화 ID',100)));
  if(req.method==='GET'&&path==='/api/hub/production/asset'){owner(req);return productionAsset(req,await project(params.get('project')));}
  if(req.method==='GET'&&path==='/api/hub/production/reference'){owner(req);return productionReferenceAsset(req,await project(params.get('project')));}
  if(req.method==='GET'&&path==='/api/hub/memory')return response(await roomMemory(await project(params.get('project')),text(params.get('roomId'),'대화 ID',100)));
  if(req.method==='GET'&&path==='/api/hub/project-memory')return response(await projectMemory(await project(params.get('project'))));
  if(req.method==='GET'&&path==='/api/hub/trash')return response(await trash(await project(params.get('project')),cursor(params.get('before'))));
  if(req.method==='GET'&&path==='/api/hub/history')return response(await history(await project(params.get('project')),text(params.get('roomId'),'대화 ID',100),cursor(params.get('before'))));
  if(req.method==='POST'&&path==='/api/hub/production/reference'){sameOrigin(req);return response(await uploadProductionReference(actor,await project(params.get('project')),req));}
  if(req.method!=='POST')throw new HubError(404,'요청 경로를 확인해주세요.');
  sameOrigin(req);const b=await body(req);
  if(path==='/api/hub/voice-topic/start')return response(await startVoiceTopic(actor,await project(b.projectId),b.commandId));
  if(path==='/api/hub/notifications/read')return response(await noticeRead(actor,b.ids));
  if(path==='/api/hub/notifications/subscribe')return response(await noticeSubscribe(actor,b.subscription));
  if(path==='/api/hub/notifications/unsubscribe')return response(await noticeUnsubscribe(actor,b.endpoint));
  if(path==='/api/hub/topic/move')return response(await moveTopic(actor,b.projectId,b.targetProjectId,b.roomId));
  if(path==='/api/hub/project/rename')return response(await renameProject(actor,b.projectId,b.name));
  if(path==='/api/hub/project/delete')return response(await archiveProject(actor,await project(b.projectId)));
  if(path==='/api/hub/project/restore')return response(await restoreProject(actor,b.projectId));
  if(path==='/api/hub/project/create')return response(await createProject(actor,b.name));
  if(path==='/api/hub/start')return response(await startRoom(actor,await project(b.projectId),b.topic,req.headers.get('idempotency-key')||''));
  if(path==='/api/hub/room/create')return response(await createRoom(actor,await project(b.projectId),b.title,req.headers.get('idempotency-key')||''));
  if(path==='/api/hub/agents/resume')return response(await resumeApiParticipants(actor,await project(b.projectId),b.roomId));
  if(path==='/api/hub/agent/retry')return response(await retryApiParticipant(actor,await project(b.projectId),b.roomId,b.agent,req.headers.get('idempotency-key')||''));
  if(path==='/api/hub/retry')return response(await retryDirector(actor,await project(b.projectId),b.roomId,b.incomingId,req.headers.get('idempotency-key')||''));
  if(path==='/api/hub/delete')return response(await deleteRoom(actor,await project(b.projectId),b.roomId));
  if(path==='/api/hub/restore')return response(await restoreRoom(actor,await project(b.projectId),b.roomId));
  if(path==='/api/hub/rename')return response(await renameRoom(actor,await project(b.projectId),b.roomId,b.title));
  if(path==='/api/hub/message')return response(await sendChief(actor,await project(b.projectId),b.roomId,b.message,req.headers.get('idempotency-key')||''));
  if(path==='/api/hub/project-memory')return response(await saveProjectMemory(actor,await project(b.projectId),b.summary,b.sources));
  if(path==='/api/hub/action/approve')return response(await approveActionItem(actor,await project(b.projectId),b.id));
  if(path==='/api/hub/action/reject')return response(await rejectActionItem(actor,await project(b.projectId),b.id));
  if(path==='/api/hub/stop')return response(await stopRoom(actor,b.roomId));
  if(path==='/api/hub/connect')return response(await connectMuse(actor,await project(b.projectId),new URL(req.url).origin));
  if(path==='/api/hub/production/create')return response(await createProduction(actor,await project(b.projectId),b,req.headers.get('idempotency-key')||''));
  if(path==='/api/hub/production/approve')return response(await approveProduction(actor,await project(b.projectId),b.id));
  if(path==='/api/hub/production/reject')return response(await rejectProduction(actor,await project(b.projectId),b.id));
  if(path==='/api/hub/production/error/edit')return response(await editBlockedProduction(actor,await project(b.projectId),b,req.headers.get('idempotency-key')||''));
  if(path==='/api/hub/production/retry')return response(await retryProduction(actor,await project(b.projectId),b.id));
  if(path==='/api/hub/production/publication/cancel')return response(await cancelPublication(actor,await project(b.projectId),b.id));
  if(path==='/api/hub/final-prompt/recover')return response(await recoverFinalPrompt(actor,await project(b.projectId),b.roomId));
  if(path==='/api/hub/production/result/approve')return response(await approveProductionResult(actor,await project(b.projectId),b.id,b.caption));
  if(path==='/api/hub/production/result/delete')return response(await deleteProductionResult(actor,await project(b.projectId),b.id));
  if(path==='/api/hub/production/revise')return response(await reviseProduction(actor,await project(b.projectId),b.id,b.note,req.headers.get('idempotency-key')||''));
  if(path==='/api/hub/studio/connect')return response(await connectStudio(actor,await project(b.projectId),new URL(req.url).origin));
  if(path==='/api/hub/disconnect'){const pid=await project(b.projectId);await database().prepare('UPDATE hub_agent_keys SET enabled=0 WHERE project=?').bind(pid).run();await event(actor,pid,'muse.disconnect');return response({ok:true});}
  throw new HubError(404,'요청 경로를 확인해주세요.');
}catch(e){return response({error:e instanceof HubError?e.message:'연결을 확인해주세요. 잠시 후 다시 시도해주세요.'},e instanceof HubError?e.status:500);}}
export const GET=handle;export const POST=handle;export const PUT=handle;
