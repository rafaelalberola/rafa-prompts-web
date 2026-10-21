/**
 * rafa.prompts API — Stripe Checkout + watermarked PDF delivery
 *
 * Routes:
 *   POST /checkout            → create embedded checkout session
 *   POST /webhook             → stripe webhook (checkout.session.completed)
 *   POST /calendly            → calendly webhook (invitee.created): diagnóstico pagado → compra en Meta
 *   GET  /session?token=...   → metadata for the /descargas page
 *   GET  /download?token=...&file=... → stream watermarked PDF
 *   GET  /pdfs                → list of files (catalog used by /descargas)
 *
 * Storage: Cloudflare KV namespace `STORE`
 *   - file:<slug>     → ArrayBuffer (PDF master)
 *   - token:<token>   → JSON { email, name, downloads_left, created_at }
 *   - session:<csid>  → token (lookup by stripe checkout session id)
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import ORDEN_CURSO from '../../course/modulos.json';
import { checkoutParams } from './checkout.js';

// El orden y los títulos de los módulos salen de course/modulos.json (fuente única del curso)
const PDF_CATALOG = [
  { slug: '00-empezar-aqui', title: 'Empezar aquí', order: 0 },
  ...ORDEN_CURSO.modulos.map((m, i) => {
    const n = String(i + 1).padStart(2, '0');
    return { slug: `modulo-${n}-${m.slug}`, title: `Módulo ${n} · ${m.titulo_pdf}`, order: i + 1 };
  }),
  { slug: 'prompt-library-100', title: 'Biblioteca · 100 prompts', order: ORDEN_CURSO.modulos.length + 1 },
];

const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });

const cors = (origin, allowed) => {
  const o = (origin === allowed || origin === 'https://www.rafaprompts.com') ? origin : allowed;
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Stripe-Signature',
    'Vary': 'Origin',
  };
};

const newToken = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
};

// ---------- Stripe helpers (raw fetch, no SDK to keep bundle small) ----------

async function stripeRequest(env, path, body, method = 'POST') {
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      // versión de la API fijada cuando se configura (cuenta de Rafa Prompts)
      ...(env.STRIPE_API_VERSION ? { 'Stripe-Version': env.STRIPE_API_VERSION } : {}),
    },
  };
  if (body) opts.body = stripeEncode(body);
  const r = await fetch(`https://api.stripe.com/v1/${path}`, opts);
  return r.json();
}

function stripeEncode(obj, prefix = '') {
  const params = new URLSearchParams();
  const walk = (data, key) => {
    if (data === null || data === undefined) return;
    if (Array.isArray(data)) {
      data.forEach((v, i) => walk(v, `${key}[${i}]`));
    } else if (typeof data === 'object') {
      Object.entries(data).forEach(([k, v]) => walk(v, key ? `${key}[${k}]` : k));
    } else {
      params.append(key, String(data));
    }
  };
  Object.entries(obj).forEach(([k, v]) => walk(v, prefix ? `${prefix}[${k}]` : k));
  return params.toString();
}

async function verifyStripeSignature(payload, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')));
  const ts = parts.t, sig = parts.v1;
  if (!ts || !sig) return false;
  if (Math.floor(Date.now() / 1000) - parseInt(ts, 10) > 300) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}.${payload}`));
  const expected = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
  if (expected.length !== sig.length) return false;
  let m = 0;
  for (let i = 0; i < expected.length; i++) m |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return m === 0;
}

// ---------- Meta Conversions API ----------

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashedUserData({ email, name, fbp, fbc, ip, userAgent }) {
  const ud = {};
  if (email) ud.em = [await sha256Hex(email.trim().toLowerCase())];
  if (name) {
    const parts = name.trim().toLowerCase().split(/\s+/);
    if (parts[0]) ud.fn = [await sha256Hex(parts[0])];
    if (parts.length > 1) ud.ln = [await sha256Hex(parts.slice(1).join(' '))];
  }
  if (fbp) ud.fbp = fbp;
  if (fbc) ud.fbc = fbc;
  if (ip) ud.client_ip_address = ip;
  if (userAgent) ud.client_user_agent = userAgent;
  return ud;
}

async function metaCapiPurchase(env, { eventId, eventTime, value, currency, email, name, fbp, fbc, ip, userAgent, sourceUrl, contentName = 'El método Claude', contentIds = ['metodo-claude'] }) {
  if (!env.META_PIXEL_ID || !env.META_CAPI_TOKEN) {
    console.warn('CAPI skipped: META_PIXEL_ID or META_CAPI_TOKEN missing');
    return { skipped: true };
  }
  const body = {
    data: [{
      event_name: 'Purchase',
      event_time: Math.floor(eventTime || Date.now() / 1000),
      event_id: eventId,
      action_source: 'website',
      event_source_url: sourceUrl || 'https://rafaprompts.com/gracias.html',
      user_data: await hashedUserData({ email, name, fbp, fbc, ip, userAgent }),
      custom_data: {
        currency: currency || 'EUR',
        value: Number(value),
        content_name: contentName,
        content_ids: contentIds,
        content_type: 'product',
      },
    }],
  };
  if (env.META_TEST_EVENT_CODE) body.test_event_code = env.META_TEST_EVENT_CODE;
  const r = await fetch(
    `https://graph.facebook.com/v21.0/${env.META_PIXEL_ID}/events?access_token=${env.META_CAPI_TOKEN}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  const out = await r.json();
  if (!r.ok || out.error) {
    console.error('CAPI Purchase error:', JSON.stringify(out));
    return { ok: false, error: out };
  }
  return { ok: true, response: out };
}

// ---------- Email (Brevo) ----------

async function sendDeliveryEmail(env, { to, name, token }) {
  const downloadUrl = `${env.DOWNLOAD_PAGE}?t=${token}`;
  const greeting = name ? `Hola ${name.split(' ')[0]}` : 'Hola';
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family: -apple-system, system-ui, sans-serif; background:#F2EFE7; color:#111; padding:40px 20px;">
  <div style="max-width:560px; margin:0 auto; background:#fff; padding:40px 36px; border-radius:20px;">
    <div style="font-family: 'IBM Plex Mono', monospace; font-size:11px; letter-spacing:0.18em; text-transform:uppercase; color:#DA7756; font-weight:700; margin-bottom:16px;">El método Claude</div>
    <h1 style="font-size:28px; font-weight:900; line-height:1.1; margin:0 0 16px; letter-spacing:-0.02em;">${greeting}, gracias por tu compra</h1>
    <p style="font-size:16px; line-height:1.6; color:#333; margin:0 0 20px;">Tu acceso al curso ya está listo. Puedes descargar los ${PDF_CATALOG.length} PDFs (los ${ORDEN_CURSO.modulos.length} módulos, la guía "empezar aquí" y la biblioteca de 100 prompts) desde tu página personal:</p>
    <p style="margin:28px 0;">
      <a href="${downloadUrl}" style="display:inline-block; background:#DA7756; color:#fff; padding:16px 28px; border-radius:999px; text-decoration:none; font-weight:700; font-size:15px;">Acceder a las descargas</a>
    </p>
    <p style="font-size:14px; line-height:1.6; color:#5a5a5a; margin:24px 0 0;">Cada PDF lleva tu nombre y email impresos. Son tuyos para siempre, con actualizaciones gratuitas. Si tienes cualquier duda, responde a este email.</p>
    <hr style="border:0; border-top:1px solid rgba(0,0,0,0.08); margin:32px 0;">
    <p style="font-size:13px; color:#8a8a8a; margin:0;">Si el botón no funciona, copia este enlace en tu navegador:<br><span style="word-break:break-all; color:#DA7756;">${downloadUrl}</span></p>
  </div>
  <p style="text-align:center; font-size:12px; color:#8a8a8a; margin-top:24px;">rafa.prompts · hola@rafaprompts.com</p>
</body></html>`;

  // Parse "Display Name <email>" format from EMAIL_FROM env var
  const m = (env.EMAIL_FROM || '').match(/^(.*?)\s*<([^>]+)>\s*$/);
  const senderName = m ? m[1].trim() : 'rafa.prompts';
  const senderEmail = m ? m[2].trim() : env.EMAIL_REPLY_TO;

  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      'accept': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: to, name: name || undefined }],
      replyTo: { email: env.EMAIL_REPLY_TO, name: senderName },
      subject: 'Tus PDFs de El método Claude están listos',
      htmlContent: html,
    }),
  });
  return r.json();
}

// ---------- PDF watermarking ----------

async function watermarkPdf(masterBytes, { email, name, purchasedAt }) {
  const pdf = await PDFDocument.load(masterBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  const stampLine1 = `Licencia para ${name || email}`;
  const stampLine2 = `Comprado el ${purchasedAt} · email: ${email}`;
  for (const page of pages) {
    const { width } = page.getSize();
    page.drawText(stampLine1, {
      x: 14,
      y: 10,
      size: 6.5,
      font,
      color: rgb(0.55, 0.55, 0.55),
    });
    page.drawText(stampLine2, {
      x: width - 14 - font.widthOfTextAtSize(stampLine2, 6.5),
      y: 10,
      size: 6.5,
      font,
      color: rgb(0.55, 0.55, 0.55),
    });
  }
  return await pdf.save();
}

// ---------- Route handlers ----------

async function handleCheckout(req, env) {
  let body = {};
  try { body = await req.json(); } catch (_) { /* empty body is fine */ }
  const ip = req.headers.get('cf-connecting-ip') || '';
  const userAgent = req.headers.get('user-agent') || '';
  const metadata = {
    fbp: (body.fbp || '').slice(0, 200),
    fbc: (body.fbc || '').slice(0, 200),
    page_url: (body.page_url || '').slice(0, 500),
    ip,
    user_agent: userAgent.slice(0, 400),
  };
  const { params, plan } = checkoutParams(env, body, metadata);
  const session = await stripeRequest(env, 'checkout/sessions', params);
  if (session.error) {
    console.error('Stripe error:', session.error);
    return json({ error: session.error.message || 'stripe_error' }, 500);
  }
  return json({
    client_secret: session.client_secret,
    session_id: session.id,
    ui_mode: params.ui_mode,
    plan,
    publishable_key: env.STRIPE_PUBLISHABLE_KEY || null,
  });
}

