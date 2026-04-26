// ========================================================================
// rafa.prompts / landing JS
// Meta Pixel (PageView) · scroll progress · signup form · copy-code · TOC
// ========================================================================

// ======== Meta Pixel (base code + PageView on every page) ========
(function(f,b,e,v,n,t,s){
  if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)
})(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '952321057516846');
fbq('track', 'PageView');

// ======== Scroll progress bar ========
(function() {
  const bar = document.getElementById('progress');
  if (!bar) return;
  const update = () => {
    const scrolled = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const pct = max > 0 ? (scrolled / max) * 100 : 0;
    bar.style.width = pct + '%';
  };
  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
})();

// ======== Signup forms ========
const SUBSCRIBE_URL = 'REPLACE_WITH_WORKER_URL'; // set after Worker deploy

document.querySelectorAll('.signup-form').forEach((form) => {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = form.querySelector('input[name=email]');
    const btn = form.querySelector('button[type=submit]');
    const status = form.parentElement.querySelector('.signup-status')
                   || form.nextElementSibling;
    const email = (emailInput.value || '').trim();

    if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      if (status) { status.textContent = 'email no válido'; status.className = 'signup-status err'; }
      return;
    }

    btn.disabled = true;
    btn.dataset.original = btn.textContent;
    btn.textContent = 'enviando…';
    if (status) { status.textContent = ''; status.className = 'signup-status'; }

    try {
      const res = await fetch(SUBSCRIBE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: window.location.pathname }),
      });
      if (!res.ok) throw new Error('server ' + res.status);
      emailInput.value = '';
      if (status) {
        status.textContent = '¡hecho! te escribo pronto.';
        status.className = 'signup-status ok';
      }
    } catch (err) {
      if (status) {
        status.textContent = 'no pudo mandarse. intenta otra vez en un minuto.';
        status.className = 'signup-status err';
      }
    } finally {
      btn.disabled = false;
      btn.textContent = btn.dataset.original || 'suscríbete';
    }
  });
});

// ======== Copy-code buttons (resource pages) ========
document.querySelectorAll('.code-block').forEach((block) => {
  const pre = block.querySelector('pre');
  if (!pre) return;
  const btn = document.createElement('button');
  btn.className = 'copy';
  btn.type = 'button';
  btn.textContent = 'copiar';
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pre.textContent);
      btn.textContent = 'copiado';
      btn.classList.add('ok');
      setTimeout(() => {
        btn.textContent = 'copiar';
        btn.classList.remove('ok');
      }, 1500);
    } catch {
      btn.textContent = 'error';
    }
  });
  block.appendChild(btn);
});

// ======== Sticky TOC highlight (resource pages) ========
(function() {
  const toc = document.querySelector('.toc');
  if (!toc) return;
  const links = Array.from(toc.querySelectorAll('a[href^="#"]'));
  const targets = links.map((a) => {
    const id = a.getAttribute('href').slice(1);
    return { link: a, el: document.getElementById(id) };
  }).filter((x) => x.el);
  if (!targets.length) return;

  const onScroll = () => {
    const y = window.scrollY + 120;
    let active = null;
    for (const t of targets) {
      if (t.el.offsetTop <= y) active = t;
    }
    links.forEach((l) => l.classList.remove('active'));
    if (active) active.link.classList.add('active');
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
})();
