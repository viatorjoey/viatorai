"""Local CPU editor: immutable source media, trimmed clips, captions, audio and MP4 export."""
import json,sys,os,math
from fractions import Fraction
import av,numpy as np
from PIL import Image,ImageOps,ImageDraw,ImageFont

def probe(file):
    try:
        with Image.open(file) as image:
            image=ImageOps.exif_transpose(image)
            if image.width*image.height>40000000:raise ValueError('사진 크기가 너무 큽니다.')
            return {'kind':'image','width':image.width,'height':image.height,'duration':0,'audio':False}
    except (OSError,ValueError) as e:
        if isinstance(e,ValueError):raise
    with av.open(file) as c:
        if not c.streams.video:raise ValueError('영상 트랙이 없습니다.')
        v=c.streams.video[0]
        duration=float(v.duration*v.time_base) if v.duration else (c.duration or 0)/av.time_base
        if not math.isfinite(duration) or not 0<duration<=1800:raise ValueError('영상은 30분 이내로 선택하세요.')
        if v.width*v.height>34000000:raise ValueError('영상 해상도가 너무 큽니다.')
        next(c.decode(video=0))
        return {'kind':'video','width':v.width,'height':v.height,'duration':duration,'audio':bool(c.streams.audio)}

def fit(image,size,cover):
    image=image.convert('RGB')
    if cover:return ImageOps.fit(image,size)
    canvas=Image.new('RGB',size,'black');photo=ImageOps.contain(image,size);canvas.paste(photo,((size[0]-photo.width)//2,(size[1]-photo.height)//2));return canvas

def caption(image,text):
    if not text:return image
    image=image.copy();d=ImageDraw.Draw(image);w,h=image.size;size=max(18,round(w*.035));font=ImageFont.truetype('C:/Windows/Fonts/malgunbd.ttf',size);rows=[]
    for paragraph in text.splitlines():
        line=''
        for ch in paragraph:
            if line and d.textlength(line+ch,font=font)>w*.88:rows.append(line);line=ch
            else:line+=ch
        rows.append(line)
    if len(rows)>6:raise ValueError('자막이 너무 깁니다. 클립을 분할해 자막을 나눠주세요.')
    step=int(size*1.5);y=h-max(32,int(h*.06))-step*len(rows)
    for row in rows:
        length=d.textlength(row,font=font);d.text(((w-length)/2,y),row,font=font,fill='white',stroke_width=2,stroke_fill='black');y+=step
    return image

def render(p):
    sizes={'9:16':(720,1280),'16:9':(1280,720),'1:1':(720,720),'4:3':(960,720),'3:4':(720,960)};size=sizes[p['aspect']]
    temporary=p['output']+'.tmp.mp4';out=av.open(temporary,'w',options={'movflags':'+faststart'});vs=out.add_stream('libx264',rate=24);vs.width,vs.height=size;vs.pix_fmt='yuv420p';vs.options={'preset':'ultrafast','crf':'23','threads':'4'}
    audio=out.add_stream('aac',rate=48000);audio.layout='stereo';audio.bit_rate=128000;position=0;elapsed=0
    try:
        for s in p['scenes']:
            file=s['source']['file'];meta=probe(file);start=float(s['start']);speed=float(s['speed']);duration=float(s['duration']);elapsed+=duration;frames=max(1,round(elapsed*24)-position);src=None;pcm=None
            if meta['kind']=='video':
                if start+duration*speed>meta['duration']+.15:raise ValueError('선택한 구간이 원본 영상 길이를 넘습니다.')
                src=av.open(file);stream=src.streams.video[0];src.seek(max(0,int(start/float(stream.time_base))),stream=stream);decoded=iter(src.decode(video=0));last=None
                try:upcoming=next(decoded)
                except StopIteration:raise ValueError('선택한 구간을 읽을 수 없습니다.')
                if meta['audio'] and s['volume']>0:
                    with av.open(file) as ac:
                        ac.seek(max(0,int(start*av.time_base)));resampler=av.AudioResampler(format='fltp',layout='stereo',rate=48000);chunks=[];offset=None;samples=0
                        for frame in ac.decode(audio=0):
                            if offset is None:offset=float(frame.time or 0)
                            for f in resampler.resample(frame):chunks.append(f.to_ndarray());samples+=f.samples
                            if samples/48000>(start-offset)+duration*speed+.1:break
                        for f in resampler.resample(None):chunks.append(f.to_ndarray())
                        if chunks:pcm=np.concatenate(chunks,axis=1);audio_offset=max(0,round((start-(offset or 0))*48000))
            else:
                with Image.open(file) as im:still=caption(fit(ImageOps.exif_transpose(im),size,p['fit']=='cover'),s['text'])
            for n in range(frames):
                if src:
                    target=start+n/24*speed
                    while upcoming is not None and float(upcoming.time or 0)<=target+.0001:
                        last=upcoming
                        try:upcoming=next(decoded)
                        except StopIteration:upcoming=None
                    picture=caption(fit((last or upcoming).to_image(),size,p['fit']=='cover'),s['text'])
                else:picture=still
                f=av.VideoFrame.from_image(picture);f.pts=position;f.time_base=Fraction(1,24)
                for packet in vs.encode(f):out.mux(packet)
                sound=np.zeros((2,2000),dtype=np.float32)
                if pcm is not None:
                    indices=(audio_offset+np.arange(n*2000,(n+1)*2000)*speed).astype(np.int64);valid=indices<pcm.shape[1];sound[:,valid]=pcm[:,indices[valid]]*s['volume'];np.clip(sound,-1,1,out=sound)
                af=av.AudioFrame.from_ndarray(sound,format='fltp',layout='stereo');af.sample_rate=48000;af.pts=position*2000;af.time_base=Fraction(1,48000)
                for packet in audio.encode(af):out.mux(packet)
                position+=1
            if src:src.close()
        for packet in vs.encode():out.mux(packet)
        for packet in audio.encode():out.mux(packet)
    finally:out.close()
    os.replace(temporary,p['output'])
    with av.open(p['output']) as c:duration=c.duration/av.time_base
    return {'duration':duration,'width':size[0],'height':size[1]}

if __name__=='__main__':
    try:
        if sys.argv[1]=='probe':result=probe(sys.argv[2])
        else:
            with open(sys.argv[1],encoding='utf-8') as f:result=render(json.load(f))
        print(json.dumps(result))
    except Exception as e:print(str(e),file=sys.stderr);sys.exit(1)
