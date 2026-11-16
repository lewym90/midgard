"""Test ekranów przed każdą publikacją: Safari (WebKit) i Chrome, telefon pion/poziom, tablet, laptop.
Robi zrzuty i automatycznie sprawdza, czy nic nie wyjeżdża poza ekran i czy kluczowe elementy mają sensowne rozmiary.
Uruchom (z katalogu gry, z serwerem gry pod :8765 i serwerem API pod :18900 z kontem Lewy/tajne123):
  python3 narzedzia/test-ekranow.py            → zrzuty w /tmp/ekrany, na końcu lista błędów
Przed testem ustawia osadę testową (narzedzia/osada-testowa.mjs, dane w MIDGARD_DANE, domyślnie /tmp/mdane):
Hala Wojów, wojsko w szkoleniu, zwerbowani bohaterowie i jeden w Valhalli — żeby sprawdzić ekrany armii.
"""
import asyncio, os, sys
from playwright.async_api import async_playwright

URL = 'http://localhost:8765/index.html'
OUT = '/tmp/ekrany'
ROZMIARY = [('tel-pion', 393, 852), ('tel-poziom', 852, 393), ('tablet', 1180, 820), ('laptop', 1440, 900)]
bledy = []

SPRAWDZ = """(() => {
  const vw = innerWidth, vh = innerHeight, out = [];
  const widoczny = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const ekran = document.querySelector('.screen.active');
  if (!ekran) return ['brak aktywnego ekranu'];
  // elementy szersze niż ekran
  // każde SVG w przycisku/kostce: nie większe niż jego pojemnik (Safari: domyślne 300 px)
  for (const sv of ekran.querySelectorAll('button svg, .die svg, .rune-chip svg, .coin svg')) {
    if (!widoczny(sv)) continue;
    const r = sv.getBoundingClientRect(), p = sv.parentElement.getBoundingClientRect();
    if (r.width > p.width + 2 || r.height > p.height + 2) out.push(`znak SVG większy niż pojemnik (${Math.round(r.width)}×${Math.round(r.height)} w ${Math.round(p.width)}×${Math.round(p.height)})`);
  }
  for (const el of document.querySelectorAll('.overlay:not([hidden]) .mapa-ramka, .overlay:not([hidden]) .sheet')) { const r = el.getBoundingClientRect(); if (r.right > vw + 2 || r.left < -2 || r.bottom > vh + 2 || r.top < -2) out.push(`okno ${el.className.split(' ')[0]} wychodzi poza ekran`); }
  for (const el of ekran.querySelectorAll('button, .panel, .topbar, .bottombar, .hero-card, .die, .intent, .o-plak, .o-med, .o-herb, .o-sheet, .stat, .coin, .o-chip, .troop-pick')) {
    if (!widoczny(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 2 || r.left < -2) out.push(`${el.className || el.tagName} wychodzi poza ekran w poziomie (${Math.round(r.left)}–${Math.round(r.right)} przy ${vw})`);
  }
  // kostki run: rozsądny rozmiar
  for (const d of ekran.querySelectorAll('.die')) {
    const r = d.getBoundingClientRect();
    if (r.width > 120 || r.height > 120) out.push(`kostka runy ma ${Math.round(r.width)}×${Math.round(r.height)} px`);
  }
  // plansza bitwy: musi mieć miejsce
  const b = ekran.querySelector('#board');
  if (b && widoczny(b)) { const r = b.getBoundingClientRect(); if (r.height < Math.min(220, vh * 0.35) || r.width < 220) out.push(`plansza za mała: ${Math.round(r.width)}×${Math.round(r.height)}`); }
  // karty bohaterów: imię i życie widoczne, nieucięte przez rodzica
  for (const c of ekran.querySelectorAll('.hero-card')) {
    const r = c.getBoundingClientRect(), p = c.parentElement.getBoundingClientRect();
    if (r.bottom > p.bottom + 2 && getComputedStyle(c.parentElement).overflowY !== 'auto') out.push('karta bohatera ucięta');
  }
  // teksty nie wychodzą poza swoje karty i panele
  for (const t of ekran.querySelectorAll('.hero-name, .hp-num, .pick-name, .o-plak-in b, .intent-text, .btn')) {
    if (!widoczny(t)) continue;
    const box = t.closest('.hero-card, .pick, .o-plak, .intent, .panel, .sheet') ;
    if (!box || box === t) continue;
    const r = t.getBoundingClientRect(), p = box.getBoundingClientRect();
    if (r.right > p.right + 1 || r.left < p.left - 1) out.push(`tekst „${(t.textContent || '').trim().slice(0, 20)}” wychodzi poza ${box.className.split(' ')[0]}`);
  }
  // przyciski akcji bitwy muszą być widoczne na ekranie (bez przewijania w poziomie)
  for (const id of ['btn-end', 'btn-undo', 'btn-reroll']) {
    const el = document.getElementById(id);
    if (el && ekran.contains(el) && widoczny(el)) { const r = el.getBoundingClientRect(); if (r.width < 40 || r.height < 28) out.push(`#${id} za mały`); }
  }
  return out;
})()"""

