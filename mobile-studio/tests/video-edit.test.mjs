import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {mkdtempSync,mkdirSync,rmSync,existsSync,readFileSync} from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {createContentTools,validateContent} from '../content-tools.mjs';
const exec=promisify(execFile),root=new URL('..',import.meta.url).pathname.replace(/^\/(.:)/,'$1'),python='C:/Users/viato/AppData/Local/Comfy-Desktop/ComfyUI-Installs/viator comfy/ComfyUI/.venv/Scripts/python.exe';
const clip=()=>({title:'A',text:'구간 자막',media:{kind:'upload',id:crypto.randomUUID()},mediaType:'video',sourceDuration:3,start:1,duration:.5,speed:2,volume:.5});
test('video editing retains trim, speed, volume, ratio and caption while rejecting unsafe ranges and media',()=>{const x={tool:'video-edit',title:'편집본',aspect:'1:1',fit:'cover',scenes:[clip()]},p=validateContent(x);assert.equal(p.scenes[0].start,1);assert.equal(p.scenes[0].speed,2);assert.equal(p.scenes[0].volume,.5);assert.equal(p.aspect,'1:1');assert.equal(p.fit,'cover');for(const patch of [{start:-1},{duration:NaN},{speed:0},{speed:Infinity},{volume:3},{media:{kind:'upload',id:'../../secret'}}])assert.throws(()=>validateContent({...x,scenes:[{...clip(),...patch}]}));assert.throws(()=>validateContent({...x,scenes:Array.from({length:31},clip)}));});
test('real editor trims a colored source, joins clips and a photo, burns Korean captions, preserves audio and exports exact frames',{skip:!existsSync(python),timeout:120000},async()=>{
 const data=mkdtempSync(path.join(os.tmpdir(),'video-edit-'));mkdirSync(path.join(data,'uploads'));mkdirSync(path.join(data,'results'));const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE uploads(id TEXT,ext TEXT,mime TEXT);CREATE TABLE cancellations(id TEXT,confirmed INTEGER)');const rows=[];const store=createContentTools({db,data,root,python,execFileAsync:exec,jobs:()=>rows,getJob:id=>rows.find(j=>j.id===id),save:j=>{if(!rows.includes(j))rows.push(j);return j;}});
 try{const videoId=crypto.randomUUID(),photoId=crypto.randomUUID(),source=path.join(data,'uploads',videoId+'.mp4'),photo=path.join(data,'uploads',photoId+'.png');
 await exec(python,['-c',`import av,numpy as np,sys
from PIL import Image
from fractions import Fraction
c=av.open(sys.argv[1],'w');v=c.add_stream('libx264',rate=24);v.width=320;v.height=180;v.pix_fmt='yuv420p';a=c.add_stream('aac',rate=48000);a.layout='stereo'
for i in range(72):
 f=av.VideoFrame.from_image(Image.new('RGB',(320,180),['red','green','blue'][i//24]));f.pts=i;f.time_base=Fraction(1,24)
 for pkt in v.encode(f):c.mux(pkt)
 snd=np.full((2,2000),.1,dtype=np.float32);af=av.AudioFrame.from_ndarray(snd,format='fltp',layout='stereo');af.sample_rate=48000;af.pts=i*2000;af.time_base=Fraction(1,48000)
 for pkt in a.encode(af):c.mux(pkt)
for pkt in v.encode():c.mux(pkt)
for pkt in a.encode():c.mux(pkt)
c.close();Image.new('RGB',(100,100),'red').save(sys.argv[2])`,source,photo],{windowsHide:true});
 db.prepare('INSERT INTO uploads VALUES(?,?,?)').run(videoId,'.mp4','video/mp4');db.prepare('INSERT INTO uploads VALUES(?,?,?)').run(photoId,'.png','image/png');
 const p=store.put({tool:'video-edit',title:'검증 편집',aspect:'1:1',fit:'contain',scenes:[{...clip(),media:{kind:'upload',id:videoId},text:''},{...clip(),media:{kind:'upload',id:videoId},start:2,speed:1,text:'',volume:0},{...clip(),media:{kind:'upload',id:photoId},mediaType:'image',sourceDuration:0,start:0,speed:1,text:'한글 자막'}]},crypto.randomUUID());const key=crypto.randomUUID(),j=store.enqueue(p,key);assert.equal(store.enqueue(p,key),j);await store.dispatch();assert.equal(j.state,'complete',j.message);assert.equal(j.assets[0].kind,'video');
 const r=await exec(python,['-c',`import av,sys,json,numpy as np
c=av.open(sys.argv[1]);frames=list(c.decode(video=0));colors=[f.to_ndarray(format='rgb24')[360,360].tolist() for f in [frames[0],frames[12],frames[24]]];caption=frames[-1].to_ndarray(format='rgb24')[600:690];c.close()
with av.open(sys.argv[1]) as ac:sound=np.concatenate([f.to_ndarray() for f in ac.decode(audio=0)],axis=1)
print(json.dumps({'frames':len(frames),'size':[frames[0].width,frames[0].height],'colors':colors,'caption':int(np.sum(np.all(caption>180,axis=2))),'audio':float(np.max(np.abs(sound[:,:24000]))),'muted':float(np.mean(np.abs(sound[:,26000:46000])))}))`,path.join(data,'results',j.assets[0].filename)],{windowsHide:true});const out=JSON.parse(r.stdout);assert.equal(out.frames,36);assert.deepEqual(out.size,[720,720]);assert.ok(out.colors[0][1]>out.colors[0][0]+40);assert.ok(out.colors[1][2]>out.colors[1][0]+40);assert.ok(out.colors[2][0]>out.colors[2][2]+40);assert.ok(out.caption>20);assert.ok(out.audio>.001);assert.ok(out.muted<.001);assert.match(readFileSync(path.join(data,'results',j.assets[1].filename),'utf8'),/한글 자막/);assert.equal(store.get(p.id).scenes[0].speed,2);
 const bad=store.put({...p,scenes:[{...p.scenes[0],start:2.9,duration:1}],revision:undefined},crypto.randomUUID()),failed=store.enqueue(bad,crypto.randomUUID());await store.dispatch();assert.equal(failed.state,'blocked');
 }finally{db.close();rmSync(data,{recursive:true,force:true});}
});
