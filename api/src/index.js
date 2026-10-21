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
 *   POST /evento              → copia en servidor (API de conversiones) de PageView, ViewContent e InitiateCheckout
 *   GET  /oferta              → precio de lanzamiento vigente y su fecha de fin
 *   GET  /acceso?session_id=  → enlace de descarga para la página de gracias (sin esperar al email)
 *   POST /acceso-completo     → abre la parte 2 del curso (termina la garantía de 14 días)
 *   POST /admin/pruebas | GET /admin/brevo | POST /admin/capi | POST /admin/tareas → operaciones con OPS_TOKEN
 *   cron cada 5 min           → bienvenida del día después y recordatorios de la llamada (24 h y 1 h)
 *
 * Storage: Cloudflare KV namespace `STORE`
 *   - file:<slug>     → ArrayBuffer (PDF master)
 *   - token:<token>   → JSON { email, name, downloads_left, created_at }
 *   - session:<csid>  → token (lookup by stripe checkout session id)
 *   - prog:bienv:<token> / prog:cita:<id> → emails programados
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import ORDEN_CURSO from '../../course/modulos.json';
import { checkoutParams, lanzamiento, IMPORTE } from './checkout.js';
import * as correo from './emails.js';

// El orden y los títulos de los módulos salen de course/modulos.json (fuente única del curso)
// parte 1: «Empezar aquí» y el módulo 01, que se quedan aunque pida la devolución.
// parte 2: el resto, que se abre cuando decide quedarse el curso (y entonces termina la garantía).
const PDF_CATALOG = [
  { slug: '00-empezar-aqui', title: 'Empezar aquí', order: 0, parte: 1 },
  ...ORDEN_CURSO.modulos.map((m, i) => {
    const n = String(i + 1).padStart(2, '0');
    return { slug: `modulo-${n}-${m.slug}`, title: `Módulo ${n} · ${m.titulo_pdf}`, order: i + 1, parte: i === 0 ? 1 : 2 };
  }),
  { slug: 'prompt-library-100', title: 'Biblioteca · 100 prompts', order: ORDEN_CURSO.modulos.length + 1, parte: 2 },
];

// ---------- Garantía de 14 días ----------
// Hasta las 23:59:59 (Madrid) del día 14 después de la compra, mientras no abra el curso completo.
// Las compras anteriores a este sistema (sin garantia_hasta) tienen el curso completo abierto.
const GARANTIA_DIAS = 14;
function finDiaMadrid(ms, dias) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  const objetivo = Date.UTC(+partes.year, +partes.month - 1, +partes.day + dias, 23, 59, 59);
  // desfase de Madrid ese día (CET +1 / CEST +2)
  const enMadrid = new Date(new Date(objetivo).toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  const enUtc = new Date(new Date(objetivo).toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(objetivo - (enMadrid - enUtc));
}
const fechaLarga = d => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long' }).formatToParts(d).map(x => [x.type, x.value]));
  return `${p.weekday} ${p.day} de ${p.month}`;
};
// KV guarda en caché cada lectura hasta 60 s: justo después de abrir el curso completo la descarga aún vería el registro
// anterior. Por eso /acceso-completo da un pase firmado (HMAC del token) que /download acepta mientras tanto.
async function pase(env, token) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.OPS_TOKEN || env.STRIPE_WEBHOOK_SECRET_RP || 'rp'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${token}:curso-completo`));
  return [...new Uint8Array(mac)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}

// estado de la compra: ¿tiene el curso completo? ¿sigue abierta la garantía?
function estadoGarantia(rec, ahora = Date.now()) {
  if (!rec.garantia_hasta) return { completo: true, garantia: false, hasta: null };
  const hasta = Date.parse(rec.garantia_hasta);
  const abierta = !rec.acceso_completo_at && ahora <= hasta;
  return { completo: !abierta, garantia: abierta, hasta: rec.garantia_hasta, hastaTxt: `${fechaLarga(new Date(hasta))} a las 23:59`, abiertoEl: rec.acceso_completo_at || null };
}

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

// Envía uno o varios eventos a la API de conversiones. Cada evento lleva el mismo event_id que el
// del píxel del navegador, así Meta los junta y no cuenta nada dos veces.
async function metaCapiEnviar(env, data) {
  if (!env.META_PIXEL_ID || !env.META_CAPI_TOKEN) {
    console.warn('CAPI skipped: META_PIXEL_ID or META_CAPI_TOKEN missing');
    return { skipped: true };
  }
  const body = { data };
  if (env.META_TEST_EVENT_CODE) body.test_event_code = env.META_TEST_EVENT_CODE;
  const r = await fetch(
    `https://graph.facebook.com/v21.0/${env.META_PIXEL_ID}/events?access_token=${env.META_CAPI_TOKEN}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  const out = await r.json();
  if (!r.ok || out.error) {
    console.error('CAPI error:', JSON.stringify(out));
    return { ok: false, error: out };
  }
  return { ok: true, response: out };
}