// Diagnóstico de 50 € reservado y pagado en Calendly. Calendly no permite configurar por API la
// redirección tras reservar, así que la compra llega por webhook (invitee.created) y se manda a Meta
// desde el servidor. La firma usa el mismo formato que la de Stripe (t=…,v1=… con HMAC SHA-256).
async function handleCalendly(req, env) {
  const payload = await req.text();
  const ok = await verifyStripeSignature(payload, req.headers.get('calendly-webhook-signature'), env.CALENDLY_SIGNING_KEY);
  if (!ok) return new Response('invalid signature', { status: 400 });
  const ev = JSON.parse(payload);
  if (ev.event !== 'invitee.created') return new Response('ignored', { status: 200 });
  const inv = ev.payload || {};
  const pago = inv.payment || {};
  if (!pago.successful) return new Response('ignored: unpaid', { status: 200 });
  const id = String(inv.uri || '').split('/').pop();
  if (!id) return new Response('no invitee', { status: 400 });
  const clave = `calendly:${id}`;
  if (await env.STORE.get(clave)) return new Response('already processed', { status: 200 });
  await env.STORE.put(clave, '1', { expirationTtl: 400 * 24 * 60 * 60 });
  await metaCapiPurchase(env, {
    eventId: `diag_${id}`, eventTime: Date.parse(inv.created_at) / 1000 || undefined,
    value: Number(pago.amount) || 50, currency: String(pago.currency || 'EUR').toUpperCase(),
    email: inv.email, name: inv.name, sourceUrl: 'https://calendly.com/rafaprompts/30min',
    contentName: 'Diagnóstico de implantación', contentIds: ['diagnostico-implantacion'],
  }).catch(e => console.error('CAPI error:', e));
  return new Response('ok', { status: 200 });
}

