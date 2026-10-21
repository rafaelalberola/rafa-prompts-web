/* Consentimiento de cookies (LSSI art. 22.2 y guía de la AEPD).
   El píxel de Meta no se descarga hasta que la persona acepta. Mientras tanto, los eventos de la página
   se quedan en la cola de fbq y se envían si acepta. Aceptar y rechazar están al mismo nivel.
   La elección se guarda 12 meses y se puede cambiar desde el enlace «Cookies» del pie. */
(function () {
  var KEY = 'rp_cookies', DOCE_MESES = 365 * 24 * 3600 * 1000;
  var PIXEL = window.rpPixel || 'https://connect.facebook.net/en_US/fbevents.js';
  function leer() { try { var d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && Date.now() - d.t < DOCE_MESES) return d.v; } catch (e) {} return null; }
  function guardar(v) { try { localStorage.setItem(KEY, JSON.stringify({ v: v, t: Date.now() })); } catch (e) {} }
  var cargado = false;
  function cargarPixel() {
    if (cargado || !window.fbq) return; cargado = true;
    var s = document.createElement('script'); s.async = true; s.src = PIXEL; document.head.appendChild(s);
  }

  var css = ''
    + '.rpc{position:fixed;left:16px;right:16px;bottom:16px;z-index:9998;display:flex;justify-content:center;pointer-events:none;}'
    + '.rpc-card{pointer-events:auto;width:min(720px,100%);display:flex;flex-wrap:wrap;align-items:center;gap:12px 20px;padding:18px 20px;'
    + 'border-radius:20px;background:#fff;border:1px solid rgba(20,19,17,.12);box-shadow:0 18px 44px rgba(20,19,17,.18);'
    + 'font:400 14.5px/1.5 Archivo,system-ui,-apple-system,sans-serif;color:#45423D;}'
    + '.rpc-txt{flex:1 1 260px;margin:0;}.rpc-txt a{color:#141311;text-decoration:underline;text-underline-offset:2px;}'
    + '.rpc-btns{display:flex;gap:8px;flex:0 0 auto;}'
    + '.rpc-b{min-width:112px;height:44px;padding:0 18px;border-radius:999px;border:1.5px solid #141311;background:#141311;color:#fff;'
    + 'font:700 14.5px/1 Archivo,system-ui,sans-serif;cursor:pointer;}'
    + '.rpc-b:focus-visible{outline:2px solid #DA7756;outline-offset:3px;}'
    + '@media (max-width:520px){.rpc-btns{flex:1 1 100%;}.rpc-b{flex:1 1 0;}}';

  function mostrar() {
    if (document.querySelector('.rpc')) return;
    if (!document.getElementById('rpc-css')) { var st = document.createElement('style'); st.id = 'rpc-css'; st.textContent = css; document.head.appendChild(st); }
    var el = document.createElement('div'); el.className = 'rpc';
    el.innerHTML = '<div class="rpc-card" role="dialog" aria-live="polite" aria-label="Cookies">'
      + '<p class="rpc-txt">Usamos cookies de Meta para medir anuncios. <a href="/privacidad.html#cookies">Más información</a></p>'
      + '<div class="rpc-btns"><button type="button" class="rpc-b" data-v="no">Rechazar</button><button type="button" class="rpc-b" data-v="si">Aceptar</button></div></div>';
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-v]'); if (!b) return;
      guardar(b.dataset.v); el.remove();
      if (b.dataset.v === 'si') cargarPixel();
    });
    document.body.appendChild(el);
  }

  // enlace «Cookies» en el pie para cambiar la elección en cualquier momento
  function enlacePie() {
    var pie = document.querySelector('.footer-legal') || document.querySelector('footer.foot') || document.querySelector('footer');
    if (!pie || pie.querySelector('.rpc-link')) return;
    var a = document.createElement('a'); a.href = '#cookies'; a.className = 'rpc-link'; a.textContent = 'Cookies';
    a.addEventListener('click', function (e) { e.preventDefault(); mostrar(); });
    pie.appendChild(a);
  }

  function iniciar() {
    enlacePie();
    var v = leer();
    if (v === 'si') cargarPixel(); else if (v !== 'no') mostrar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
  window.rpCookies = { abrir: mostrar };
})();
