'use client';
import {useCallback,useEffect,useRef,useState,type CSSProperties} from 'react';
import {ArrowUpRight,Folder,Plus,RefreshCw} from 'lucide-react';
import {ItemMenu,useProjectDrop,useTopicActions,useTopicDrag} from './topic-actions';
import {projectFolderColors,projectFolderHref,type ProjectFolder} from './project-home-data';
export default function ProjectHome({onNewProject,revision}:{onNewProject:()=>void;revision:string}){
 const {revision:itemsRevision}=useTopicActions();
 const [recent,setRecent]=useState<{id:string;title:string;project:string}[]>([]);
 const [projects,setProjects]=useState<ProjectFolder[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const requestVersion=useRef(0);
 const refresh=useCallback(async(signal?:AbortSignal)=>{const version=++requestVersion.current;
  try{const response=await fetch('/api/hub/sidebar',{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});const data=await response.json() as {projects:ProjectFolder[];recent:{id:string;title:string;project:string}[];error?:string};if(!response.ok)throw Error(data.error||'프로젝트를 불러오지 못했습니다.');if(version!==requestVersion.current)return;setProjects(data.projects);setRecent(data.recent);setError('');}
  catch(e){if(signal?.aborted||version!==requestVersion.current)return;setError((e as Error).message||'프로젝트를 불러오지 못했습니다.');}
  finally{if(!signal?.aborted&&version===requestVersion.current)setLoading(false);}
 },[]);
 useEffect(()=>{const controller=new AbortController();void refresh(controller.signal);const timer=setInterval(()=>{if(!document.hidden)void refresh();},30000);const visible=()=>{if(!document.hidden)void refresh();};document.addEventListener('visibilitychange',visible);return()=>{controller.abort();requestVersion.current++;clearInterval(timer);document.removeEventListener('visibilitychange',visible);};},[refresh,revision,itemsRevision]);
 const [today,setToday]=useState('');
 useEffect(()=>{const update=()=>setToday(new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date()));update();const timer=setInterval(update,60000);return()=>clearInterval(timer);},[]);
 const colors=projectFolderColors(projects);
 return <section className="project-home" aria-labelledby="project-home-title"><div className="project-home-heading"><div><time className="project-home-date" suppressHydrationWarning>{today}</time><h1 id="project-home-title">현재 진행프로젝트</h1><p>프로젝트를 선택해 회의를 이어가세요.</p></div><button className="outline project-home-add" onClick={onNewProject}><Plus size={16}/>새 프로젝트</button></div>
 {loading&&!projects.length?<div className="project-home-state" role="status"><span className="spinner"/>프로젝트를 불러오는 중…</div>:<>{error&&<div className="project-home-error" role="status"><p>{error}</p><button className="outline" onClick={()=>void refresh()}><RefreshCw size={14}/>다시 시도</button></div>}{!error&&!projects.length?<div className="project-home-state"><Folder size={42}/><h2>첫 프로젝트를 만들어보세요.</h2><p>프로젝트 안에 주제를 모아 회의를 이어갈 수 있습니다.</p><button className="outline" onClick={onNewProject}><Plus size={15}/>새 프로젝트</button></div>:<div className="project-home-grid">{projects.map(project=><HomeProjectCard key={project.id} project={project} color={colors[project.id]}/>)}</div>}</>}
 {!!recent.length&&<section className="project-home-recents" aria-labelledby="recent-topics-title"><h2 id="recent-topics-title">최근 주제</h2><p>주제를 드래그해 프로젝트 폴더에 넣거나 더보기 메뉴에서 이동하세요.</p><div className="project-home-topic-list">{recent.map(topic=><HomeTopic key={topic.id} topic={topic} projectName={projects.find(p=>p.id===topic.project)?.name||''}/>)}</div></section>}
 </section>;
}

function HomeProjectCard({project,color}:{project:ProjectFolder;color:string}){const drop=useProjectDrop(project.id);return <article className={'project-home-card topic-action-row'+drop.className} style={{'--folder-color':color} as CSSProperties} onDragOver={drop.onDragOver} onDragLeave={drop.onDragLeave} onDrop={drop.onDrop}><a className="project-home-link" href={projectFolderHref(project)} aria-label={project.name+' 프로젝트 열기'}><div className="project-home-card-top"><Folder className="project-home-folder" size={52} strokeWidth={1.15} fill="currentColor" aria-hidden="true"/><span className="project-home-count">주제 {project.total}개</span></div><h2>{project.name}</h2><p>{project.rooms[0]?.title||'아직 주제가 없습니다.'}</p><span className="project-home-enter">프로젝트 열기<ArrowUpRight size={15} aria-hidden="true"/></span></a><ItemMenu item={{kind:'project',id:project.id,project:project.id,name:project.name,total:project.total}}/></article>;}
function HomeTopic({topic,projectName}:{topic:{id:string;title:string;project:string};projectName:string}){const drag=useTopicDrag({id:topic.id,project:topic.project,name:topic.title});return <div className="project-home-topic topic-action-row" {...drag}><a href={'/?'+new URLSearchParams({project:topic.project,room:topic.id}).toString()}><span>{topic.title}</span><small>{projectName}</small></a><ItemMenu item={{kind:'topic',id:topic.id,project:topic.project,name:topic.title}}/></div>;}
