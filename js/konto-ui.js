// Ekran logowania i panel konta (urządzenia, hasło, hasło do gry, gracze).
import { konto } from './konto.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function toast(msg, ms = 3200) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

function kiedy(ts) {
  if (!ts) return '—';
  const d = new Date(ts), now = new Date();
  const g = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `dziś ${g}`;
  const wczoraj = new Date(now); wczoraj.setDate(now.getDate() - 1);
  if (d.toDateString() === wczoraj.toDateString()) return `wczoraj ${g}`;
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' }) + ` ${g}`;
}

// ---------- logowanie ----------
export function initLogin(poZalogowaniu) {
  const err = $('login-err');
  for (const b of document.querySelectorAll('#screen-login .tab')) {
    b.onclick = () => {
      for (const x of document.querySelectorAll('#screen-login .tab')) x.classList.toggle('on', x === b);
      $('f-log').hidden = b.dataset.tab !== 'log';
      $('f-rej').hidden = b.dataset.tab !== 'rej';
      err.textContent = '';
    };
  }
  const zajety = (f, on) => { for (const el of f.elements) el.disabled = on; };
  const pokazBlad = (e) => {
    err.textContent = e.message;
    $('btn-guest').hidden = e.kod !== 0;
  };
  $('f-log').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    err.textContent = ''; zajety(f, true);
    try { await konto.zaloguj(f.nick.value.trim(), f.haslo.value); f.reset(); poZalogowaniu(); }
    catch (e) { pokazBlad(e); }
    finally { zajety(f, false); }
  };
  $('f-rej').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    err.textContent = '';
    if (f.haslo.value !== f.haslo2.value) { err.textContent = 'Hasła nie są takie same.'; return; }
    zajety(f, true);
    try {
      await konto.zarejestruj(f.hg.value.trim(), f.nick.value.trim(), f.haslo.value);
      f.reset(); poZalogowaniu(true);
    } catch (e) { pokazBlad(e); }
    finally { zajety(f, false); }
  };
  $('btn-guest').onclick = () => { konto.grajJakoGosc(); poZalogowaniu(); };
}

