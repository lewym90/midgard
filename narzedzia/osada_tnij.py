"""Wycina budynki i ikony osady z arkuszy na różowym tle (#FF00FF)."""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'zrodla')
OUT = os.path.join(ROOT, 'assets', 'img', 'osada')
os.makedirs(OUT, exist_ok=True)

def klucz(im):
    """Odmieszanie od różowego tła: piksel = a*kolor + (1-a)*(255,0,255).
    Dzięki temu dym i brzegi dostają prawdziwą przezroczystość i własny kolor, bez różu."""
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mag = np.minimum(r, b) - g
    alpha = np.clip(1.0 - (mag - 15) / (235 - 15), 0, 1)
    al = np.maximum(alpha, 1e-3)
    r2 = np.clip((r - (1 - alpha) * 255) / al, 0, 255)
    g2 = np.clip(g / al, 0, 255)
    b2 = np.clip((b - (1 - alpha) * 255) / al, 0, 255)
    out = np.dstack([r2, g2, b2, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')

def potnij(plik, cols, rows, nazwy, szer):
    im = klucz(Image.open(os.path.join(SRC, plik)))
    W, H = im.size
    k = 0
    for j in range(rows):
        for i in range(cols):
            cell = im.crop((i * W // cols, j * H // rows, (i + 1) * W // cols, (j + 1) * H // rows))
            a = np.asarray(cell)[..., 3]
            # tylko największy spójny kształt (bez okruchów z sąsiednich pól)
            maska = ndimage.binary_dilation(a > 120, iterations=3)
            lab, n = ndimage.label(maska)
            if n > 1:
                rozm = ndimage.sum(maska, lab, range(1, n + 1))
                glowny = lab == (int(np.argmax(rozm)) + 1)
                arr = np.asarray(cell).copy(); arr[..., 3] = np.where(glowny, arr[..., 3], 0)
                cell = Image.fromarray(arr, 'RGBA'); a = arr[..., 3]
            ys, xs = np.where(a > 20)
            box = (max(0, xs.min() - 2), max(0, ys.min() - 2), min(cell.width, xs.max() + 3), min(cell.height, ys.max() + 3))
            c = cell.crop(box)
            if c.width > szer:
                c = c.resize((szer, round(c.height * szer / c.width)), Image.LANCZOS)
            c.save(os.path.join(OUT, nazwy[k] + '.webp'), quality=88, method=6)
            k += 1

potnij('osada-budynki-1.png', 3, 3, ['dlugi_dom', 'tartak', 'kopalnia', 'farma', 'spichlerz', 'skarbiec', 'hala_wojow', 'kuznia', 'swiatynia'], 420)
potnij('osada-budynki-2.png', 3, 3, ['stocznia', 'chata_volvy', 'magazyn', 'wieza', 'brama', 'palisada', 'kamien', 'chata_budowniczego', 'ognisko'], 420)
potnij('osada-ikony.png', 3, 2, ['ik-drewno', 'ik-zelazo', 'ik-zywnosc', 'ik-srebro', 'ik-slawa', 'ik-budowniczy'], 128)
Image.open(os.path.join(SRC, 'osada-teren.png')).convert('RGB').save(os.path.join(OUT, 'teren.webp'), quality=80, method=6)
print('OK')