async function handleWebhook(req, env) {
  const payload = await req.text();
  const sig = req.headers.get('stripe-signature');
  const ok = await verifyStripeSignature(payload, sig, env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return new Response('invalid signature', { status: 400 });

  const event = JSON.parse(payload);
  if (event.type !== 'checkout.session.completed') {
    return new Response('ignored', { status: 200 });
  }

  const cs = event.data.object;
  const csid = cs.id;
  // Idempotency
  const existing = await env.STORE.get(`session:${csid}`);
  if (existing) return new Response('already processed', { status: 200 });

  const email = (cs.customer_details && cs.customer_details.email) || cs.customer_email;
  const name = (cs.customer_details && cs.customer_details.name) || '';
  if (!email) return new Response('no email', { status: 400 });

  // Qué se ha comprado. La cuenta de Stripe es compartida con UGC Pack, así que el curso
  // solo se entrega en compras de rafa.prompts: el pago integrado de la web (lleva page_url)
  // o el enlace del plan Negocio (plan=negocio). El diagnóstico (plan=diagnostico) no lleva curso.
  const md = cs.metadata || {};
  const plan = String(md.plan || '').toLowerCase();
  const ttl = parseInt(env.TOKEN_TTL_DAYS, 10) * 24 * 60 * 60;
  const capi = () => metaCapiPurchase(env, {
    eventId: csid, eventTime: cs.created || Math.floor(Date.now() / 1000),
    value: (cs.amount_total || 0) / 100, currency: (cs.currency || 'eur').toUpperCase(),
    email, name, fbp: md.fbp || '', fbc: md.fbc || '', ip: md.ip || '', userAgent: md.user_agent || '',
    sourceUrl: md.page_url || 'https://rafaprompts.com/gracias.html',
  }).catch(e => console.error('CAPI error:', e));

  if (plan === 'diagnostico') {
    await env.STORE.put(`session:${csid}`, 'diagnostico', { expirationTtl: ttl });
    await Promise.all([
      sendDiagnosticoEmail(env, { to: email, name }),
      sendSaleNotification(env, { plan, email, name, amount: cs.amount_total }),
    ]).catch(e => console.error('email error:', e));
    await capi();
    return new Response('ok', { status: 200 });
  }
  const isCourse = plan === 'esencial' || plan === 'negocio' || (!plan && String(md.page_url || '').includes('rafaprompts.com'));
  if (!isCourse) return new Response('ignored: not a rafa.prompts course purchase', { status: 200 });

  const token = newToken();
  const ttlSeconds = ttl;
  const record = {
    email,
    name,
    downloads_left: parseInt(env.DOWNLOADS_PER_TOKEN, 10),
    created_at: new Date().toISOString(),
    purchased_at: new Date(cs.created * 1000).toISOString().slice(0, 10),
    session_id: csid,
  };
  await env.STORE.put(`token:${token}`, JSON.stringify(record), { expirationTtl: ttlSeconds });
  await env.STORE.put(`session:${csid}`, token, { expirationTtl: ttlSeconds });

  // Send email (Brevo)
  await sendDeliveryEmail(env, { to: email, name, token }).catch(e => {
    console.error('email error:', e);
  });
  // Plan Negocio: aviso a Rafa para enviar los 12 proyectos (se entregan a mano en menos de 24 h)
  if (plan === 'negocio') await sendSaleNotification(env, { plan, email, name, amount: cs.amount_total }).catch(e => console.error('email error:', e));

  // Meta Conversions API: Purchase event (event_id = stripe session id, dedups with browser pixel)
  await capi();

  return new Response('ok', { status: 200 });
}

// Backfill / manual: re-fire CAPI Purchase for an existing Stripe session.
// POST /capi-backfill { session_id, admin_token }
async function handleCapiBackfill(req, env) {
  if (!env.ADMIN_TOKEN) return json({ error: 'no_admin_token_configured' }, 500);
  const body = await req.json().catch(() => ({}));
  if (body.admin_token !== env.ADMIN_TOKEN) return json({ error: 'forbidden' }, 403);
  const sessionId = body.session_id;
  if (!sessionId) return json({ error: 'missing_session_id' }, 400);

  const cs = await stripeRequest(env, `checkout/sessions/${sessionId}`, null, 'GET');
  if (cs.error) return json({ error: 'stripe_error', detail: cs.error }, 502);
  const email = (cs.customer_details && cs.customer_details.email) || cs.customer_email || '';
  const name = (cs.customer_details && cs.customer_details.name) || '';
  const md = cs.metadata || {};
  const value = (cs.amount_total || 0) / 100;
  const currency = (cs.currency || 'eur').toUpperCase();
  const result = await metaCapiPurchase(env, {
    eventId: cs.id,
    eventTime: cs.created || Math.floor(Date.now() / 1000),
    value,
    currency,
    email,
    name,
    fbp: md.fbp || '',
    fbc: md.fbc || '',
    ip: md.ip || '',
    userAgent: md.user_agent || '',
    sourceUrl: md.page_url || 'https://rafaprompts.com/gracias.html',
  });
  return json({ session_id: cs.id, value, currency, email, capi: result });
}

// Admin: list recent paid checkout sessions (for backfill discovery)
async function handleAdminSessions(req, env) {
  const url = new URL(req.url);
  if (url.searchParams.get('admin_token') !== env.ADMIN_TOKEN) return json({ error: 'forbidden' }, 403);
  const limit = url.searchParams.get('limit') || '10';
  const cs = await stripeRequest(env, `checkout/sessions?limit=${encodeURIComponent(limit)}`, null, 'GET');
  if (cs.error) return json({ error: 'stripe_error', detail: cs.error }, 502);
  const out = (cs.data || []).map(s => ({
    id: s.id,
    payment_status: s.payment_status,
    status: s.status,
    amount_total: s.amount_total,
    currency: s.currency,
    created: s.created,
    created_iso: new Date(s.created * 1000).toISOString(),
    email: (s.customer_details && s.customer_details.email) || s.customer_email,
    name: (s.customer_details && s.customer_details.name) || '',
    metadata: s.metadata || {},
  }));
  return json({ sessions: out });
}

async function handleSession(req, env) {
  const url = new URL(req.url);
  const token = url.searchParams.get('t') || url.searchParams.get('token');
  if (!token) return json({ error: 'missing_token' }, 400);
  const raw = await env.STORE.get(`token:${token}`);
  if (!raw) return json({ error: 'invalid_or_expired' }, 404);
  const data = JSON.parse(raw);
  return json({
    email: data.email,
    name: data.name,
    downloads_left: data.downloads_left,
    purchased_at: data.purchased_at,
    files: PDF_CATALOG,
  });
}

async function handleDownload(req, env) {
  const url = new URL(req.url);
  const token = url.searchParams.get('t') || url.searchParams.get('token');
  const slug = url.searchParams.get('file');
  if (!token || !slug) return json({ error: 'missing_params' }, 400);
  if (!PDF_CATALOG.find(p => p.slug === slug)) return json({ error: 'unknown_file' }, 404);

  const raw = await env.STORE.get(`token:${token}`);
  if (!raw) return json({ error: 'invalid_or_expired' }, 404);
  const data = JSON.parse(raw);
  if (data.downloads_left <= 0) return json({ error: 'no_downloads_left' }, 429);

  const masterBytes = await env.STORE.get(`file:${slug}`, { type: 'arrayBuffer' });
  if (!masterBytes) return json({ error: 'file_not_in_store' }, 500);

  const stamped = await watermarkPdf(new Uint8Array(masterBytes), {
    email: data.email,
    name: data.name,
    purchasedAt: data.purchased_at,
  });

  // decrement and persist
  data.downloads_left -= 1;
  data.last_download_at = new Date().toISOString();
  await env.STORE.put(`token:${token}`, JSON.stringify(data));

  return new Response(stamped, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${slug}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}

// ---------- Lead magnet subscriptions (Brevo) ----------

const SUBSCRIBE_SOURCES = new Set([
  'yate', 'madrugon', 'anzuelo', 'brujula',
  'portero', 'tienda', 'hooks', 'voz', 'mensaje',
  'conectar', 'vender', 'dms', 'agentes', 'automatizar',
  'metricas', 'borrar',
  'reel-hiperrealista', 'agente-creador-reels',
  'index', 'metodo', 'other',
]);

const SOURCE_META = {
  yate: { name: 'reel hiperrealista con Claude', url: 'https://rafaprompts.com/reel-hiperrealista-con-claude.html' },
  madrugon: { name: 'agente que produce reels mientras duermes', url: 'https://rafaprompts.com/agente-creador-reels-claude.html' },
  anzuelo: { name: 'hooks que paran el scroll', url: 'https://rafaprompts.com/anzuelo.html' },
  brujula: { name: 'brújula editorial', url: 'https://rafaprompts.com/brujula.html' },
  'reel-hiperrealista': { name: 'reel hiperrealista con Claude', url: 'https://rafaprompts.com/reel-hiperrealista-con-claude.html' },
  'agente-creador-reels': { name: 'agente que produce reels', url: 'https://rafaprompts.com/agente-creador-reels-claude.html' },
};

const isValidEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 200;

async function brevoGetContact(env, email) {
  const r = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
    headers: { 'api-key': env.BREVO_API_KEY, accept: 'application/json' },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`brevo getContact ${r.status}`);
  return r.json();
}

async function brevoUpsertContact(env, { email, source }) {
  const listId = parseInt(env.BREVO_LEADS_LIST_ID || '3', 10);
  const r = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      email,
      attributes: {
        SOURCE: source,
        SIGNUP_DATE: new Date().toISOString().slice(0, 10),
      },
      listIds: [listId],
      updateEnabled: true,
    }),
  });
  const body = await r.text();
  return { ok: r.ok || r.status === 204, status: r.status, body };
}