async function metaCapiPurchase(env, { eventId, eventTime, value, currency, email, name, fbp, fbc, ip, userAgent, sourceUrl, contentName = 'El método Claude', contentIds = ['metodo-claude'] }) {
  return metaCapiEnviar(env, [{
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
  }]);
}

// POST /evento: copia en el servidor de PageView, ViewContent e InitiateCheckout.
// La web solo la llama si la persona aceptó las cookies de Meta, con el mismo event_id que el píxel.
const EVENTOS_WEB = new Set(['PageView', 'ViewContent', 'InitiateCheckout']);
const PRODUCTOS = {
  'metodo-claude': 'El método Claude',
  'metodo-claude-negocio': 'El método Claude · Negocio',
  'diagnostico-implantacion': 'Diagnóstico de implantación',
};
async function handleEvento(req, env, ctx) {
  const origen = req.headers.get('origin') || '';
  if (origen && !/^https:\/\/(www\.)?rafaprompts\.com$/.test(origen)) return json({ error: 'forbidden' }, 403);
  const body = await req.json().catch(() => ({}));
  const url = String(body.url || '').slice(0, 500);
  if (!/^https:\/\/(www\.)?rafaprompts\.com\//.test(url)) return json({ error: 'bad_url' }, 400);
  const eventos = (Array.isArray(body.eventos) ? body.eventos : []).slice(0, 4)
    .filter(e => e && EVENTOS_WEB.has(e.name) && typeof e.id === 'string' && /^[\w.-]{6,80}$/.test(e.id));
  if (!eventos.length) return json({ error: 'no_events' }, 400);
  const ud = await hashedUserData({
    fbp: String(body.fbp || '').slice(0, 200), fbc: String(body.fbc || '').slice(0, 200),
    ip: req.headers.get('cf-connecting-ip') || '', userAgent: (req.headers.get('user-agent') || '').slice(0, 400),
  });
  const ahora = Math.floor(Date.now() / 1000);
  const data = eventos.map(e => {
    const ev = { event_name: e.name, event_time: ahora, event_id: e.id, action_source: 'website', event_source_url: url, user_data: ud };
    if (e.name !== 'PageView') {
      const id = PRODUCTOS[e.content_id] ? e.content_id : 'metodo-claude';
      const valor = Math.min(Math.max(Number(e.value) || 0, 0), 1000);
      ev.custom_data = { currency: 'EUR', value: valor, content_ids: [id], content_name: PRODUCTOS[id], content_type: 'product' };
    }
    return ev;
  });
  // con la cabecera x-ops (OPS_TOKEN) responde con lo que dice Meta, para comprobar el envío
  if (env.OPS_TOKEN && req.headers.get('x-ops') === env.OPS_TOKEN) return json(await metaCapiEnviar(env, data));
  ctx.waitUntil(metaCapiEnviar(env, data).catch(e => console.error('CAPI evento:', e)));
  return json({ ok: true });
}

// ---------- Email (Brevo) ----------

async function sendDeliveryEmail(env, { to, name, token, plan, importe, garantiaHasta }) {
  const m = correo.compra({
    nombre: name, plan, importe, url: `${env.DOWNLOAD_PAGE}?t=${token}`,
    nModulos: ORDEN_CURSO.modulos.length, garantiaHasta: garantiaHasta ? `${fechaLarga(new Date(garantiaHasta))} a las 23:59` : null,
  });
  return brevoSendEmail(env, { to, name, subject: m.asunto, html: m.html });
}

async function sendBienvenidaEmail(env, { to, name, token }) {
  const rec = JSON.parse(await env.STORE.get(`token:${token}`) || '{}');
  const m = correo.bienvenida({ nombre: name, url: `${env.DOWNLOAD_PAGE}?t=${token}`, modulos: ORDEN_CURSO.modulos.slice(0, 4).map(x => x.titulo), completo: estadoGarantia(rec).completo });
  return brevoSendEmail(env, { to, name, subject: m.asunto, html: m.html });
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
  const { params, plan, importe } = checkoutParams(env, body, metadata);
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
    importe,
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
  const inv = ev.payload || {};
  if (ev.event === 'invitee.canceled') {
    const idc = String(inv.uri || '').split('/').pop();
    if (idc) await env.STORE.delete(`prog:cita:${idc}`);
    return new Response('ok: canceled', { status: 200 });
  }
  if (ev.event !== 'invitee.created') return new Response('ignored', { status: 200 });
  const pago = inv.payment || {};
  if (!pago.successful) return new Response('ignored: unpaid', { status: 200 });
  const id = String(inv.uri || '').split('/').pop();
  if (!id) return new Response('no invitee', { status: 400 });
  const clave = `calendly:${id}`;
  if (await env.STORE.get(clave)) return new Response('already processed', { status: 200 });
  await env.STORE.put(clave, '1', { expirationTtl: 400 * 24 * 60 * 60 });
  // confirmación propia (qué preparar) y recordatorios 24 h y 1 h antes, que manda el cron
  const se = inv.scheduled_event || {};
  const cita = {
    tipo: 'cita', id, email: inv.email, name: inv.name, inicio: se.start_time, tz: inv.timezone || 'Europe/Madrid',
    evento: se.uri || '', joinUrl: (se.location || {}).join_url || '', cancelUrl: inv.cancel_url || '', rescheduleUrl: inv.reschedule_url || '',
    creada: Date.now(), enviados: {},
  };
  if (cita.email && cita.inicio) {
    const fin = Math.max(Math.floor((Date.parse(cita.inicio) - Date.now()) / 1000) + 2 * 86400, 3600);
    await programar(env, `prog:cita:${id}`, cita, fin).catch(e => console.error('programar cita:', e));
    const m = correo.citaConfirmada({ nombre: cita.name, inicio: cita.inicio, tz: cita.tz, joinUrl: cita.joinUrl, cancelUrl: cita.cancelUrl, rescheduleUrl: cita.rescheduleUrl });
    const r = await brevoSendEmail(env, { to: cita.email, name: cita.name, subject: m.asunto, html: m.html }).catch(e => ({ error: e.message }));
    if (!brevoOk(r)) await programar(env, `prog:citaok:${id}`, { tipo: 'citaok', ...cita }, 7 * 86400).catch(() => {});
  }
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
  // Dos cuentas de Stripe mientras dura el cambio: la de Rafa Prompts (STRIPE_WEBHOOK_SECRET_RP) y la anterior (STRIPE_WEBHOOK_SECRET)
  const ok = (await verifyStripeSignature(payload, sig, env.STRIPE_WEBHOOK_SECRET_RP))
    || (await verifyStripeSignature(payload, sig, env.STRIPE_WEBHOOK_SECRET));
  if (!ok) return new Response('invalid signature', { status: 400 });

  const event = JSON.parse(payload);
  const cs = event.data.object;
  // El curso se entrega cuando el pago está confirmado: al completar el pago o, con métodos lentos, al confirmarse después
  if (event.type === 'checkout.session.completed') {
    if (cs.payment_status && cs.payment_status !== 'paid' && cs.payment_status !== 'no_payment_required') {
      return new Response('awaiting async payment', { status: 200 });
    }
  } else if (event.type !== 'checkout.session.async_payment_succeeded') {
    return new Response('ignored', { status: 200 });
  }

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
    plan: plan || 'esencial',
    garantia_hasta: finDiaMadrid(Date.now(), GARANTIA_DIAS).toISOString(),
    acceso_completo_at: null,
  };
  await env.STORE.put(`token:${token}`, JSON.stringify(record), { expirationTtl: ttlSeconds });
  await env.STORE.put(`session:${csid}`, token, { expirationTtl: ttlSeconds });

  // Send email (Brevo)
  const entrega = { tipo: 'entrega', email, name, token, plan: plan || 'esencial', importe: (cs.amount_total || 0) / 100, garantiaHasta: record.garantia_hasta };
  const envio = await sendDeliveryEmail(env, { to: email, name, token, plan: entrega.plan, importe: entrega.importe, garantiaHasta: entrega.garantiaHasta }).catch(e => ({ error: e.message }));
  // si Brevo falla, el email queda en cola y el cron lo reintenta cada 5 minutos (el acceso ya está en la página de gracias)
  if (!brevoOk(envio)) {
    console.error('email de compra no enviado, en cola:', JSON.stringify(envio));
    await programar(env, `prog:entrega:${token}`, entrega, 30 * 86400).catch(() => {});
  }
  // Bienvenida con el orden para empezar: a las 9:00 (Madrid) del primer día que esté al menos a 8 horas
  await programar(env, `prog:bienv:${token}`, { tipo: 'bienvenida', email, name, token, cuando: proximasNueve(Date.now() + 8 * 3600e3) }, 30 * 86400)
    .catch(e => console.error('programar bienvenida:', e));
  // Aviso a Rafa de la venta (en Negocio, con el recordatorio de mandar los 12 proyectos en menos de 24 h)
  await sendSaleNotification(env, { plan: entrega.plan, email, name, amount: cs.amount_total, garantiaHasta: `${fechaLarga(new Date(record.garantia_hasta))} a las 23:59` }).catch(e => console.error('email error:', e));

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

// GET /acceso?session_id=cs_…: la página de gracias pide aquí el enlace de descarga (no depende del email).
// Solo lee: el webhook de Stripe es quien crea el acceso, así que mientras no llega responde «pendiente».
async function handleAcceso(req, env) {
  const csid = new URL(req.url).searchParams.get('session_id') || '';
  if (!/^cs_(live|test)_[A-Za-z0-9]{20,200}$/.test(csid)) return json({ error: 'bad_session' }, 400);
  const v = await env.STORE.get(`session:${csid}`);
  if (!v) return json({ pendiente: true });
  if (v === 'diagnostico') return json({ plan: 'diagnostico' });
  return json({ url: `${env.DOWNLOAD_PAGE}?t=${v}` });
}

// POST /acceso-completo { t, confirmo: true }: abre el curso completo. El botón avisa antes de que desde ese momento
// ya no hay devolución (art. 103.m LGDCU). Se guarda cuándo, desde qué IP y navegador, y se confirma por correo.
async function handleAccesoCompleto(req, env) {
  const body = await req.json().catch(() => ({}));
  const token = String(body.t || '');
  if (body.confirmo !== true) return json({ error: 'falta_confirmacion' }, 400);
  const raw = token && await env.STORE.get(`token:${token}`);
  if (!raw) return json({ error: 'invalid_or_expired' }, 404);
  const data = JSON.parse(raw);
  if (!data.garantia_hasta || data.acceso_completo_at) return json({ ok: true, abierto_el: data.acceso_completo_at || null, pase: await pase(env, token) });
  const at = new Date().toISOString();
  data.acceso_completo_at = at;
  data.acceso_completo_ip = req.headers.get('cf-connecting-ip') || '';
  data.acceso_completo_ua = (req.headers.get('user-agent') || '').slice(0, 300);
  await env.STORE.put(`token:${token}`, JSON.stringify(data), { expirationTtl: parseInt(env.TOKEN_TTL_DAYS, 10) * 24 * 60 * 60 });
  const m = correo.cursoCompleto({ nombre: data.name, plan: data.plan, url: `${env.DOWNLOAD_PAGE}?t=${token}`, cuando: at, nModulos: ORDEN_CURSO.modulos.length, siguiente: ORDEN_CURSO.modulos[1].titulo });
  const r = await brevoSendEmail(env, { to: data.email, name: data.name, subject: m.asunto, html: m.html }).catch(e => ({ error: e.message }));
  if (!brevoOk(r)) await programar(env, `prog:completo:${token}`, { tipo: 'completo', token, email: data.email, name: data.name, plan: data.plan, cuando: at }, 30 * 86400).catch(() => {});
  if (env.ADMIN_EMAIL) {
    const a = correo.avisoCompleto({ plan: data.plan, email: data.email, nombre: data.name });
    await brevoSendEmail(env, { to: env.ADMIN_EMAIL, subject: a.asunto, html: a.html }).catch(() => {});
  }
  return json({ ok: true, abierto_el: at, pase: await pase(env, token) });
}

async function handleSession(req, env) {
  const url = new URL(req.url);
  const token = url.searchParams.get('t') || url.searchParams.get('token');
  if (!token) return json({ error: 'missing_token' }, 400);
  const raw = await env.STORE.get(`token:${token}`);
  if (!raw) return json({ error: 'invalid_or_expired' }, 404);
  const data = JSON.parse(raw);
  const g = estadoGarantia(data);
  return json({
    email: data.email,
    name: data.name,
    plan: data.plan || 'esencial',
    downloads_left: data.downloads_left,
    purchased_at: data.purchased_at,
    files: PDF_CATALOG.map(f => ({ ...f, bloqueado: f.parte === 2 && !g.completo })),
    completo: g.completo,
    garantia: g.garantia,
    garantia_hasta: g.hasta,
    garantia_hasta_txt: g.hastaTxt || null,
    abierto_el: g.abiertoEl,
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
  const archivo = PDF_CATALOG.find(p => p.slug === slug);
  if (archivo.parte === 2 && !estadoGarantia(data).completo && url.searchParams.get('pase') !== await pase(env, token)) return json({ error: 'curso_completo_cerrado' }, 403);

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

const brevoOk = r => !!(r && r.messageId);

async function brevoSendEmail(env, { to, name, subject, html, replyTo }) {
  const sender = senderFromEnv(env);
  return fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender,
      to: [{ email: to, ...(name ? { name } : {}) }],
      replyTo: replyTo || { email: env.EMAIL_REPLY_TO || sender.email, name: sender.name },
      subject,
      htmlContent: html,
    }),
  }).then(r => r.json()).catch(e => ({ error: e.message }));
}

