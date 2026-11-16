# Testy przed każdą publikacją (obowiązkowe)

1. `node narzedzia/symulacja.mjs 56` — zasady bitwy (brak błędów spójności).
2. `node narzedzia/test-osada.mjs` — zasady osady (wszystko „ok”).
3. Ekrany w Safari (WebKit) i Chrome, telefon pion/poziom, tablet, laptop:
   - serwer API lokalnie: `cd serwer && PORT=18900 MIDGARD_DANE=/tmp/mdane node midgard.mjs` (konto Lewy / tajne123)
   - gra lokalnie: `python3 -m http.server 8765`
   - `python3 narzedzia/test-ekranow.py` → musi wypisać „WSZYSTKIE EKRANY OK”; zrzuty w /tmp/ekrany obejrzeć.

Safari na iPhonie liczy niektóre rzeczy inaczej niż Chrome (np. SVG bez stałego rozmiaru = 300 px). Każdy znak SVG w CSS musi mieć stałą szerokość i wysokość.
