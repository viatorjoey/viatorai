import json,sys,os
from PIL import Image,ImageDraw,ImageFont,ImageOps

def wrap(draw,text,font,width):
    lines=[]
    for paragraph in text.split('\n'):
        line=''
        for ch in paragraph:
            if line and draw.textlength(line+ch,font=font)>width: lines.append(line);line=ch
            else: line+=ch
        lines.append(line)
    return lines

def block(draw,text,box,bold,color,start):
    x,y,w,h=box
    for size in range(start,19,-2):
        font=ImageFont.truetype('C:/Windows/Fonts/malgunbd.ttf' if bold else 'C:/Windows/Fonts/malgun.ttf',size)
        lines=wrap(draw,text,font,w);step=int(size*1.55)
        if len(lines)*step<=h: break
    else: raise ValueError('카드 글이 너무 깁니다. 내용을 줄이거나 카드를 나눠 주세요.')
    for line in lines: draw.text((x,y),line,font=font,fill=color);y+=step

def main():
    with open(sys.argv[1],encoding='utf-8') as f: p=json.load(f)
    sizes={'1:1':(1080,1080),'4:5':(1080,1350),'9:16':(1080,1920)};w,h=sizes[p['aspect']]
    themes={'orange':('#141414','#ffad66','#f7f3ed'),'navy':('#142c41','#8ee3dc','#f5fbff'),'cream':('#f3ecde','#a84c24','#242521')}
    bg,accent,base=themes[p['theme']];files=[]
    for i,s in enumerate(p['slides']):
        fg=base;im=Image.new('RGB',(w,h),bg)
        if s.get('image'):
            with Image.open(s['image']) as photo: im=ImageOps.fit(ImageOps.exif_transpose(photo).convert('RGB'),(w,h))
            im=Image.blend(im,Image.new('RGB',(w,h),'black'),.62);fg='#ffffff'
        d=ImageDraw.Draw(im);d.rounded_rectangle((76,94,156,104),radius=5,fill=accent)
        block(d,p.get('brand',''),(76,132,820,60),False,accent,26)
        block(d,s['title'],(76,240,w-152,int(h*.27)),True,fg,76)
        block(d,s['body'],(76,int(h*.46),w-152,int(h*.39)),False,fg,38)
        block(d,f'{i+1:02d} / {len(p["slides"]):02d}',(76,h-104,400,50),False,accent,25)
        name=f'{p["prefix"]}-{i}.png';im.save(os.path.join(p['outputDir'],name));files.append(name)
    print(json.dumps({'files':files}))
if __name__=='__main__':
    try: main()
    except Exception as e: print(str(e),file=sys.stderr);sys.exit(1)
