/* Muro de las guías gratis: la guía se lee dejando el email.
   Se desbloquea si llegas desde la home tras el alta (?acceso=1) o si ya te diste de alta en este navegador.
   Uso: <script src="/js/guia-gate.js" data-source="hooks" data-title="Título de la guía"></script> al final del body. */
(function () {
  var KEY = 'rp_guia_ok';
  var URL_SUB = 'https://rafa-prompts-api.prxystudio.workers.dev/subscribe';
  var yo = document.currentScript;
  var fuente = (yo && yo.dataset.source) || 'other';
  var titulo = (yo && yo.dataset.title) || document.title;
  var abierta = false;
  try { abierta = localStorage.getItem(KEY) === '1'; } catch (e) {}
  if (new URLSearchParams(location.search).get('acceso') === '1') {
    abierta = true;
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
  }
  if (abierta) return;

  var css = ''
    + '.rpg-velo{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;'
    + 'background:rgba(242,239,231,.72);-webkit-backdrop-filter:blur(10px) saturate(140%);backdrop-filter:blur(10px) saturate(140%);}'
    + '.rpg-card{width:min(460px,100%);display:flex;flex-direction:column;gap:12px;padding:28px 24px 24px;border-radius:20px;background:#fff;'
    + 'border:1px solid rgba(20,19,17,.10);box-shadow:0 24px 60px rgba(20,19,17,.18);font-family:Archivo,system-ui,-apple-system,sans-serif;color:#141311;text-align:left;}'
    + '.rpg-k{margin:0;font:700 12px/1.3 "IBM Plex Mono",Menlo,monospace;letter-spacing:.16em;text-transform:uppercase;color:#A9502F;}'
    + '.rpg-t{margin:0;font:800 24px/1.15 Archivo,system-ui,sans-serif;letter-spacing:-.015em;}'
    + '.rpg-p{margin:0 0 4px;font-size:16px;line-height:1.5;color:#45423D;}'
    + '.rpg-f{display:flex;flex-direction:column;gap:12px;margin:0;}'
    + '.rpg-f input[type=email]{height:52px;padding:0 16px;border:1px solid rgba(20,19,17,.18);border-radius:14px;background:#fff;color:#141311;font:500 16px/1 Archivo,system-ui,sans-serif;}'
    + '.rpg-f input[type=email]:focus-visible{outline:2px solid #DA7756;outline-offset:2px;}'
    + '.rpg-c{display:flex;align-items:flex-start;gap:10px;font-size:14px;line-height:1.4;color:#6B675F;}'
    + '.rpg-c input{margin:2px 0 0;accent-color:#DA7756;}'
    + '.rpg-b{height:54px;border:0;border-radius:999px;background:#DA7756;color:#fff;font:800 16px/1 Archivo,system-ui,sans-serif;cursor:pointer;}'
    + '.rpg-b:focus-visible{outline:2px solid #141311;outline-offset:3px;}.rpg-b[disabled]{opacity:.6;cursor:default;}'
    + '.rpg-s{margin:0;min-height:1.3em;font-size:14px;color:#6B675F;}.rpg-s.err{color:#B4321F;}'
    + '.rpg-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0;}'
    + '.rpg-volver{font-size:14px;color:#6B675F;text-decoration:underline;text-underline-offset:3px;}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var velo = document.createElement('div');
  velo.className = 'rpg-velo';
  velo.setAttribute('role', 'dialog'); velo.setAttribute('aria-modal', 'true'); velo.setAttribute('aria-labelledby', 'rpg-t');
  velo.innerHTML = '<div class="rpg-card">'
    + '<p class="rpg-k">Guía gratis</p><h2 class="rpg-t" id="rpg-t"></h2>'
    + '<p class="rpg-p">Déjame tu email y la guía se abre al momento. Te escribiré una vez al mes, cuando salga la siguiente.</p>'
    + '<form class="rpg-f" novalidate>'
    + '<input type="email" name="email" placeholder="Tu email" autocomplete="email" aria-label="Tu email" required>'
    + '<input type="text" name="hp" class="rpg-hp" tabindex="-1" autocomplete="off" aria-hidden="true">'
    + '<label class="rpg-c"><input type="checkbox" name="consent" required> Acepto recibir emails. Baja respondiendo «baja».</label>'
    + '<button class="rpg-b" type="submit">Leer la guía gratis</button>'
    + '<p class="rpg-s" aria-live="polite"></p>'
    + '</form><a class="rpg-volver" href="https://rafaprompts.com/">Volver a rafaprompts.com</a></div>';
  velo.querySelector('.rpg-t').textContent = titulo;
  document.body.appendChild(velo);
  var prev = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';

  var form = velo.querySelector('form'), status = velo.querySelector('.rpg-s'), btn = velo.querySelector('.rpg-b');
  function say(msg, err) { status.textContent = msg; status.className = 'rpg-s' + (err ? ' err' : ''); }
  setTimeout(function () { try { form.email.focus({ preventScroll: true }); } catch (e) {} }, 80);
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var value = (form.email.value || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return say('Revisa el email, no parece válido.', true);
    if (!form.consent.checked) return say('Marca la casilla para que pueda escribirte.', true);
    btn.disabled = true; say('Abriendo la guía…');
    fetch(URL_SUB, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: value, source: fuente, consent: true, hp: form.hp.value || '' }) })
      .then(function (r) { if (!r.ok) throw new Error('server ' + r.status); })
      .then(function () {
        try { localStorage.setItem(KEY, '1'); } catch (e) {}
        if (window.fbq) fbq('track', 'Lead', { content_name: titulo });
        velo.remove(); document.documentElement.style.overflow = prev;
      })
      .catch(function () { btn.disabled = false; say('No se pudo enviar. Prueba en un minuto.', true); });
  });
})();
