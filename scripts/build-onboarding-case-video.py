"""Build a captioned walkthrough from verified captures of the live product.

Source crops in docs/onboarding-video/facade omit account identity and balance.
No generated interface, synthetic voice, charged render or invented result.
"""
import argparse
import json
import math
import pathlib
import subprocess
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--font', default='/System/Library/Fonts/Supplemental/Arial.ttf')
args = parser.parse_args()
fonts = {n: ImageFont.truetype(args.font, n) for n in (15, 18, 22, 24, 32)}
source = ROOT / 'docs/onboarding-video/facade'
out = ROOT / 'public/onboarding'
scenes = [
    (0, 4, 'reference', 'UMA FACHADA,\nPASSO A PASSO', 'Vamos preparar esta vista do modelo para renderizar na SpaceNode.', None),
    (4, 10, 'upload', '01 / CARREGUE\nA REFERÊNCIA', 'Em Renderizar, escolha o arquivo da vista do seu modelo. Use um enquadramento limpo.', (330, 246)),
    (10, 16, 'exterior', '02 / ESCOLHA\nO AMBIENTE', 'Para esta fachada, marque Ambiente Exterior.', (165, 20)),
    (16, 24, 'scene', '03 / DEFINA\nA CENA', 'Escolha Residencial e Fachada Residencial. Neste exemplo, mantemos o entorno original.', (215, 213)),
    (24, 32, 'light', '04 / AJUSTE\nA LUZ', 'Abra Luz e selecione Golden Hour. Mantenha as luminárias como no original.', (355, 200)),
    (32, 38, 'materials', '05 / MANTENHA\nOS MATERIAIS', 'Vamos manter concreto e vidro do modelo. Deixe os campos de alteração de materiais em branco.', (530, 23)),
    (38, 46, 'brief', '06 / EXPLIQUE\nSUA INTENÇÃO', 'Nas orientações opcionais, peça luz suave de fim de tarde e mantenha materiais, aberturas e enquadramento.', (335, 70)),
    (46, 54, 'output', '07 / CONFIRA\nA SAÍDA', 'Neste exemplo: motor Vega, qualidade 2K e custo de 20 Nodes. Motor e resolução alteram o custo.', (170, 276)),
    (54, 60, 'ready', 'PRONTO PARA\nRENDERIZAR', 'Revise as escolhas e os Nodes. Depois, use Gerar render para criar e avaliar sua imagem.', (580, 397)),
]
images = {s[2]: Image.open(source / (s[2]+'.jpg')).convert('RGB') for s in scenes}
reference = images['reference']

def lines(text, font, width):
    result = []
    for paragraph in text.split('\n'):
        current = ''
        for word in paragraph.split():
            candidate = (current + ' ' + word).strip()
            if font.getlength(candidate) > width and current:
                result.append(current)
                current = word
            else:
                current = candidate
        result.append(current)
    return result

def render(t):
    start, end, name, title, description, pointer = next(s for s in scenes if s[0] <= t < s[1])
    frame = Image.new('RGB', (1280, 720), '#f4f4f1')
    draw = ImageDraw.Draw(frame)
    draw.text((42, 30), 'SPACENODE / UM PROJETO, PASSO A PASSO', font=fonts[18], fill='#414541')
    draw.text((1050, 30), f'{int(t):02d} / 60 s', font=fonts[18], fill='#6d726d')
    y = 121
    for line in title.split('\n'):
        draw.text((42, y), line, font=fonts[32], fill='#171b18')
        y += 40
    y += 28
    for line in lines(description, fonts[24], 322):
        draw.text((42, y), line, font=fonts[24], fill='#4c514d')
        y += 33

    # Zooms retain the real labels and selected states; the pointer only guides attention.
    image = images[name]
    scale = min(802/image.width, 486/image.height)
    size = (round(image.width*scale), round(image.height*scale))
    image = image.resize(size, Image.Resampling.LANCZOS)
    x = 422 + (802-size[0])//2
    short_panel = name not in ('reference', 'upload') and size[1] < 280
    y = 128 if short_panel else 111 + (486-size[1])//2
    draw.rounded_rectangle((410, 95, 1238, 618), radius=20, fill='white', outline='#d9ddd8', width=2)
    frame.paste(image, (x, y))
    draw = ImageDraw.Draw(frame)
    if short_panel:
        draw.text((432, y+size[1]+16), 'VISTA DO MODELO ENVIADA', font=fonts[15], fill='#6c736c')
        context = ImageOps.contain(reference, (774, 276))
        frame.paste(context, (432+(774-context.width)//2, y+size[1]+44))
    if pointer:
        px, py = x+pointer[0]*scale, y+pointer[1]*scale
        pulse = 19 + 3*math.sin((t-start)*2)
        draw.ellipse((px-pulse, py-pulse, px+pulse, py+pulse), outline='#78917c', width=3)
        draw.polygon([(px+7,py+5),(px+7,py+29),(px+13,py+23),(px+19,py+34),(px+23,py+32),(px+17,py+22),(px+26,py+22)],fill='#17231a',outline='white')
    if name not in ('reference', 'upload') and not short_panel:
        thumb = ImageOps.contain(reference, (306, 124))
        frame.paste(thumb, (42, 535))
        draw.text((42, 512), 'MESMA VISTA DO MODELO', font=fonts[15], fill='#6c736c')
    draw.text((422, 641), 'Capturas da plataforma · exemplo de fachada residencial', font=fonts[18], fill='#606860')
    draw.line((42, 689, 1238, 689), fill='#d7ded7', width=3)
    draw.line((42, 689, 42+round(1196*t/60), 689), fill='#78917c', width=3)
    return frame

target = out / 'first-image.mp4'
command = ['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1280x720','-r','24','-i','-','-an','-c:v','libx264','-preset','fast','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart',str(target)]
process = subprocess.Popen(command, stdin=subprocess.PIPE)
try:
    for i in range(60*24): process.stdin.write(render(i/24).tobytes())
finally:
    process.stdin.close()
if process.wait() != 0: raise SystemExit('Video encoding failed')
render(1).save(out/'first-image-poster.jpg', quality=92)
def timestamp(seconds):
    return f'00:{seconds//60:02d}:{seconds%60:02d}.000'
(out/'first-image.vtt').write_text('WEBVTT\n\n'+'\n\n'.join(
    f'{timestamp(start)} --> {timestamp(end)}\n{title.replace(chr(10), " ")}\n{description}'
    for start,end,_,title,description,_ in scenes)+'\n',encoding='utf-8')
info = json.loads(subprocess.check_output(['ffprobe','-v','quiet','-show_format','-show_streams','-of','json',str(target)]))
entry = {'clip':'first-image','duration':float(info['format']['duration']),'bytes':target.stat().st_size,'width':info['streams'][0]['width'],'height':info['streams'][0]['height'],'audio':False,'source':'live_product_captures','scope':'reference_and_render_configuration'}
manifest = json.loads((out/'clips.json').read_text())
manifest = [entry if item['clip']=='first-image' else item for item in manifest]
(out/'clips.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(entry))
