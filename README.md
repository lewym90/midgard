# Midgard

Kooperacyjna cyfrowa planszówka w świecie nordyckich mitów. Aplikacja PWA: działa offline, uruchamiana z ekranu startowego, na telefonie, tablecie, laptopie i telewizorze.

**Zagraj:** https://lewym90.github.io/midgard/

## Stan (wersja 0.2.0)
- Pierwsza bitwa: *Kurhan nad fiordem*. Drużyna 3 z 8 bohaterów, trzy poziomy trudności (Wędrowiec, Wojownik, Ragnarök).
- Nici Norn (wrogowie pokazują zamiary), kości runiczne, narada z cofaniem ruchów, mur tarcz, mróz, Hamingja.
- Zapis po każdym ruchu (pamięć urządzenia).
- Dźwięk: mikser gotowy, pliki dojdą w `assets/audio/` (lista dostępnych plików w `assets/audio/lista.json`).

## Struktura
- `index.html`, `css/style.css` to wygląd.
- `js/engine.js` zawiera zasady (czysta logika), `js/data.js` dane bohaterów, wrogów i scenariusza.
- `js/board.js` rysuje planszę, `js/ui.js` panele, `js/main.js` steruje grą.
- `assets/zrodla/` to oryginalne grafiki. `narzedzia/tnij.py` tnie je na pliki gry w `assets/img/`.
- `narzedzia/symulacja.mjs` to automatyczny test zasad i trudności (`node narzedzia/symulacja.mjs 300`).

Biblia projektu: zobacz dokument „MIDGARD — biblia projektu”.