function senderFromEnv(env) {
  const m = (env.EMAIL_FROM || '').match(/^(.*?)\s*<([^>]+)>\s*$/);
  return {
    name: m ? m[1].trim() : 'rafa.prompts',
    email: m ? m[2].trim() : (env.EMAIL_REPLY_TO || 'hola@rafaprompts.com'),
  };
}

async function brevoSendEmail(env, { to, subject, html, replyTo }) {
  const sender = senderFromEnv(env);
  return fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      replyTo: replyTo || { email: env.EMAIL_REPLY_TO || sender.email, name: sender.name },
      subject,
      htmlContent: html,
    }),
  }).then(r => r.json()).catch(e => ({ error: e.message }));
}

async function sendDiagnosticoEmail(env, { to, name }) {
  const greeting = name ? `Hola, ${name.split(' ')[0]}` : 'Hola';
  const html = `<!doctype html><html><body style="font-family: -apple-system, system-ui, sans-serif; background:#F2EFE7; color:#111; padding:40px 20px;">
  <div style="max-width:560px; margin:0 auto; background:#fff; padding:40px 36px; border-radius:20px;">
    <div style="font-family: 'IBM Plex Mono', monospace; font-size:11px; letter-spacing:0.18em; text-transform:uppercase; color:#DA7756; font-weight:700; margin-bottom:16px;">Diagnóstico de implantación</div>
    <h1 style="font-size:26px; font-weight:900; line-height:1.15; margin:0 0 16px; letter-spacing:-0.02em;">${greeting}, tu diagnóstico está reservado</h1>
    <p style="font-size:16px; line-height:1.6; color:#333; margin:0 0 16px;">Te escribo en menos de 24 horas desde este correo para fijar el día de la llamada. Son 45 minutos.</p>
    <p style="font-size:16px; line-height:1.6; color:#333; margin:0 0 16px;">Para aprovecharla, piensa antes en las tareas que más horas te quitan cada semana. Después de la llamada te mando por escrito las tres más importantes y cuánto costaría automatizarlas.</p>
    <p style="font-size:16px; line-height:1.6; color:#333; margin:0;">Si contratas la implantación, estos 50 € se descuentan del precio.</p>
    <hr style="border:0; border-top:1px solid rgba(0,0,0,0.08); margin:32px 0;">
    <p style="font-size:13px; color:#8a8a8a; margin:0;">Si necesitas algo antes, responde a este correo.</p>
  </div>
  <p style="text-align:center; font-size:12px; color:#8a8a8a; margin-top:24px;">Rafa · rafaprompts.com</p>
</body></html>`;
  return brevoSendEmail(env, { to, subject: 'Tu diagnóstico está reservado', html });
}