// ---------- panel konta ----------
export async function otworzKonto(poWylogowaniu) {
  const body = $('konto-body');
  $('ov-konto').hidden = false;
  $('btn-konto-close').onclick = () => { $('ov-konto').hidden = true; };
  if (!konto.zalogowany) {
    body.innerHTML = `<p class="sheet-sub" style="margin:0">Grasz bez konta. Gra zapisuje się tylko na tym urządzeniu.</p>
      <div class="sheet-actions"><button class="btn btn-gold" id="k-do-logowania">Zaloguj się albo załóż konto</button></div>`;
    $('k-do-logowania').onclick = () => { $('ov-konto').hidden = true; poWylogowaniu(); };
    return;
  }
  body.innerHTML = '<p class="sheet-sub">Wczytuję…</p>';
  let ja;
  try { ja = await konto.ja(); }
  catch (e) { body.innerHTML = `<p class="sheet-sub">${esc(e.message)}</p>`; return; }
  const g = ja.gracz;
  body.innerHTML = `
    <p class="sheet-sub" style="margin:0">Grasz jako <b style="color:var(--gold-hi)">${esc(g.nick)}</b>${g.admin ? '<span class="badge">administrator</span>' : ''}</p>
    <div class="k-sec">
      <h3>Twoje urządzenia</h3>
      <p>Na każdym z nich jesteś zalogowany na to samo konto. Jeśli zgubisz telefon, wyloguj go tutaj.</p>
      <div id="k-urz">${ja.urzadzenia.map((u) => `
        <div class="k-row"><div><b>${esc(u.nazwa)}</b>${u.to ? '<span class="badge">to urządzenie</span>' : ''}<div class="meta">ostatnio: ${kiedy(u.ostatnio)}</div></div>
        ${u.to ? '' : `<button class="btn btn-small" data-urz="${u.id}">Wyloguj</button>`}</div>`).join('')}</div>
    </div>
    <div class="k-sec">
      <h3>Zmiana hasła</h3>
      <div class="k-inline">
        <input class="field" id="k-h1" type="password" placeholder="Obecne hasło" autocomplete="current-password">
        <input class="field" id="k-h2" type="password" placeholder="Nowe hasło" autocomplete="new-password">
        <button class="btn btn-small" id="k-haslo">Zmień</button>
      </div>
      <p class="meta" id="k-haslo-msg"></p>
    </div>
    ${g.admin ? `
    <div class="k-sec">
      <h3>Hasło do gry</h3>
      <p>Podaj je znajomym razem z linkiem. Wpisują je tylko raz, przy zakładaniu konta. Jeśli je zmienisz, założone konta działają dalej.</p>
      <div class="k-code" id="k-hg">…</div>
      <div class="k-inline">
        <input class="field" id="k-hg-nowe" placeholder="Nowe hasło do gry" maxlength="60" autocapitalize="none" spellcheck="false">
        <button class="btn btn-small" id="k-hg-zmien">Zmień</button>
      </div>
      <div class="k-inline" style="justify-content:center;margin-top:.6rem">
        <button class="btn btn-small btn-gold" id="k-kopiuj">Kopiuj zaproszenie</button>${navigator.share ? '<button class="btn btn-small btn-gold" id="k-wyslij">Wyślij zaproszenie…</button>' : ''}
      </div>
    </div>
    <div class="k-sec">
      <h3>Gracze</h3>
      <p>Jeśli ktoś zapomni hasła, nadaj mu nowe. Przekaż mu je, a on zmieni je potem u siebie.</p>
      <div id="k-gracze"></div>
    </div>` : ''}
    <div class="sheet-actions"><button class="btn" id="k-wyloguj">Wyloguj się z tego urządzenia</button></div>`;

  body.querySelectorAll('[data-urz]').forEach((b) => {
    b.onclick = async () => { b.disabled = true; try { await konto.usunUrzadzenie(b.dataset.urz); otworzKonto(poWylogowaniu); } catch (e) { toast(e.message); b.disabled = false; } };
  });
  $('k-haslo').onclick = async () => {
    const m = $('k-haslo-msg');
    try { await konto.zmienHaslo($('k-h1').value, $('k-h2').value); m.textContent = 'Hasło zmienione. Inne urządzenia zostały wylogowane.'; $('k-h1').value = $('k-h2').value = ''; }
    catch (e) { m.textContent = e.message; }
  };
  $('k-wyloguj').onclick = async () => { await konto.wyloguj(); $('ov-konto').hidden = true; poWylogowaniu(); };

  if (g.admin) {
    const linkGry = location.origin + location.pathname;
    let hg = '';
    const tekst = () => `Zapraszam Cię do Midgardu!\n1. Otwórz ${linkGry}\n2. Wybierz „Nowe konto”.\n3. Hasło do gry: ${hg}\n4. Wymyśl swoje imię w grze i swoje hasło.\nPotem na każdym urządzeniu logujesz się już tylko swoim imieniem i hasłem.`;
    const pokazHg = (h) => { hg = h; $('k-hg').textContent = h; };
    konto.adminHasloGry().then((r) => pokazHg(r.haslo)).catch((e) => toast(e.message));
    $('k-hg-zmien').onclick = async () => {
      try { const r = await konto.adminUstawHasloGry($('k-hg-nowe').value); pokazHg(r.haslo); $('k-hg-nowe').value = ''; toast('Hasło do gry zmienione.'); }
      catch (e) { toast(e.message); }
    };
    $('k-kopiuj').onclick = async () => { try { await navigator.clipboard.writeText(tekst()); toast('Skopiowano zaproszenie z linkiem i hasłem do gry.'); } catch (e) { toast('Nie udało się skopiować.'); } };
    if (navigator.share) $('k-wyslij').onclick = () => navigator.share({ title: 'Midgard', text: tekst() }).catch(() => {});
    const listy = async () => {
      try {
        const gr = await konto.adminGracze();
        $('k-gracze').innerHTML = gr.gracze.map((x) => `
          <div class="k-row"><div><b>${esc(x.nick)}</b>${x.admin ? '<span class="badge">administrator</span>' : ''}
            <div class="meta">ostatnio: ${kiedy(x.ostatnio)} · urządzeń: ${x.urzadzenia}</div></div>
            ${x.admin ? '' : `<button class="btn btn-small" data-reset="${esc(x.nick)}">Nowe hasło</button>`}</div>`).join('');
        $('k-gracze').querySelectorAll('[data-reset]').forEach((b) => {
          b.onclick = async () => {
            try { const r = await konto.adminResetHasla(b.dataset.reset); b.outerHTML = `<span class="k-code" style="font-size:1rem;margin:0;padding:.3rem .6rem">${esc(r.haslo)}</span>`; }
            catch (e) { toast(e.message); }
          };
        });
      } catch (e) { $('k-gracze').innerHTML = `<p>${esc(e.message)}</p>`; }
    };
    listy();
  }
}
