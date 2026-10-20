import sys
import av

video_path, audio_path, output_path = sys.argv[1:4]
with av.open(video_path) as source, av.open(audio_path) as speech:
    video = source.streams.video[0]
    with av.open(output_path, mode='w', format='mp4') as output:
        copied = output.add_stream_from_template(video)
        voice = output.add_stream('aac', rate=24000)
        voice.layout = 'mono'
        voice.bit_rate = 128000
        for packet in source.demux(video):
            if packet.dts is not None:
                packet.stream = copied
                output.mux(packet)
        resampler = av.AudioResampler(format='fltp', layout='mono', rate=24000)
        for frame in speech.decode(audio=0):
            for normalized in resampler.resample(frame):
                for packet in voice.encode(normalized):
                    output.mux(packet)
        for normalized in resampler.resample(None):
            for packet in voice.encode(normalized):
                output.mux(packet)
        for packet in voice.encode(None):
            output.mux(packet)
with av.open(output_path) as check:
    if not check.streams.video or not check.streams.audio:
        raise RuntimeError('Output must contain video and selected speech')
print('voice applied')