// Aviso a Rafa de las ventas que piden trabajo a mano (Negocio y diagnóstico)
async function sendSaleNotification(env, { plan, email, name, amount }) {
  if (!env.ADMIN_EMAIL) return { skipped: true };
  const todo = plan === 'negocio'
    ? 'Envíale el PDF de los 12 proyectos en menos de 24 horas.'
    : 'Escríbele en menos de 24 horas para fijar la llamada de diagnóstico.';
  const html = `<!doctype html><html><body style="font-family: -apple-system, system-ui, sans-serif; background:#F2EFE7; color:#111; padding:24px;">
  <div style="max-width:520px; margin:0 auto; background:#fff; padding:28px; border-radius:14px;">
    <div style="font-family: 'IBM Plex Mono', monospace; font-size:11px; letter-spacing:0.18em; text-transform:uppercase; color:#DA7756; font-weight:700; margin-bottom:8px;">Venta · ${plan}</div>
    <h1 style="font-size:20px; font-weight:900; line-height:1.2; margin:0 0 14px;">${name || email}</h1>
    <p style="font-size:15px; line-height:1.6; color:#333; margin:0 0 8px;"><strong>${todo}</strong></p>
    <p style="font-size:14px; line-height:1.6; color:#555; margin:0;">Email: ${email}<br>Importe: ${((amount || 0) / 100).toFixed(2)} €<br>Cuándo: ${new Date().toISOString()}</p>
  </div>
</body></html>`;
  return brevoSendEmail(env, { to: env.ADMIN_EMAIL, subject: `Venta ${plan} · ${email}`, html });
}

