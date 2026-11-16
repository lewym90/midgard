# Testy przed każdą publikacją (obowiązkowe)

1. `node narzedzia/symulacja.mjs 56` — zasady bitwy (brak błędów spójności); na końcu wyprawy z oddziałami i rozwiniętymi bohaterami.
   Zwykłe bitwy muszą dawać te same wyniki co wcześniej (Wędrowiec ~94–97%, Wojownik ~47–67%, Ragnarök ~29–53%).
2. `node narzedzia/test-osada.mjs` — zasady osady, armii i bohaterów (wszystko „ok”, żadnego „BŁĄD”).
3. Ekrany w Safari (WebKit) i Chrome, telefon pion/poziom, tablet, laptop:
   - serwer API lokalnie: `cd serwer && PORT=18900 MIDGARD_DANE=/tmp/mdane node midgard.mjs` (konto Lewy / tajne123)
   - gra lokalnie: `python3 -m http.server 8765`
   - `python3 narzedzia/test-ekranow.py` → musi wypisać „WSZYSTKIE EKRANY OK”; zrzuty w /tmp/ekrany obejrzeć.
     Test sam ustawia osadę testową (`narzedzia/osada-testowa.mjs`): Hala Wojów 5, wojsko, Völva w Valhalli. Sprawdza też panel bohaterów, Halę Wojów i bitwę z oddziałami.

Safari na iPhonie liczy niektóre rzeczy inaczej niż Chrome (np. SVG bez stałego rozmiaru = 300 px). Każdy znak SVG w CSS musi mieć stałą szerokość i wysokość.
