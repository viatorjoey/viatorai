import {test} from 'node:test';import assert from 'node:assert/strict';
import {attachVideoControls,nextVideoIndex,resetVideoCycle} from '../public/video-controls.js';
import vm from 'node:vm';import {readFileSync} from 'node:fs';
class Node{constructor(){this.attrs={};this.children=[];this.handlers={};}setAttribute(k,v){this.attrs[k]=v;}replaceChildren(...n){this.children=n;}append(...n){this.children.push(...n);}addEventListener(k,fn){this.handlers[k]=fn;}}
const setup=()=>{globalThis.document={createElement:()=>new Node(),createElementNS:()=>new Node()};};
const video=()=>Object.assign(new Node(),{paused:false,isConnected:true,play(){this.paused=false;return Promise.resolve();},pause(){this.paused=true;}});
const event={stopPropagation(){}};
test('automatic cycle switches off single looping, persists between videos and restores single looping when disabled',()=>{
 setup();resetVideoCycle();let next=0;const first=video(),a=attachVideoControls(first,()=>{},{onNext:()=>next++});const [sound,loop,cycle]=a.wrapper.children[1].children;
 assert.equal(first.loop,true);assert.equal(cycle.attrs['aria-pressed'],'false');first.handlers.ended();assert.equal(next,0);
 cycle.onclick(event);assert.equal(first.loop,false);assert.equal(cycle.attrs['aria-pressed'],'true');assert.equal(loop.attrs['aria-pressed'],'false');first.handlers.ended();assert.equal(next,1);
 const second=video(),b=attachVideoControls(second,()=>{},{onNext:()=>next++});assert.equal(second.loop,false);assert.equal(b.wrapper.children[1].children[2].attrs['aria-pressed'],'true');
 b.wrapper.children[1].children[2].onclick(event);assert.equal(second.loop,true);second.handlers.ended();assert.equal(next,1);
 assert.equal(sound.attrs['aria-pressed'],'false');resetVideoCycle();a.wrapper.dispose();b.wrapper.dispose();
});
test('manual single-repeat cancels cycle and removed or closed players never advance the gallery',()=>{
 setup();resetVideoCycle();let next=0;const v=video(),{wrapper}=attachVideoControls(v,()=>{},{onNext:()=>next++}),[,loop,cycle]=wrapper.children[1].children;
 cycle.onclick(event);loop.onclick(event);assert.equal(v.loop,true);assert.equal(cycle.attrs['aria-pressed'],'false');v.handlers.ended();assert.equal(next,0);
 cycle.onclick(event);v.isConnected=false;v.handlers.ended();assert.equal(next,0);v.isConnected=true;wrapper.dispose();v.handlers.ended();assert.equal(next,0);
 resetVideoCycle();const fresh=video();attachVideoControls(fresh,()=>{},{onNext(){}});assert.equal(fresh.loop,true);
});
test('playlist advances in gallery order, skips photos, wraps after final video and repeats a single video',()=>{
 const items=['image','video','image','video','image'].map(kind=>({a:{kind}}));
 assert.equal(nextVideoIndex(items,1),3);assert.equal(nextVideoIndex(items,3),1);assert.equal(nextVideoIndex([{a:{kind:'image'}},{a:{kind:'video'}}],1),1);assert.equal(nextVideoIndex([{a:{kind:'image'}}],0),-1);assert.equal(nextVideoIndex([],0),-1);
});
test('real viewer reuses the video across automatic advances, updates saving and wraps to the first video',()=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const items=['video','image','video'].map((kind,i)=>({j:{id:String(i),mode:'text-video'},a:{kind,url:'/media/'+i}}));
 let advance,plays=0,replaces=0;const saved=[],player={isConnected:true},content={querySelectorAll:()=>[],replaceChildren(){replaces++;},append(){}},dialog={open:true},ui={'#result-content':content,'#result-dialog':dialog,'#viewer-label':{},'#viewer-prev':{},'#viewer-next':{}};
 const ctx={mediaList:()=>items,viewerIndex:0,$:id=>ui[id],el:()=>player,toast(){},attachVideoControls:(m,t,o)=>{advance=o.onNext;return {wrapper:{},start(){plays++;}};},nextVideoIndex,names:{'text-video':'영상'},prepareViewerSave:x=>saved.push(x.a.url),closeMedia(){throw Error('unexpected close');}};
 vm.runInNewContext(source.slice(source.indexOf('function showMedia(){'),source.indexOf('function openMedia(a){')),ctx);ctx.showMedia();assert.equal(player.src,'/media/0');advance();assert.equal(player.src,'/media/2');assert.match(ui['#viewer-label'].textContent,/3 \/ 3/);advance();assert.equal(player.src,'/media/0');advance();assert.equal(player.src,'/media/2');assert.equal(plays,4);assert.equal(replaces,1);assert.deepEqual(saved,['/media/0','/media/2','/media/0','/media/2']);dialog.open=false;advance();assert.equal(plays,4);
});