async function sendWelcomeEmail(env, { to, source }) {
  // La newsletter de la home no pide una guía concreta: confirma el alta y enlaza las tres guías abiertas.
  if (source === 'index') {
    const html = `<!doctype html><html><body style="font-family: -apple-system, system-ui, sans-serif; background:#F2EFE7; color:#111; padding:40px 20px;">
  <div style="max-width:560px; margin:0 auto; background:#fff; padding:40px 36px; border-radius:20px;">
    <h1 style="font-size:26px; font-weight:900; line-height:1.15; margin:0 0 16px; letter-spacing:-0.02em;">Hecho: te aviso con la siguiente guía</h1>
    <p style="font-size:16px; line-height:1.6; color:#333; margin:0 0 20px;">Publico una al mes. Mientras tanto, estas tres están abiertas:</p>
    <p style="font-size:16px; line-height:1.9; margin:0 0 20px;">
      <a href="https://rafaprompts.com/reel-hiperrealista-con-claude.html" style="color:#B55A3E; font-weight:700;">Cómo producir un reel hiperrealista con Claude</a><br>
      <a href="https://rafaprompts.com/agente-creador-reels-claude.html" style="color:#B55A3E; font-weight:700;">Cómo montar un sistema que produce reels mientras duermes</a><br>
      <a href="https://rafaprompts.com/hooks.html" style="color:#B55A3E; font-weight:700;">8 fórmulas para escribir hooks que paren el scroll</a>
    </p>
    <hr style="border:0; border-top:1px solid rgba(0,0,0,0.08); margin:32px 0;">
    <p style="font-size:13px; color:#8a8a8a; margin:0;">Si alguna vez quieres dejar de recibir estos emails, responde con "baja" y te saco de la lista.</p>
  </div>
  <p style="text-align:center; font-size:12px; color:#8a8a8a; margin-top:24px;">Rafa · rafaprompts.com</p>
</body></html>`;
    return brevoSendEmail(env, { to, subject: 'Te aviso con la siguiente guía', html });
  }
  const meta = SOURCE_META[source];
  const guideName = meta?.name || 'la guía que pediste';
  const guideUrl = meta?.url || 'https://rafaprompts.com';
  const html = `<!doctype html><html><body style="font-family: -apple-system, system-ui, sans-serif; background:#F2EFE7; color:#111; padding:40px 20px;">
  <div style="max-width:560px; margin:0 auto; background:#fff; padding:40px 36px; border-radius:20px;">
    <div style="font-family: 'IBM Plex Mono', monospace; font-size:11px; letter-spacing:0.18em; text-transform:uppercase; color:#DA7756; font-weight:700; margin-bottom:16px;">rafa.prompts</div>
    <h1 style="font-size:26px; font-weight:900; line-height:1.15; margin:0 0 16px; letter-spacing:-0.02em;">Aquí está la guía</h1>
    <p style="font-size:16px; line-height:1.6; color:#333; margin:0 0 20px;">Te apuntaste para recibir la guía de <strong>${guideName}</strong>. La tienes completa en este enlace, abierta, sin más pasos:</p>
    <p style="margin:28px 0;">
      <a href="${guideUrl}" style="display:inline-block; background:#DA7756; color:#fff; padding:16px 28px; border-radius:999px; text-decoration:none; font-weight:700; font-size:15px;">Abrir la guía</a>
    </p>
    <p style="font-size:14px; line-height:1.6; color:#5a5a5a; margin:24px 0 0;">Cuando publique la siguiente, te aviso por aquí. Si tienes dudas mientras la lees, responde a este email — lo leo yo.</p>
    <hr style="border:0; border-top:1px solid rgba(0,0,0,0.08); margin:32px 0;">
    <p style="font-size:13px; color:#8a8a8a; margin:0;">Si alguna vez quieres dejar de recibir estos emails, responde con "baja" y te saco de la lista.</p>
  </div>
  <p style="text-align:center; font-size:12px; color:#8a8a8a; margin-top:24px;">— Rafa · rafaprompts.com</p>
</body></html>`;
  return brevoSendEmail(env, { to, subject: `Tu guía de ${guideName}`, html });
}

