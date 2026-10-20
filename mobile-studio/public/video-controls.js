import {setIcon} from './icons.js';
const preferences={muted:true,loop:true,cycle:false};
export function resetVideoCycle(){preferences.cycle=false;}
export function nextVideoIndex(items,current){for(let offset=1;offset<=items.length;offset++){const index=(current+offset)%items.length;if(items[index]?.a.kind==='video')return index;}return -1;}
export function attachVideoControls(video,toast=()=>{},{onNext}={}){
 const canCycle=typeof onNext==='function';let disposed=false;
 video.controls=false;video.playsInline=true;video.defaultMuted=preferences.muted;video.muted=preferences.muted;video.loop=canCycle&&preferences.cycle?false:preferences.loop;video.autoplay=true;video.preload='auto';
 const wrapper=document.createElement('div');wrapper.className='viewer-video';const controls=document.createElement('div');controls.className='video-controls';controls.setAttribute('aria-label','영상 재생 설정');controls.hidden=true;
 const sound=document.createElement('button'),loop=document.createElement('button'),cycle=document.createElement('button');sound.type=loop.type=cycle.type='button';sound.className=loop.className=cycle.className='video-toggle';cycle.className+=' video-cycle';
 let hideTimer;
 const hide=()=>{clearTimeout(hideTimer);hideTimer=null;controls.hidden=true;video.controls=false;};
 const autoHide=()=>{clearTimeout(hideTimer);if(!video.paused)hideTimer=setTimeout(hide,2000);};
 const update=()=>{setIcon(sound,video.muted?'muted':'volume',video.muted?'소리 켜기':'소리 끄기');sound.setAttribute('aria-pressed',String(!video.muted));setIcon(loop,'repeat',video.loop?'반복 재생 끄기':'반복 재생 켜기');loop.setAttribute('aria-pressed',String(video.loop));setIcon(cycle,'cyclePlay',preferences.cycle?'자동순환재생 끄기':'자동순환재생 켜기');cycle.setAttribute('aria-pressed',String(preferences.cycle));const label=document.createElement('span');label.textContent='자동순환';cycle.append(label);};
 sound.onclick=e=>{e.stopPropagation();video.muted=!video.muted;preferences.muted=video.muted;video.volume=1;update();hide();if(video.paused)void video.play().catch(()=>{reveal();});};
 loop.onclick=e=>{e.stopPropagation();preferences.cycle=false;video.loop=!video.loop;preferences.loop=video.loop;update();hide();};
 cycle.onclick=e=>{e.stopPropagation();preferences.cycle=!preferences.cycle;video.loop=preferences.cycle?false:preferences.loop;update();hide();toast(preferences.cycle?'자동순환재생 켜짐 · 다음 영상부터 차례로 재생합니다.':'자동순환재생 꺼짐');if(video.ended)void video.play().catch(reveal);};
 video.addEventListener('ended',()=>{if(!disposed&&video.isConnected&&canCycle&&preferences.cycle)onNext();});
 const reveal=()=>{video.controls=true;controls.hidden=false;autoHide();};
 const togglePlayback=()=>{hide();if(video.paused)void video.play().catch(()=>{reveal();toast('영상을 다시 눌러 재생해 주세요.');});else video.pause();};
 video.tabIndex=0;video.setAttribute('aria-label','영상 중앙: 재생 또는 일시정지 · 가장자리: 컨트롤 표시');
 video.addEventListener('volumechange',()=>{preferences.muted=video.muted;update();});
 video.addEventListener('play',hide);
 video.addEventListener('playing',hide);
 video.addEventListener('click',e=>{const r=video.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;if(x>=.3&&x<=.7&&y>=.3&&y<=.7){e.preventDefault();e.stopPropagation();togglePlayback();}else reveal();});
 video.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();e.stopPropagation();togglePlayback();}});
 wrapper.addEventListener('click',e=>{if(e.target===wrapper)reveal();});controls.append(sound,loop);if(canCycle)controls.append(cycle);wrapper.append(video,controls);update();wrapper.dispose=()=>{disposed=true;hide();};
 return {wrapper,start(){void video.play().catch(async()=>{if(!video.isConnected)return;reveal();toast('영상 중앙이나 재생 버튼을 눌러 주세요.');});}};
}
