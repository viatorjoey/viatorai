"""CPU scene renderer. Accepts only server-resolved local media paths."""
import json,sys,os
from fractions import Fraction
from PIL import Image,ImageDraw,ImageFont,ImageOps
import av,numpy as np

def lines(draw,value,font,width):
    result=[]
    for paragraph in value.split('\n'):
        line=''
        for ch in paragraph:
            if line and draw.textlength(line+ch,font=font)>width: result.append(line);line=ch
            else: line+=ch
        result.append(line)
    return result

def block(draw,value,box,bold,color,start):
    x,y,width,height=box
    for size in range(start,13,-2):
        font=ImageFont.truetype('C:/Windows/Fonts/malgunbd.ttf' if bold else 'C:/Windows/Fonts/malgun.ttf',size)
        rows=lines(draw,value,font,width);step=int(size*1.5)
        if len(rows)*step<=height: break
    else: raise ValueError('장면의 글이 너무 깁니다. 장면을 나눠 주세요.')
    for row in rows: draw.text((x,y),row,font=font,fill=color);y+=step

def main():
    with open(sys.argv[1],encoding='utf8') as f:p=json.load(f)
    w,h=(720,1280) if p['aspect']=='9:16' else (1280,720)
    temporary=p['output']+'.tmp.mp4';out=av.open(temporary,'w',options={'movflags':'+faststart'})
    vs=out.add_stream('libx264',rate=24);vs.width=w;vs.height=h;vs.pix_fmt='yuv420p';vs.options={'preset':'ultrafast','crf':'23','threads':'4'}
    audio=out.add_stream('aac',rate=48000);audio.layout='stereo';audio.bit_rate=128000
    accent=(255,155,66);position=0
    for i,s in enumerate(p['scenes']):
        source=s.get('source');video=source and source['kind']=='video'
        im=Image.new('RGBA',(w,h),(12,12,12,255))
        if source and not video:
            with Image.open(source['file']) as photo:im=ImageOps.fit(ImageOps.exif_transpose(photo).convert('RGBA'),(w,h))
            im.alpha_composite(Image.new('RGBA',(w,h),(0,0,0,110)))
        if video:im=Image.new('RGBA',(w,h),(0,0,0,0))
        d=ImageDraw.Draw(im);pad=48
        if video:d.rectangle((0,int(h*.62),w,h),fill=(0,0,0,185))
        d.rectangle((pad,pad,pad+50,pad+5),fill=accent)
        block(d,p.get('brand',''),(pad,pad+22,w-2*pad,70),False,accent,22)
        start=int(h*.66) if video else int(h*.24)
        block(d,s['title'],(pad,start,w-pad*2,int(h*.15)),True,'white',42 if w==720 else 48)
        block(d,s['text'],(pad,start+int(h*.17),w-pad*2,int(h*.24) if not video else int(h*.13)),False,'white',28)
        frames=max(1,round(float(s['duration'])*24));pcm=None;src=None;source_frames=None;last=None;source_index=0
        if video:
            src=av.open(source['file']);source_frames=iter(src.decode(video=0));source_rate=float(src.streams.video[0].average_rate or 24)
            if p.get('keepAudio'):
                with av.open(source['file']) as ac:
                    if ac.streams.audio:
                        resampler=av.AudioResampler(format='fltp',layout='stereo',rate=48000);chunks=[];samples=0
                        for frame in ac.decode(audio=0):
                            for f in resampler.resample(frame):chunks.append(f.to_ndarray());samples+=f.samples
                            if samples>=frames*2000:break
                        for f in resampler.resample(None):chunks.append(f.to_ndarray())
                        if chunks:pcm=np.concatenate(chunks,axis=1)
        for n in range(frames):
            picture=im
            if video:
                desired=int(n*source_rate/24)
                while last is None or source_index<=desired:
                    try:last=next(source_frames);source_index+=1
                    except StopIteration:
                        src.seek(0);source_frames=iter(src.decode(video=0))
                        try:last=next(source_frames);source_index+=1
                        except StopIteration:raise ValueError('선택한 영상에 재생 가능한 프레임이 없습니다.')
                base=ImageOps.fit(last.to_image().convert('RGBA'),(w,h));base.alpha_composite(im);picture=base
            frame=av.VideoFrame.from_image(picture.convert('RGB'));frame.pts=position;frame.time_base=Fraction(1,24)
            for packet in vs.encode(frame):out.mux(packet)
            samples=np.zeros((2,2000),dtype=np.float32)
            if pcm is not None and pcm.shape[1]:samples=np.ascontiguousarray(pcm[:,np.arange(n*2000,(n+1)*2000)%pcm.shape[1]])
            af=av.AudioFrame.from_ndarray(samples,format='fltp',layout='stereo');af.sample_rate=48000;af.pts=position*2000;af.time_base=Fraction(1,48000)
            for packet in audio.encode(af):out.mux(packet)
            position+=1
        if src:src.close()
    for packet in vs.encode():out.mux(packet)
    for packet in audio.encode():out.mux(packet)
    out.close()
    os.replace(temporary,p['output'])
    with av.open(p['output']) as check:duration=check.duration/av.time_base
    print(json.dumps({'duration':duration,'width':w,'height':h}))

if __name__=='__main__':
    try:main()
    except Exception as e: print(str(e),file=sys.stderr);sys.exit(1)
