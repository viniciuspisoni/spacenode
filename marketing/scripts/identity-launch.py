"""Render the SpaceNode identity launch cards from approved brand assets."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "marketing/output/2026-10-05-identidade"
OUT.mkdir(parents=True, exist_ok=True)

S = 2
W = 1080
GRAPHITE = "#151618"
WHITE = "#FFFFFF"
PORCELAIN = "#F7F7F5"
WIND = "#BAC3C6"
COMFORT = "#A3AEB0"
MUTED = "#60646B"
FONT = ROOT / "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf"
BRAND = ROOT / "public/brand"


def font(size):
    return ImageFont.truetype(FONT, size * S)


def card(height=1350, bg=WHITE):
    return Image.new("RGB", (W * S, height * S), bg)


def txt(draw, xy, content, size, color=GRAPHITE, spacing=1.13):
    x, y = xy
    lines = content.split("\n")
    step = int(size * S * spacing)
    for i, line in enumerate(lines):
        draw.text((x * S, y * S + i * step), line, font=font(size), fill=color, anchor="lt")
    return y + len(lines) * step / S


def rule(draw, y, color, x0=84, x1=996):
    draw.line([(x0*S, y*S), (x1*S, y*S)], fill=color, width=2*S)


def logo(image, dark=True, x=84, y=75, width=310):
    name = "spacenode-logo-horizontal-dark.png" if dark else "spacenode-logo-horizontal.png"
    source = Image.open(BRAND / name).convert("RGBA")
    image.alpha_composite(source.resize((width*S, round(width*128/702)*S), Image.Resampling.LANCZOS), (x*S, y*S))


def n_mark(draw, x, y, size, color):
    def p(points):
        return [((x + px*size/64)*S, (y + py*size/64)*S) for px, py in points]
    draw.polygon(p([(4,60),(4,10),(18,26),(18,60)]), fill=color)
    draw.polygon(p([(4,4),(20,4),(60,50),(60,60),(48,60)]), fill=color)
    draw.polygon(p([(46,4),(60,4),(60,44),(46,28)]), fill=color)


def finish(image, name):
    image.resize((image.width//S, image.height//S), Image.Resampling.LANCZOS).save(OUT / name, optimize=True)


# Feed 01 — reveal.
im = card(bg=WIND).convert("RGBA")
d = ImageDraw.Draw(im)
logo(im, dark=True)
rule(d, 251, GRAPHITE)
txt(d, (84, 299), "05.10.2026  /  NOVA IDENTIDADE", 24)
txt(d, (84, 408), "O projeto em\nprimeiro plano.", 88, spacing=1.04)
txt(d, (84, 719), "A SpaceNode se apresenta de um jeito novo.", 28)
n_mark(d, 536, 818, 480, GRAPHITE)
rule(d, 1251, GRAPHITE)
txt(d, (84, 1272), "SPACENODE  /  01", 19)
finish(im, "01-capa.png")

# Feed 02 — structural mark.
im = card(bg=GRAPHITE).convert("RGBA")
d = ImageDraw.Draw(im)
logo(im, dark=False)
rule(d, 251, WHITE)
txt(d, (84, 304), "01  /  O SÍMBOLO", 23, WHITE)
txt(d, (84, 409), "Dois apoios.\nUma ligação.", 78, WHITE, spacing=1.06)
n_mark(d, 330, 753, 420, WHITE)
txt(d, (84, 1200), "Um N que expressa construção e conexão.", 26, WHITE)
finish(im, "02-simbolo.png")

# Feed 03 — secondary palette. The logo remains monochrome.
im = card(bg=PORCELAIN).convert("RGBA")
d = ImageDraw.Draw(im)
logo(im, dark=True)
rule(d, 251, GRAPHITE)
txt(d, (84, 303), "02  /  CORES SECUNDÁRIAS", 23)
txt(d, (84, 386), "A cor da sede chega\nà comunicação.", 66, spacing=1.08)
d.rounded_rectangle((84*S, 674*S, 996*S, 905*S), radius=20*S, fill=WIND)
d.rounded_rectangle((84*S, 930*S, 996*S, 1161*S), radius=20*S, fill=COMFORT)
txt(d, (118, 715), "Vento Gélido", 37)
txt(d, (118, 827), "#BAC3C6", 24)
txt(d, (118, 971), "Conforto", 37)
txt(d, (118, 1083), "#A3AEB0", 24)
txt(d, (84, 1221), "Assinatura sempre em grafite ou branco.", 24, MUTED)
finish(im, "03-paleta.png")

# Feed 04 — invitation.
im = card(bg=COMFORT).convert("RGBA")
d = ImageDraw.Draw(im)
logo(im, dark=True)
rule(d, 251, GRAPHITE)
txt(d, (84, 303), "03  /  UM NOVO CAPÍTULO", 23)
txt(d, (84, 436), "Nova identidade.\nMesmo propósito.", 80, spacing=1.04)
txt(d, (84, 722), "Seu projeto. Sua direção.", 30)
n_mark(d, 655, 807, 320, GRAPHITE)
rule(d, 1160, GRAPHITE)
txt(d, (84, 1194), "Conheça em spacenode.app/identidade", 32)
txt(d, (84, 1282), "SPACENODE  /  04", 19)
finish(im, "04-convite.png")

# Story cards use a central safe area for mobile overlays.
im = card(height=1920, bg=WIND).convert("RGBA")
d = ImageDraw.Draw(im)
logo(im, dark=True, y=260, width=330)
txt(d, (84, 522), "Nova identidade.\nMesmo propósito.", 81, spacing=1.05)
n_mark(d, 236, 913, 608, GRAPHITE)
txt(d, (84, 1475), "O projeto em primeiro plano.", 33)
rule(d, 1545, GRAPHITE)
txt(d, (84, 1580), "spacenode.app/identidade", 31)
finish(im, "story-01-reveal.png")

im = card(height=1920, bg=GRAPHITE).convert("RGBA")
d = ImageDraw.Draw(im)
logo(im, dark=False, y=260, width=330)
txt(d, (84, 485), "A cor da sede\nchega à comunicação.", 68, WHITE, spacing=1.08)
d.rounded_rectangle((84*S, 811*S, 996*S, 1119*S), radius=24*S, fill=WIND)
d.rounded_rectangle((84*S, 1146*S, 996*S, 1454*S), radius=24*S, fill=COMFORT)
txt(d, (126, 861), "Vento Gélido", 38)
txt(d, (126, 1001), "#BAC3C6", 27)
txt(d, (126, 1196), "Conforto", 38)
txt(d, (126, 1336), "#A3AEB0", 27)
txt(d, (84, 1545), "Conheça a nova SpaceNode", 34, WHITE)
txt(d, (84, 1600), "spacenode.app/identidade", 28, WHITE)
finish(im, "story-02-paleta.png")

print(f"Created six cards in {OUT}")