async function sendDiagnosticoEmail(env, { to, name }) {
  const m = correo.llamadaPagada({ nombre: name });
  return brevoSendEmail(env, { to, name, subject: m.asunto, html: m.html });
}

// Aviso a Rafa de cada venta (en Negocio y en la llamada, con lo que tiene que hacer)
async function sendSaleNotification(env, { plan, email, name, amount, garantiaHasta }) {
  if (!env.ADMIN_EMAIL) return { skipped: true };
  const m = correo.avisoVenta({ plan, email, nombre: name, importe: (amount || 0) / 100, garantiaHasta });
  return brevoSendEmail(env, { to: env.ADMIN_EMAIL, subject: m.asunto, html: m.html });
}

async function sendWelcomeEmail(env, { to, source }) {
  const m = source === 'index' ? correo.boletin() : correo.guia(source);
  return brevoSendEmail(env, { to, subject: m.asunto, html: m.html });
}

async function sendNewSubscriberNotification(env, { email, source, ip, userAgent }) {
  if (!env.ADMIN_EMAIL) return { skipped: true };
  const m = correo.avisoContacto({ email, source, ip, userAgent });
  return brevoSendEmail(env, { to: env.ADMIN_EMAIL, subject: m.asunto, html: m.html });
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

// ---------- Tareas programadas (cron cada 5 minutos) ----------
// Claves prog:* en KV: la bienvenida del día después de la compra y las citas de Calendly.

async function programar(env, clave, datos, ttlSegundos) {
  await env.STORE.put(clave, JSON.stringify(datos), { expirationTtl: Math.max(Math.floor(ttlSegundos), 120) });
}

// Primera hora en punto a las 9:00 de Madrid a partir de «desde» (ms)
function proximasNueve(desde) {
  const hora = t => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(new Date(t)));
  let t = Math.ceil(desde / 3600e3) * 3600e3;
  for (let i = 0; i < 48 && hora(t) !== 9; i++) t += 3600e3;
  return t;
}

