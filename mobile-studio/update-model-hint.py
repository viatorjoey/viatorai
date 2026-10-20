from pathlib import Path
p=Path(__file__).resolve().parent/'public/app.js'
t=p.read_text(encoding='utf-8');start=t.index("$('#model-note').textContent=");end=t.index(';}',start)
t=t[:start]+'modelHint()'+t[end:]
helper="""function modelHint(){const z=$('#model').value==='z_image_turbo_bf16.safetensors';$('#model-note').textContent=z?'Z-Image Turbo · image_z_image_turbo 구성 · 8단계, 설명 충실도 1 고정. 피하고 싶은 요소는 장면 설명에 적어 주세요.':mode.endsWith('video')?'현재 호환되는 설치 비디오 모델은 LTX 2.5입니다.':'설치된 호환 모델입니다. Base·9B는 더 오래 걸립니다.';$('#guidance').disabled=z;$('#negative').disabled=z;if(z){$('#guidance').value='1';$('#guidance-value').textContent='모델 기본값 1';}else $('#guidance').oninput();}
$('#model').onchange=modelHint;
"""
t=t.replace('function choose(m){',helper+'function choose(m){',1);p.write_text(t,encoding='utf-8')