async function sendNewSubscriberNotification(env, { email, source, ip, userAgent }) {
  if (!env.ADMIN_EMAIL) return { skipped: true };
  const meta = SOURCE_META[source];
  const guideName = meta?.name || source;
  const html = `<!doctype html><html><body style="font-family: -apple-system, system-ui, sans-serif; background:#F2EFE7; color:#111; padding:24px;">
  <div style="max-width:520px; margin:0 auto; background:#fff; padding:28px; border-radius:14px;">
    <div style="font-family: 'IBM Plex Mono', monospace; font-size:11px; letter-spacing:0.18em; text-transform:uppercase; color:#DA7756; font-weight:700; margin-bottom:8px;">Nuevo suscriptor</div>
    <h1 style="font-size:20px; font-weight:900; line-height:1.2; margin:0 0 14px;">${email}</h1>
    <table style="width:100%; font-size:14px; line-height:1.6; color:#333; border-collapse:collapse;">
      <tr><td style="padding:6px 0; color:#8a8a8a; width:120px;">Source:</td><td><strong>${source}</strong> · ${guideName}</td></tr>
      <tr><td style="padding:6px 0; color:#8a8a8a;">Cuándo:</td><td>${new Date().toISOString()}</td></tr>
      <tr><td style="padding:6px 0; color:#8a8a8a;">IP:</td><td>${ip || '—'}</td></tr>
      <tr><td style="padding:6px 0; color:#8a8a8a;">User agent:</td><td style="word-break:break-all;">${(userAgent || '').slice(0, 200)}</td></tr>
    </table>
  </div>
</body></html>`;
  return brevoSendEmail(env, {
    to: env.ADMIN_EMAIL,
    subject: `Nuevo suscriptor · ${email} · ${source}`,
    html,
  });
}

