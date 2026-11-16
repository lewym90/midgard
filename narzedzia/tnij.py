"""Tnie grafiki źródłowe z assets/zrodla na pliki używane przez grę (assets/img)."""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'zrodla')
OUT = os.path.join(ROOT, 'assets', 'img')

def src(name):
    return Image.open(os.path.join(SRC, name))

def save(im, rel, q=84):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if rel.endswith('.png'):
        im.save(path, optimize=True)
    else:
        im.save(path, quality=q, method=6)
    return path

def token(im, cx, cy, r, size=256):
    box = (cx - r, cy - r, cx + r, cy + r)
    crop = im.convert('RGB').crop(box).resize((size, size), Image.LANCZOS)
    # miękka krawędź koła
    mask = Image.new('L', (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).ellipse((2, 2, size * 4 - 3, size * 4 - 3), fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)
    out = Image.new('RGBA', (size, size))
    out.paste(crop, (0, 0), mask)
    return out

def grid(im, cols, rows, inset):
    """cols/rows: listy (start, koniec) komórek; inset: ile pikseli uciąć z każdej krawędzi."""
    cells = []
    for (y0, y1) in rows:
        for (x0, x1) in cols:
            cells.append(im.crop((x0 + inset, y0 + inset, x1 - inset, y1 - inset)))
    return cells

# --- Bohaterowie ---
HEROES = {
    'berserker': ('bohater-berserker.png', (650, 180, 200)),
    'tarczowniczka': ('bohater-tarczowniczka.png', (585, 205, 205)),
    'volva': ('bohater-volva.png', (570, 195, 195)),
    'skald': ('bohater-skald.png', (450, 225, 200)),
    'jarl': ('bohater-jarl.png', (500, 205, 200)),
    'mistrz-run': ('bohater-mistrz-run.png', (540, 230, 200)),
    'lowczyni': ('bohater-lowczyni.png', (470, 250, 200)),
    'ulfhedinn': ('bohater-ulfhedinn.png', (690, 370, 220)),
}
for key, (fn, (cx, cy, r)) in HEROES.items():
    im = src(fn).convert('RGB')
    save(im.resize((768, 1152), Image.LANCZOS), f'bohaterowie/{key}.webp', 82)
    save(token(im, cx, cy, r), f'bohaterowie/{key}-zeton.webp', 88)

# --- Pozostali bohaterowie z arkusza 8 postaci (tymczasowo, do czasu portretów HD) ---
sheet = src('bohaterowie-arkusz.png').convert('RGB')
SC = [(1, 442), (445, 885), (889, 1329), (1332, 1772)]
SR = [(1, 442), (444, 886)]
cell = lambda col, row: sheet.crop((SC[col][0], SR[row][0], SC[col][1], SR[row][1]))
SHEET_HEROES = {
    'skald': ((3, 0), (150, 100, 100)),
    'jarl': ((0, 1), (222, 100, 100)),
    'mistrz-run': ((1, 1), (185, 110, 105)),
    'lowczyni': ((2, 1), (165, 95, 100)),
    'ulfhedinn': ((3, 1), (245, 125, 110)),
}
for key, ((col, row), (cx, cy, r)) in SHEET_HEROES.items():
    p = cell(col, row)
    if not os.path.exists(os.path.join(SRC, f'bohater-{key}.png')):
        save(p.resize((512, 512), Image.LANCZOS), f'bohaterowie/{key}-karta.webp', 84)
        save(token(p, cx, cy, r), f'bohaterowie/{key}-zeton.webp', 88)
# karty wyboru dla bohaterów z portretami HD: kwadrat z górnej części portretu
for key in HEROES:
    im = src(HEROES[key][0]).convert('RGB')
    save(im.crop((0, 0, 1024, 1024)).resize((512, 512), Image.LANCZOS), f'bohaterowie/{key}-karta.webp', 84)

# --- Draugry (3 panele) ---
d = src('draugry-arkusz.png').convert('RGB')
panels = grid(d, [(5, 586), (596, 1177), (1188, 1769)], [(4, 884)], 0)
ENEMIES = [('draugr', (320, 150, 150)), ('lucznik', (335, 140, 150)), ('pan-kurhanu', (300, 118, 118))]
for (key, (cx, cy, r)), p in zip(ENEMIES, panels):
    save(p, f'wrogowie/{key}.webp', 82)
    save(token(p, cx, cy, r), f'wrogowie/{key}-zeton.webp', 88)

# --- Teren 3x2 ---
t = src('teren-arkusz.png').convert('RGB')
cells = grid(t, [(10, 505), (520, 1016), (1031, 1527)], [(9, 505), (518, 1013)], 6)
for name, c in zip(['snieg', 'las', 'lod', 'bagno', 'skaly', 'kurhan'], cells):
    save(c.resize((512, 512), Image.LANCZOS), f'teren/{name}.webp', 84)

# --- Materiały 3x2 (pergamin i skóra mają brzegi: większy margines) ---
m = src('materialy-arkusz.png').convert('RGB')
cells = grid(m, [(7, 507), (518, 1018), (1028, 1529)], [(6, 506), (517, 1018)], 30)
for name, c in zip(['dab', 'zelazo', 'skora', 'kosc', 'pergamin', 'zloto'], cells):
    save(c.resize((384, 384), Image.LANCZOS), f'material/{name}.webp', 82)

# --- Tła i marka ---
save(src('stol-bitwy.png').convert('RGB'), 'tlo/stol.webp', 80)
save(src('key-art.png').convert('RGB'), 'tlo/key-art.webp', 82)
logo = src('logo.png').convert('RGBA')
save(logo.resize((1200, round(1200 * logo.height / logo.width)), Image.LANCZOS), 'marka/logo.webp', 90)

# --- Ikony PWA ---
ic = src('ikona-zrodlo.png').convert('RGB')
for s in (512, 192, 180, 32):
    save(ic.resize((s, s), Image.LANCZOS), f'ikony/ikona-{s}.png')
# wersja "maskable": emblemat zmniejszony do bezpiecznej strefy na tle z oryginału
bg = ic.resize((512, 512), Image.LANCZOS).filter(ImageFilter.GaussianBlur(18))
inner = ic.resize((410, 410), Image.LANCZOS)
bg.paste(inner, (51, 51))
save(bg, 'ikony/ikona-maskable-512.png')
print('OK')
