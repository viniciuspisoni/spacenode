"""Compose the silent result-review clip from the first-party example pair.
Requires Pillow and ffmpeg. No image generation, synthetic voice or new render.
The configuration walkthrough is built by build-onboarding-case-video.py.
"""
import argparse, json, pathlib, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageOps
root = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--font', default='/System/Library/Fonts/Supplemental/Arial.ttf')
args = parser.parse_args()
font_path = pathlib.Path(args.font)
if not font_path.exists(): raise SystemExit('Provide a TrueType font with --font')
out = root / 'public' / 'onboarding'
out.mkdir(parents=True, exist_ok=True)
fonts = {size: ImageFont.truetype(str(font_path), size) for size in (15, 20, 23, 31)}
images = []
for path in ('demo-sketch.jpg', 'demo-render.jpg'):
    image = ImageOps.contain(Image.open(root / 'public' / path).convert('RGB'), (1152, 460))
    canvas = Image.new('RGB', (1152, 460), '#a3aeb0')
    canvas.paste(image, ((1152-image.width)//2, (460-image.height)//2))
    images.append(canvas)
clips = {
    'review-result': (14, [
        (0, 4, 'COMPARE ANTES DE APRESENTAR', 'Arraste o comparador e confira os detalhes do projeto.'),
        (4, 8, 'ESTE RENDER SERVIU PARA SEU PROJETO?', 'Responda Sim ou Ainda não no painel do resultado.'),
        (8, 11, 'PRECISA AJUSTAR?', 'Escolha uma mudança por vez e continue no Editar.'),
        (11, 14, 'DEU CERTO? CONTINUE CRIANDO', 'Conheça o plano para receber Nodes mensalmente.'),
    ]),
}
manifest = json.loads((out/'clips.json').read_text()) if (out/'clips.json').exists() else []
manifest = [entry for entry in manifest if entry['clip'] not in clips]
for name, (duration, scenes) in clips.items():
    target = out / (name + '.mp4')
    command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo',
        '-pix_fmt', 'rgb24', '-s', '1280x720', '-r', '24', '-i', '-', '-an',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart', str(target)]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    for frame_index in range(duration * 24):
        t = frame_index / 24
        frame = Image.new('RGB', (1280, 720), '#151618')
        frame.paste(images[1], (64, 78))
        # A visible comparison gesture, ending on the result.
        fraction = max(0, min(1, .5 + .45 * __import__('math').sin(t*2))) if t < 4 else 0
        split = round(1152 * fraction)
        if split > 0: frame.paste(images[0].crop((0, 0, split, 460)), (64, 78))
        draw = ImageDraw.Draw(frame)
        draw.text((64, 29), 'SpaceNode / SEU PROJETO, NO CENTRO', font=fonts[20], fill='#bac3c6')
        if 0 < split < 1152:
            draw.line((64+split,78,64+split,538),fill='white',width=3)
            draw.ellipse((64+split-18,290,64+split+18,326),fill='white')
            draw.text((64+split-10,294),'↔',font=fonts[20],fill='#151618')
        _, _, title, description = next(s for s in scenes if s[0] <= t < s[1])
        draw.text((64, 565), title, font=fonts[31], fill='white')
        draw.text((64, 610), description, font=fonts[23], fill='#bdc2c8')
        draw.text((64, 680), 'Guia visual / exemplo com imagens da SpaceNode', font=fonts[15], fill='#8a8f97')
        draw.line((64,658,64+round(1152*t/duration),658),fill='#bac3c6',width=3)
        process.stdin.write(frame.tobytes())
    process.stdin.close()
    if process.wait() != 0: raise SystemExit('Video encoding failed')
    def timestamp(value): return f'00:00:{value:02d}.000'
    (out/(name+'.vtt')).write_text('WEBVTT\n\n'+'\n\n'.join(
        f'{timestamp(start)} --> {timestamp(end)}\n{title}\n{description}'
        for start,end,title,description in scenes)+'\n',encoding='utf-8')
    info = json.loads(subprocess.check_output(['ffprobe','-v','quiet','-show_format','-show_streams','-of','json',str(target)]))
    manifest.append({'clip':name,'duration':float(info['format']['duration']),
        'bytes':target.stat().st_size,'width':info['streams'][0]['width'],
        'height':info['streams'][0]['height'],'audio':False})
(out/'clips.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest))
