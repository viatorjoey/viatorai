const fs=require('fs'),path=require('path'),root=path.join(__dirname,'viator-agent-meeting');
function edit(f,fn){const p=path.join(root,f);fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8')));}
edit('app/notification-center.tsx',s=>s.replace('navigate:(project:string,room:string)=>void','navigate:(project:string,room:string,notificationId:string)=>void').replace('navigate(n.project,n.roomId)','navigate(n.project,n.roomId,n.id)'));
edit('app/meeting-app.tsx',s=>{
 s=s.replace('const [initialLoading,setInitialLoading]','const [reviewTarget,setReviewTarget]=useState<{project:string,room:string,id:string}|null>(null);\n const [initialLoading,setInitialLoading]');
 s=s.replace(' const requestedRoom=useRef',` useEffect(()=>{if(!reviewTarget||!reviewOpen||pid!==reviewTarget.project||roomId!==reviewTarget.room||state?.selectedRoomId!==reviewTarget.room)return;const timer=setTimeout(()=>{const el=document.getElementById('review-'+reviewTarget.id);if(el){el.scrollIntoView({block:'center',behavior:'smooth'});el.focus({preventScroll:true});}},50);return()=>clearTimeout(timer);},[reviewTarget,reviewOpen,pid,roomId,state]);
 const requestedRoom=useRef`);
 s=s.replace('navigate={(project,room)=>{if(project===pid)',"navigate={(project,room,notificationId)=>{const parts=notificationId.split(':');if(['production','action'].includes(parts[0])){setReviewTarget({project,room,id:parts[0]+':'+parts[1]});setReviewKind('review');setReviewOpen(true);setProductionOpen(false);}if(project===pid)");
 s=s.replace('<details className="review-list-card"><summary><span className="review-card-placeholder"><MessageCircle', '<details className="review-list-card" open={reviewTarget?.id.startsWith(\'action:\')&&report.actions.some(item=>reviewTarget.id===\'action:\'+item.id)?true:undefined}><summary><span className="review-card-placeholder"><MessageCircle');
 s=s.replace("<article className={'action-item '+item.status} key={item.id}>","<article className={'action-item '+item.status} key={item.id} id={'review-action:'+item.id} tabIndex={-1}>");
 s=s.replace('<article className="production-card" key={job.id}><details className="review-list-card">',"<article className=\"production-card\" key={job.id} id={'review-production:'+job.id} tabIndex={-1}><details className=\"review-list-card\" open={reviewTarget?.id==='production:'+job.id?true:undefined}>");
 return s;
});
