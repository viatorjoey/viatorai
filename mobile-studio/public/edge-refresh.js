// A pull starts at a page edge (or after reaching one), never from ordinary scrolling.
export function createEdgePull(threshold=90){
 let point=null,anchor=null,edge=null,distance=0,cancelled=false;
 return {
  start(p,e){point=p;anchor=e?p:null;edge=e;distance=0;cancelled=false;},
  move(p,e){
   if(!point||cancelled)return {distance:0,armed:false,edge:null};
   const dx=p.x-point.x,dy=p.y-point.y;
   if(Math.abs(dx)>18&&Math.abs(dx)>Math.abs(dy)*.75){cancelled=true;distance=0;return {distance:0,armed:false,edge:null};}
   if(!anchor&&e){anchor=p;edge=e;}
   if(anchor&&e!==edge){anchor=null;edge=null;distance=0;}
   if(anchor)distance=Math.max(0,(p.y-anchor.y)*(edge==='top'?1:-1));
   return {distance,armed:distance>=threshold,edge};
  },
  end(){const armed=!cancelled&&distance>=threshold;point=anchor=null;distance=0;return armed;},
  cancel(){point=anchor=null;distance=0;cancelled=true;}
 };
}

export function initEdgeRefresh({onRefresh,canRefresh=()=>true,root=document,win=window}){
 const pull=createEdgePull(),indicator=root.createElement('div');
 indicator.id='edge-refresh';indicator.hidden=true;indicator.setAttribute('role','status');indicator.setAttribute('aria-live','polite');
 const spinner=root.createElement('span'),label=root.createElement('span');spinner.className='edge-refresh-icon';spinner.textContent='↻';spinner.setAttribute('aria-hidden','true');indicator.append(spinner,label);root.body.append(indicator);
 let busy=false,last=0,touching=false,wheelTimer=null,wheelDistance=0,wheelEdge=null,hideTimer=null;
 function edge(){const s=root.scrollingElement||root.documentElement,top=Math.max(0,s.scrollTop),height=win.visualViewport?.height||win.innerHeight;return top<=2?'top':s.scrollHeight>height+8&&top+height>=s.scrollHeight-3?'bottom':null;}
 function blocked(target){if(root.querySelector('dialog[open]'))return true;if(target?.closest?.('input,textarea,select,button,a,video,canvas,iframe,[contenteditable],[data-no-refresh]'))return true;for(let n=target;n&&n!==root.body&&n!==root.documentElement;n=n.parentElement){const c=win.getComputedStyle(n);if(/auto|scroll/.test(c.overflowY)&&n.scrollHeight>n.clientHeight+2)return true;}return false;}
 function allowed(target){return !busy&&Date.now()-last>1200&&canRefresh()&&!blocked(target);}
 function hide(){indicator.hidden=true;indicator.classList.remove('refreshing');}
 function show(state,text){clearTimeout(hideTimer);indicator.hidden=false;indicator.dataset.edge=state.edge||'top';indicator.style.setProperty('--pull',String(Math.min(1,state.distance/90)));if(label.textContent!==text)label.textContent=text;}
 async function run(){if(busy||!canRefresh())return hide();busy=true;last=Date.now();indicator.classList.add('refreshing');label.textContent='새로고침 중…';try{await onRefresh();label.textContent='최신 상태로 업데이트했어요.';}catch{label.textContent='연결을 확인하고 다시 당겨주세요.';}finally{busy=false;hideTimer=setTimeout(hide,1600);}}
 function start(e){if(e.touches.length!==1||!allowed(e.target)){pull.cancel();touching=false;return;}touching=true;const t=e.touches[0];pull.start({x:t.clientX,y:t.clientY},edge());}
 function move(e){if(!touching)return;if(e.touches.length!==1||!canRefresh()){pull.cancel();touching=false;return hide();}const t=e.touches[0],state=pull.move({x:t.clientX,y:t.clientY},edge());if(state.distance<12)return hide();if(e.cancelable)e.preventDefault();show(state,state.armed?'놓으면 새로고침':'조금 더 당겨주세요');}
 function end(){if(!touching)return;touching=false;if(pull.end())void run();else hide();}
 function cancel(){touching=false;pull.cancel();if(!busy)hide();}
 function wheel(e){if(touching||e.ctrlKey||Math.abs(e.deltaX)>Math.abs(e.deltaY)||!allowed(e.target))return;const at=edge(),direction=e.deltaY>0?'bottom':'top';if(!at||at!==direction){wheelDistance=0;wheelEdge=null;clearTimeout(wheelTimer);if(!busy)hide();return;}if(wheelEdge!==at)wheelDistance=0;wheelEdge=at;wheelDistance+=Math.abs(e.deltaY)*(e.deltaMode===1?16:e.deltaMode===2?win.innerHeight:1);if(e.cancelable)e.preventDefault();const state={edge:at,distance:wheelDistance/2,armed:wheelDistance>=180};show(state,state.armed?'스크롤을 놓으면 새로고침':'조금 더 스크롤해 주세요');clearTimeout(wheelTimer);wheelTimer=setTimeout(()=>{const armed=wheelDistance>=180;wheelDistance=0;wheelEdge=null;if(armed)void run();else hide();},220);}
 root.addEventListener('touchstart',start,{passive:true});root.addEventListener('touchmove',move,{passive:false});root.addEventListener('touchend',end,{passive:true});root.addEventListener('touchcancel',cancel,{passive:true});root.addEventListener('wheel',wheel,{passive:false});
 return ()=>{for(const [name,fn]of [['touchstart',start],['touchmove',move],['touchend',end],['touchcancel',cancel],['wheel',wheel]])root.removeEventListener(name,fn);clearTimeout(wheelTimer);clearTimeout(hideTimer);indicator.remove();};
}