// Estado real de la cita en Calendly (cancelada o no) y enlace de Meet, si hay token
async function estadoCita(env, cita) {
  if (!env.CALENDLY_TOKEN || !cita.evento) return null;
  const r = await fetch(cita.evento, { headers: { Authorization: `Bearer ${env.CALENDLY_TOKEN}` } });
  if (!r.ok) return null;
  const ev = (await r.json()).resource || {};
  return { cancelada: ev.status === 'canceled', inicio: ev.start_time, joinUrl: (ev.location || {}).join_url || '' };
}

async function tareasProgramadas(env, ahora = Date.now()) {
  const hecho = [];
  const lista = await env.STORE.list({ prefix: 'prog:' });
  for (const k of lista.keys) {
    const raw = await env.STORE.get(k.name);
    if (!raw) continue;
    const d = JSON.parse(raw);
    try {
      if (d.tipo === 'entrega') {
        const r = await sendDeliveryEmail(env, { to: d.email, name: d.name, token: d.token, plan: d.plan, importe: d.importe, garantiaHasta: d.garantiaHasta });
        if (!brevoOk(r)) { hecho.push(`entrega pendiente ${d.email}: ${r && r.message}`); continue; }
        await env.STORE.delete(k.name);
        hecho.push(`entrega ${d.email}`);
      } else if (d.tipo === 'bienvenida') {
        if (ahora < d.cuando) continue;
        const r = await sendBienvenidaEmail(env, { to: d.email, name: d.name, token: d.token });
        if (!brevoOk(r)) { hecho.push(`bienvenida pendiente ${d.email}: ${r && r.message}`); continue; }
        await env.STORE.delete(k.name);
        hecho.push(`bienvenida ${d.email}`);
      } else if (d.tipo === 'completo') {
        const m = correo.cursoCompleto({ nombre: d.name, plan: d.plan, url: `${env.DOWNLOAD_PAGE}?t=${d.token}`, cuando: d.cuando, nModulos: ORDEN_CURSO.modulos.length, siguiente: ORDEN_CURSO.modulos[1].titulo });
        const r = await brevoSendEmail(env, { to: d.email, name: d.name, subject: m.asunto, html: m.html });
        if (!brevoOk(r)) { hecho.push(`curso completo pendiente ${d.email}`); continue; }
        await env.STORE.delete(k.name);
        hecho.push(`curso completo ${d.email}`);
      } else if (d.tipo === 'citaok') {
        if (Date.parse(d.inicio) < ahora) { await env.STORE.delete(k.name); continue; }
        const m = correo.citaConfirmada({ nombre: d.name, inicio: d.inicio, tz: d.tz, joinUrl: d.joinUrl, cancelUrl: d.cancelUrl, rescheduleUrl: d.rescheduleUrl });
        const r = await brevoSendEmail(env, { to: d.email, name: d.name, subject: m.asunto, html: m.html });
        if (!brevoOk(r)) { hecho.push(`confirmación cita pendiente ${d.email}`); continue; }
        await env.STORE.delete(k.name);
        hecho.push(`confirmación cita ${d.email}`);
      } else if (d.tipo === 'cita') {
        const inicio = Date.parse(d.inicio);
        const falta = inicio - ahora;
        if (falta <= 0) { await env.STORE.delete(k.name); continue; }
        // 24 h antes (si se reservó con más de 26 h de margen) y 1 h antes (si se reservó con más de 2 h)
        const toca = !d.enviados.d24 && falta <= 24 * 3600e3 && falta > 3 * 3600e3 && inicio - d.creada > 26 * 3600e3 ? '24h'
          : !d.enviados.h1 && falta <= 65 * 60e3 && inicio - d.creada > 2 * 3600e3 ? '1h' : null;
        if (!toca) continue;
        const est = await estadoCita(env, d).catch(() => null);
        if (est && est.cancelada) { await env.STORE.delete(k.name); hecho.push(`cita cancelada ${d.email}`); continue; }
        if (est && est.joinUrl) d.joinUrl = est.joinUrl;
        const m = correo.citaRecordatorio({ tipo: toca, nombre: d.name, inicio: d.inicio, tz: d.tz, joinUrl: d.joinUrl, rescheduleUrl: d.rescheduleUrl });
        const r = await brevoSendEmail(env, { to: d.email, name: d.name, subject: m.asunto, html: m.html });
        if (!brevoOk(r)) { hecho.push(`recordatorio ${toca} pendiente ${d.email}: ${r && r.message}`); continue; }
        d.enviados[toca === '24h' ? 'd24' : 'h1'] = Date.now();
        await programar(env, k.name, d, Math.floor(falta / 1000) + 2 * 86400);
        hecho.push(`recordatorio ${toca} ${d.email}`);
      }
    } catch (e) {
      console.error('tarea programada', k.name, e.stack || e.message);
    }
  }
  return hecho;
}

