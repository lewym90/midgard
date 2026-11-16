# Midgard

Kooperacyjna cyfrowa planszówka w świecie nordyckich mitów. Aplikacja PWA: działa offline, uruchamiana z ekranu startowego, na telefonie, tablecie, laptopie i telewizorze.

**Zagraj:** https://lewym90.github.io/midgard/

## Stan (wersja 0.5.0)
- Pierwsza bitwa: *Kurhan nad fiordem*. Drużyna 3 z 8 bohaterów, trzy poziomy trudności (Wędrowiec, Wojownik, Ragnarök).
- Nici Norn (wrogowie pokazują zamiary), kości runiczne, narada z cofaniem ruchów, mur tarcz, mróz, Hamingja.
- Zapis po każdym ruchu (pamięć urządzenia).
- Muzyka: hymn w menu, muzyka bitwy w 3 poziomach napięcia (przenikanie wg sytuacji na planszy). Pliki w `assets/audio/`, lista dostępnych w `assets/audio/lista.json`, oryginały w `assets/zrodla/audio/`.

## Osada (0.5.0)
- Zasady w `serwer/osada-dane.js` — jeden plik dla serwera (źródło prawdy) i gry (podgląd liczników). Test: `node narzedzia/test-osada.mjs`.
- Ekran: `js/osada.js`. Grafiki: `assets/zrodla/osada-*.png` → `narzedzia/osada_tnij.py` → `assets/img/osada/`.

## Konta i serwer
- Każdy gracz ma konto (imię + hasło) działające na wszystkich jego urządzeniach. Nowe konto wymaga wspólnego hasła do gry (ustawia je administrator w panelu Konto). Pierwsze konto na serwerze zostaje kontem administratora.
- Serwer: `serwer/midgard.mjs` (Node 24, bez bibliotek, SQLite). Instalacja/aktualizacja na serwerze (jako root):
  `curl -fsSL https://raw.githubusercontent.com/lewym90/midgard/main/serwer/install.sh | bash`
- Adres API: https://188-68-247-201.sslip.io/midgard-api

## Struktura
- `index.html`, `css/style.css` to wygląd.
- `js/engine.js` zawiera zasady (czysta logika), `js/data.js` dane bohaterów, wrogów i scenariusza.
- `js/board.js` rysuje planszę, `js/ui.js` panele, `js/main.js` steruje grą.
- `assets/zrodla/` to oryginalne grafiki. `narzedzia/tnij.py` tnie je na pliki gry w `assets/img/`.
- `narzedzia/symulacja.mjs` to automatyczny test zasad i trudności (`node narzedzia/symulacja.mjs 300`).

Biblia projektu: zobacz dokument „MIDGARD — biblia projektu”.