async def czekaj(pg):
    for _ in range(150):
        if not await pg.evaluate('window.midgard && window.midgard.busy && window.midgard.busy()'): return
        await pg.wait_for_timeout(100)

async def scenariusz(przegl, nazwa_p, tag, W, H):
    mobile = W < 1000
    ctx = await przegl.new_context(viewport={'width': W, 'height': H}, device_scale_factor=2, has_touch=mobile, is_mobile=mobile and nazwa_p == 'chrome')
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    async def zrzut(ekran):
        p = f'{OUT}/{nazwa_p}-{tag}-{ekran}.png'
        await pg.screenshot(path=p)
        for b in await pg.evaluate(SPRAWDZ): bledy.append(f'[{nazwa_p} {tag} {ekran}] {b}')
    await pg.goto(URL); await pg.wait_for_timeout(1200)
    await zrzut('logowanie')
    await pg.fill('#f-log [name=nick]', 'Lewy'); await pg.fill('#f-log [name=haslo]', 'tajne123')
    await pg.click('#f-log button[type=submit]'); await pg.wait_for_timeout(1500)
    await zrzut('start')
    await pg.click('#btn-osada'); await pg.wait_for_timeout(2500)
    await zrzut('osada')
    await pg.click('#o-mapa-btn'); await pg.wait_for_timeout(700)
    await zrzut('mapa')
    await pg.click('#mapa-zamknij'); await pg.wait_for_timeout(300)
    await pg.click('#o-bohaterowie'); await pg.wait_for_timeout(600)
    await zrzut('osada-bohaterowie')
    await pg.evaluate("(() => { const o = window.midgard.osada; o._wybierzBudynek(o.o.budynki.find((b) => b.typ === 'hala_wojow').id); })()"); await pg.wait_for_timeout(600)
    await zrzut('osada-hala')
    await pg.click('#o-sheet-zamknij'); await pg.wait_for_timeout(300)
    await pg.click('#o-wyprawa'); await pg.wait_for_timeout(700)
    if await pg.is_visible('#ov-confirm'): await pg.click('#confirm-yes'); await pg.wait_for_timeout(700)
    for _ in range(3):
        if await pg.is_enabled('#team-troops [data-plus] >> nth=0'): await pg.click('#team-troops [data-plus] >> nth=0'); await pg.wait_for_timeout(150)
    await zrzut('druzyna')
    await pg.click('#btn-team-go'); await pg.wait_for_timeout(1500)
    await zrzut('wstep')
    await pg.click('#btn-intro-go'); await pg.wait_for_timeout(1500); await czekaj(pg); await pg.wait_for_timeout(800)
    await zrzut('bitwa')
    await pg.click('#dice .die >> nth=0'); await pg.wait_for_timeout(400)
    await zrzut('bitwa-runa')
    await pg.click('#btn-menu'); await pg.wait_for_timeout(400)
    await zrzut('menu')
    await pg.click('#m-rules'); await pg.wait_for_timeout(400)
    await zrzut('zasady')
    for e in errs: bledy.append(f'[{nazwa_p} {tag}] BŁĄD JS: {e}')
    await ctx.close()

async def main():
    os.makedirs(OUT, exist_ok=True)
    import subprocess
    subprocess.run(['node', '--no-warnings', 'narzedzia/osada-testowa.mjs'], check=True, env={**os.environ, 'MIDGARD_DANE': os.environ.get('MIDGARD_DANE', '/tmp/mdane')})
    async with async_playwright() as p:
        przegladarki = [('safari', await p.webkit.launch()), ('chrome', await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox']))]
        for nazwa_p, b in przegladarki:
            for tag, W, H in ROZMIARY:
                try: await scenariusz(b, nazwa_p, tag, W, H)
                except Exception as e: bledy.append(f'[{nazwa_p} {tag}] scenariusz przerwany: {str(e)[:200]}')
            await b.close()
    print('\n'.join(bledy) if bledy else 'WSZYSTKIE EKRANY OK')
    sys.exit(1 if bledy else 0)

asyncio.run(main())