// ---------- Operaciones (solo con OPS_TOKEN) ----------
// POST /admin/pruebas: manda un ejemplo de cada email a ADMIN_EMAIL (nunca a clientes)
// GET  /admin/brevo?ids=a,b: estado de esos envíos en Brevo
// POST /admin/capi: manda a Meta un PageView de prueba con test_event_code (no es una compra)
function opsOk(req, env, body) {
  const t = (body && body.token) || new URL(req.url).searchParams.get('token') || '';
  return env.OPS_TOKEN && t.length === env.OPS_TOKEN.length && t === env.OPS_TOKEN;
}

async function handlePruebas(req, env) {
  const body = await req.json().catch(() => ({}));
  if (!opsOk(req, env, body)) return json({ error: 'forbidden' }, 403);
  const to = env.ADMIN_EMAIL;
  const prueba = s => `[Prueba] ${s}`;
  const urlDesc = `${env.DOWNLOAD_PAGE}?t=prueba`;
  const inicio = new Date(Date.now() + 26 * 3600e3).toISOString().replace(/:\d\d\.\d+Z$/, ':00.000Z');
  const cita = { nombre: 'Rafa Alberola', inicio, tz: 'Europe/Madrid', joinUrl: 'https://meet.google.com/', cancelUrl: 'https://calendly.com/', rescheduleUrl: 'https://calendly.com/' };
  const tipos = {
    compra: correo.compra({ nombre: 'Rafa Alberola', plan: 'esencial', importe: 99, url: urlDesc, nModulos: ORDEN_CURSO.modulos.length, garantiaHasta: `${fechaLarga(finDiaMadrid(Date.now(), GARANTIA_DIAS))} a las 23:59` }),
    completo: correo.cursoCompleto({ nombre: 'Rafa Alberola', plan: 'esencial', url: urlDesc, cuando: new Date().toISOString(), nModulos: ORDEN_CURSO.modulos.length, siguiente: ORDEN_CURSO.modulos[1].titulo }),
    avisoCompleto: correo.avisoCompleto({ plan: 'negocio', email: to, nombre: 'Rafa Alberola' }),
    bienvenida: correo.bienvenida({ nombre: 'Rafa Alberola', url: urlDesc, modulos: ORDEN_CURSO.modulos.slice(0, 4).map(x => x.titulo), completo: false }),
    cita: correo.citaConfirmada(cita),
    recordatorio24: correo.citaRecordatorio({ tipo: '24h', ...cita }),
    recordatorio1h: correo.citaRecordatorio({ tipo: '1h', ...cita }),
    guia: correo.guia(body.source || 'hooks'),
    boletin: correo.boletin(),
    llamada: correo.llamadaPagada({ nombre: 'Rafa Alberola' }),
    avisoVenta: correo.avisoVenta({ plan: 'esencial', email: to, nombre: 'Rafa Alberola', importe: 99, garantiaHasta: `${fechaLarga(finDiaMadrid(Date.now(), GARANTIA_DIAS))} a las 23:59` }),
    avisoContacto: correo.avisoContacto({ email: to, source: 'hooks', ip: req.headers.get('cf-connecting-ip') || '', userAgent: req.headers.get('user-agent') || '' }),
  };
  const pedidos = Array.isArray(body.tipos) && body.tipos.length ? body.tipos : Object.keys(tipos);
  const out = {};
  for (const t of pedidos) {
    if (!tipos[t]) continue;
    out[t] = await brevoSendEmail(env, { to, name: 'Rafa', subject: prueba(tipos[t].asunto), html: tipos[t].html });
  }
  return json({ to, enviados: out });
}

