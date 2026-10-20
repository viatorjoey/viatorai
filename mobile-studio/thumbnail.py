import sys
import av
from PIL import Image
with av.open(sys.argv[1]) as video:
    frame=next(video.decode(video=0))
    image=frame.to_image().convert('RGB')
    image.thumbnail((384,384),Image.Resampling.LANCZOS)
    image.save(sys.argv[2],format='JPEG',quality=82)