async function handleSubscribe(req, env) {
  let body = {};
  try { body = await req.json(); } catch (_) { /* */ }
  const email = ((body.email || '') + '').trim().toLowerCase();
  const source = ((body.source || '') + '').trim().toLowerCase();
  const consent = body.consent === true || body.consent === 'true';
  const hp = ((body.hp || '') + '').trim();

  // honeypot
  if (hp) return json({ ok: true });

  if (!isValidEmail(email)) return json({ error: 'invalid_email' }, 400);
  if (!SUBSCRIBE_SOURCES.has(source)) return json({ error: 'invalid_source' }, 400);
  if (!consent) return json({ error: 'consent_required' }, 400);

  // ¿es nuevo? (afecta si mandamos notif al admin)
  let existed = false;
  try {
    const existing = await brevoGetContact(env, email);
    existed = existing != null;
  } catch (e) {
    console.warn('brevoGetContact failed:', e.message);
  }

  const up = await brevoUpsertContact(env, { email, source });
  if (!up.ok) {
    console.error('brevo upsert failed:', up.status, up.body);
    return json({ error: 'brevo_failed' }, 502);
  }

  const ip = req.headers.get('cf-connecting-ip') || '';
  const userAgent = req.headers.get('user-agent') || '';

  // welcome siempre; notif solo si es nuevo
  const tasks = [sendWelcomeEmail(env, { to: email, source })];
  if (!existed) tasks.push(sendNewSubscriberNotification(env, { email, source, ip, userAgent }));
  await Promise.allSettled(tasks);

  return json({ ok: true, existed });
}

// ---------- Main entry ----------

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const headers = cors(req.headers.get('origin'), env.ALLOWED_ORIGIN);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    let res;
    try {
      switch (`${req.method} ${url.pathname}`) {
        case 'POST /checkout':
          res = await handleCheckout(req, env);
          break;
        case 'POST /subscribe':
          res = await handleSubscribe(req, env);
          break;
        case 'POST /webhook':
          res = await handleWebhook(req, env);
          break;
        case 'POST /calendly':
          res = await handleCalendly(req, env);
          break;
        case 'POST /capi-backfill':
          res = await handleCapiBackfill(req, env);
          break;
        case 'GET /admin/sessions':
          res = await handleAdminSessions(req, env);
          break;
        case 'GET /session':
          res = await handleSession(req, env);
          break;
        case 'GET /download':
          res = await handleDownload(req, env);
          break;
        case 'GET /pdfs':
          res = json({ files: PDF_CATALOG });
          break;
        case 'GET /':
          res = json({ status: 'ok', service: 'rafa-prompts-api' });
          break;
        default:
          res = json({ error: 'not_found' }, 404);
      }
    } catch (e) {
      console.error('handler error:', e.stack || e.message || e);
      res = json({ error: 'internal_error', message: e.message }, 500);
    }

    Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  },
};