async function handleBrevoEstado(req, env) {
  if (!opsOk(req, env)) return json({ error: 'forbidden' }, 403);
  const ids = (new URL(req.url).searchParams.get('ids') || '').split(',').filter(Boolean).slice(0, 10);
  const out = {};
  for (const id of ids) {
    const r = await fetch(`https://api.brevo.com/v3/smtp/statistics/events?messageId=${encodeURIComponent(id)}&limit=20`, { headers: { 'api-key': env.BREVO_API_KEY, accept: 'application/json' } });
    out[id] = ((await r.json()).events || []).map(e => ({ evento: e.event, cuando: e.date, motivo: e.reason }));
  }
  return json(out);
}

async function handleCapiPrueba(req, env) {
  const body = await req.json().catch(() => ({}));
  if (!opsOk(req, env, body)) return json({ error: 'forbidden' }, 403);
  const code = String(body.test_event_code || '');
  if (!/^TEST\w{3,20}$/.test(code)) return json({ error: 'test_event_code requerido' }, 400);
  const r = await metaCapiEnviar({ ...env, META_TEST_EVENT_CODE: code }, [{
    event_name: 'PageView', event_time: Math.floor(Date.now() / 1000), event_id: `prueba_${Date.now()}`, action_source: 'website',
    event_source_url: 'https://rafaprompts.com/', user_data: await hashedUserData({ ip: req.headers.get('cf-connecting-ip') || '', userAgent: req.headers.get('user-agent') || '' }),
  }]);
  return json(r);
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
        case 'POST /evento':
          res = await handleEvento(req, env, ctx);
          break;
        case 'GET /oferta': {
          const l = lanzamiento(env);
          res = json(l ? { lanzamiento: true, importe: l.importe, normal: IMPORTE.esencial, hasta: new Date(l.hasta).toISOString() } : { lanzamiento: false, importe: IMPORTE.esencial });
          break;
        }
        case 'POST /admin/pruebas':
          res = await handlePruebas(req, env);
          break;
        case 'GET /admin/brevo':
          res = await handleBrevoEstado(req, env);
          break;
        case 'POST /admin/capi':
          res = await handleCapiPrueba(req, env);
          break;
        case 'POST /admin/tareas':
          res = opsOk(req, env, await req.clone().json().catch(() => ({}))) ? json({ hecho: await tareasProgramadas(env) }) : json({ error: 'forbidden' }, 403);
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
        case 'GET /acceso':
          res = await handleAcceso(req, env);
          break;
        case 'POST /acceso-completo':
          res = await handleAccesoCompleto(req, env);
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

  async scheduled(event, env, ctx) {
    ctx.waitUntil(tareasProgramadas(env).then(h => { if (h.length) console.log('tareas:', h.join(' · ')); }));
  },
};
