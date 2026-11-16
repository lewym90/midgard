#!/usr/bin/env bash
# Instaluje (albo aktualizuje) serwer gry Midgard obok istniejących aplikacji.
# Dodaje tylko: /opt/midgard (własny Node + kod), /var/lib/midgard (baza i kopie), /etc/midgard.env,
# użytkownika systemowego midgard, usługę midgard i własną trasę w /etc/caddy/conf.d.
# Niczego innego nie zmienia. Przy błędzie trasy Caddy wycofuje ją.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_SUSPEND=1
main() {
[ "$(id -u)" -eq 0 ] || { echo "Uruchom jako root."; exit 1; }
command -v caddy >/dev/null || { echo "STOP: ten skrypt wymaga działającego Caddy."; exit 2; }
CF=/etc/caddy/Caddyfile
grep -q 'conf.d' "$CF" || { echo "STOP: Caddyfile nie wczytuje conf.d. Nic nie zmieniam."; exit 2; }
IP=$(curl -4fsS https://api.ipify.org)
HOST="${IP//./-}.sslip.io"
PORT=18900
if ss -ltnpH "( sport = :$PORT )" | grep -q . && ! systemctl is-active --quiet midgard; then
  echo "STOP: port $PORT jest zajęty przez inną aplikację. Nic nie zmieniam."; exit 2
fi

DIR=/opt/midgard
mkdir -p "$DIR" /var/lib/midgard

# --- własny Node (nie dotyka systemowego ani innych aplikacji) ---
case "$(uname -m)" in x86_64) ARCH=x64 ;; aarch64|arm64) ARCH=arm64 ;; *) echo "STOP: nieznany procesor $(uname -m)"; exit 2 ;; esac
NODE="$DIR/node/bin/node"
if [ ! -x "$NODE" ] || [ "$("$NODE" -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  echo "Pobieram Node.js 24 (tylko dla Midgardu)..."
  TMPN=$(mktemp -d)
  curl -fsSL https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$TMPN/SUMS"
  FILE=$(grep -o "node-v[0-9.]*-linux-$ARCH.tar.xz" "$TMPN/SUMS" | head -1)
  curl -fsSL "https://nodejs.org/dist/latest-v24.x/$FILE" -o "$TMPN/$FILE"
  (cd "$TMPN" && grep " $FILE\$" SUMS | sha256sum -c - >/dev/null) || { echo "STOP: suma kontrolna Node się nie zgadza."; exit 2; }
  rm -rf "$DIR/node"; mkdir -p "$DIR/node"
  tar -xJf "$TMPN/$FILE" -C "$DIR/node" --strip-components=1
  rm -rf "$TMPN"
fi
echo "Node: $("$NODE" -v)"

# --- kod serwera z GitHuba ---
echo "Pobieram najnowszą wersję z GitHuba..."
TMP=$(mktemp -d)
curl -fsSL https://codeload.github.com/lewym90/midgard/tar.gz/main | tar -xz -C "$TMP"
rm -rf "$DIR/app"; mkdir -p "$DIR/app"
cp -r "$TMP"/midgard-main/serwer/. "$DIR/app/"
rm -rf "$TMP"

# --- konto systemowe i dane ---
id midgard >/dev/null 2>&1 || useradd --system --no-create-home --home-dir /var/lib/midgard --shell /usr/sbin/nologin midgard
chown -R midgard:midgard /var/lib/midgard; chmod 750 /var/lib/midgard
[ -f /etc/midgard.env ] || ( umask 077; printf 'PORT=%s\nMIDGARD_DANE=/var/lib/midgard\n' "$PORT" > /etc/midgard.env )

cat > /etc/systemd/system/midgard.service <<EOF
[Unit]
Description=Midgard serwer gry
After=network-online.target
[Service]
User=midgard
Group=midgard
EnvironmentFile=/etc/midgard.env
WorkingDirectory=$DIR/app
ExecStart=$NODE --no-warnings $DIR/app/midgard.mjs
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/midgard
ProtectHome=true
PrivateTmp=true
MemoryMax=400M
[Install]
WantedBy=multi-user.target
EOF

# --- trasa w Caddy: tylko własny plik w conf.d ---
MC=/etc/caddy/conf.d/midgard.caddy
printf 'handle_path /midgard-api/* {\n\treverse_proxy 127.0.0.1:%s\n}\n' "$PORT" > "$MC"
chown --reference="$CF" "$MC"; chmod 644 "$MC"
if ! caddy validate --config "$CF" --adapter caddyfile >/dev/null 2>&1; then rm -f "$MC"; echo "STOP: Caddy nie przyjął trasy. Wycofałem ją, nic się nie zmieniło."; exit 2; fi

systemctl daemon-reload
systemctl enable midgard >/dev/null 2>&1
systemctl restart midgard
if ! systemctl reload caddy; then
  rm -f "$MC"; systemctl reload caddy 2>/dev/null || true
  echo "STOP: Caddy nie przeładował konfiguracji. Wycofałem trasę Midgardu, Twoje aplikacje działają jak wcześniej."
  journalctl -u caddy -n 3 --no-pager | cut -c1-200; exit 2
fi

sleep 3
echo
if curl -fsS --max-time 20 "https://$HOST/midgard-api/zdrowie" -o /tmp/midgard-zdrowie.json; then
  echo "Status: OK  $(cat /tmp/midgard-zdrowie.json)"
  echo "Adres serwera gry: https://$HOST/midgard-api"
  if [ -f /var/lib/midgard/haslo-gry.txt ]; then
    echo
    echo "=============================================="
    echo "  HASŁO DO GRY: $(cat /var/lib/midgard/haslo-gry.txt)"
    if grep -q '"gracze":0' /tmp/midgard-zdrowie.json; then
      echo "  Załóż konto jako PIERWSZY: pierwsze konto"
      echo "  zostaje kontem administratora."
    fi
    echo "  Hasło zmienisz w grze: Konto, Hasło do gry."
    echo "=============================================="
  fi
else
  echo "Status: BŁĄD, https://$HOST/midgard-api/zdrowie nie odpowiada."
  journalctl -u midgard -n 15 --no-pager
fi
echo; echo "Twoje pozostałe aplikacje:"
for u in "https://$HOST/smart-home-push/health" "https://planer.$HOST/" "https://dom.$HOST/" "https://$HOST/nav-tts/" "https://$HOST/trendo-api/zdrowie"; do
  echo "  $(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$u")  $u"
done
echo; echo "MIDGARD GOTOWE"
}
main </dev/null
