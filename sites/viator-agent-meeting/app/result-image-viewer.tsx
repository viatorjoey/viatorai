'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';

function ZoomImage({src}:{src:string}){
 const viewport=useRef<HTMLDivElement>(null),point=useRef({x:0,y:0,px:0,py:0});
 const drag=useRef<{x:number,y:number,left:number,top:number,moved:boolean}|null>(null);
 const [zoom,setZoom]=useState(false),[size,setSize]=useState({width:0,height:0});
 useLayoutEffect(()=>{const box=viewport.current;if(!box)return;if(zoom){box.scrollLeft=point.current.x-point.current.px;box.scrollTop=point.current.y-point.current.py;}else{box.scrollLeft=0;box.scrollTop=0;}},[zoom]);
 return <div ref={viewport} className={'result-image-viewport'+(zoom?' zoomed':'')} onPointerDown={e=>{if(!zoom)return;const box=viewport.current!;drag.current={x:e.clientX,y:e.clientY,left:box.scrollLeft,top:box.scrollTop,moved:false};}} onPointerMove={e=>{const d=drag.current;if(!d||!zoom)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.abs(dx)+Math.abs(dy)>5){d.moved=true;e.currentTarget.setPointerCapture(e.pointerId);}viewport.current!.scrollLeft=d.left-dx;viewport.current!.scrollTop=d.top-dy;}} onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{drag.current=null;}}>
  <img src={src} alt="제작 결과 원본" draggable={false} style={zoom?{width:size.width,height:size.height}:undefined} onLoad={e=>setSize({width:e.currentTarget.naturalWidth,height:e.currentTarget.naturalHeight})} onClick={e=>{if(drag.current?.moved){drag.current=null;return;}drag.current=null;if(!size.width)return;if(!zoom){const image=e.currentTarget.getBoundingClientRect(),box=viewport.current!.getBoundingClientRect();point.current={x:(e.clientX-image.left)/image.width*size.width,y:(e.clientY-image.top)/image.height*size.height,px:e.clientX-box.left,py:e.clientY-box.top};}setZoom(!zoom);}}/>
 </div>;
}

export default function ResultImageViewer({images,index,onIndex,onClose}:{images:string[],index:number,onIndex:(index:number)=>void,onClose:()=>void}){
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();onClose();}if(e.key==='ArrowLeft'&&index>0)onIndex(index-1);if(e.key==='ArrowRight'&&index<images.length-1)onIndex(index+1);};document.addEventListener('keydown',key,true);return()=>document.removeEventListener('keydown',key,true);},[images,index,onClose,onIndex]);
 return <div className="backdrop result-image-backdrop" onClick={e=>{if(e.currentTarget===e.target)onClose();}}><section className="result-image-dialog" role="dialog" aria-modal="true" aria-label="결과 이미지 보기"><ZoomImage key={images[index]} src={images[index]}/><footer>{images.length>1&&<><button className="outline" disabled={index===0} onClick={()=>onIndex(index-1)}>이전</button><span>{index+1} / {images.length}</span><button className="outline" disabled={index===images.length-1} onClick={()=>onIndex(index+1)}>다음</button></>}<button className="outline result-image-close" onClick={onClose}>닫기</button></footer></section></div>;
}
