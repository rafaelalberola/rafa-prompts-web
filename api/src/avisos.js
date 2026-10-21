// Avisos a Telegram (bot de Rafa Prompts).
// - Cada 10 minutos: lo que haya pasado (ventas, contactos nuevos, cursos completos abiertos, llamadas y emails que no salieron).
// - Cada día a las 9:00: el resumen del día anterior.
// - Cada día a las 10:00: a quién se le ha mandado la oferta (index.js, ofertasDiarias).
// Los eventos se guardan en KV (tg:… para el aviso de 10 minutos y log:<día>:… para el resumen diario).
import { GUIAS } from './emails.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const euros = n => `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;
const PLAN = { esencial: 'Esencial', negocio: 'Negocio', diagnostico: 'Llamada de 45 minutos' };
export const diaMadrid = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
export const horaMadrid = ms => Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).map(x => [x.type, Number(x.value)]));
const diaLargo = ms => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ms)).replace(',', '');
export const origen = source => (GUIAS[source] ? GUIAS[source].ruta : source === 'index' ? 'boletín de la portada' : source || '-');

export async function enviarTelegram(env, texto) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return { ok: false, motivo: 'sin bot' };
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: texto, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  return r.json().catch(() => ({ ok: false }));
}

// tipo: venta | contacto | completo | llamada | fallo
export async function registrar(env, tipo, datos) {
  const ahora = Date.now();
  const id = `${ahora}-${Math.random().toString(36).slice(2, 8)}`;
  const ev = JSON.stringify({ tipo, t: ahora, ...datos });
  await Promise.all([
    env.STORE.put(`tg:${id}`, ev, { expirationTtl: 2 * 86400 }),
    env.STORE.put(`log:${diaMadrid(ahora)}:${id}`, ev, { expirationTtl: 3 * 86400 }),
  ]).catch(e => console.error('registrar aviso', e));
}

async function leer(env, prefix) {
  const out = [];
  let cursor;
  do {
    const l = await env.STORE.list({ prefix, cursor });
    for (const k of l.keys) { const v = await env.STORE.get(k.name); if (v) out.push({ clave: k.name, ...JSON.parse(v) }); }
    cursor = l.list_complete ? null : l.cursor;
  } while (cursor);
  return out.sort((a, b) => a.t - b.t);
}

const LINEA = {
  venta: e => `· ${esc(e.email)} · ${PLAN[e.plan] || e.plan} · ${euros(e.importe)}${e.garantiaHasta ? `. Garantía hasta el ${esc(e.garantiaHasta)}` : ''}`,
  contacto: e => `· ${esc(e.email)} · ${esc(origen(e.source))}`,
  completo: e => `· ${esc(e.email)} · ${e.plan === 'negocio' ? 'Negocio: mándale los 12 proyectos en menos de 24 horas.' : 'Esencial: su garantía ha terminado.'}`,
  llamada: e => `· ${esc(e.email)} · ${esc(e.cuando)}`,
  fallo: e => `· ${esc(e.email)} · ${esc(e.que)}. Sigue en cola y se reintenta cada 5 minutos.`,
};
const TITULO = { venta: 'Ventas', contacto: 'Contactos nuevos', completo: 'Se quedan el curso completo', llamada: 'Llamadas reservadas', fallo: 'Emails que no han salido' };

// Cada 10 minutos: un solo mensaje con todo lo nuevo. Si no ha pasado nada, no manda nada.
export async function aviso10(env) {
  const evs = await leer(env, 'tg:');
  if (!evs.length) return 0;
  const bloques = Object.keys(TITULO).map(tipo => {
    const de = evs.filter(e => e.tipo === tipo);
    return de.length ? `<b>${TITULO[tipo]} (${de.length})</b>\n${de.map(LINEA[tipo]).join('\n')}` : '';
  }).filter(Boolean);
  const r = await enviarTelegram(env, bloques.join('\n\n'));
  if (r.ok) await Promise.all(evs.map(e => env.STORE.delete(e.clave)));
  return r.ok ? evs.length : 0;
}

// Cada día a las 9:00: cómo fue el día anterior
export async function resumenDiario(env, ahora = Date.now()) {
  const ayer = ahora - 86400e3;
  const evs = await leer(env, `log:${diaMadrid(ayer)}:`);
  const de = t => evs.filter(e => e.tipo === t);
  const ventas = de('venta'), contactos = de('contacto');
  const porGuia = {};
  contactos.forEach(c => { const o = origen(c.source); porGuia[o] = (porGuia[o] || 0) + 1; });
  const total = ventas.reduce((a, v) => a + (Number(v.importe) || 0), 0);
  const lineas = [
    `<b>Ayer, ${diaLargo(ayer)}</b>`,
    `Ventas: ${ventas.length}${ventas.length ? ` (${euros(total)})` : ''}`,
    `Contactos nuevos: ${contactos.length}${contactos.length ? ` (${Object.entries(porGuia).map(([k, n]) => `${esc(k)} ${n}`).join(', ')})` : ''}`,
    `Se quedan el curso completo: ${de('completo').length}`,
    `Llamadas reservadas: ${de('llamada').length}`,
  ];
  if (de('fallo').length) lineas.push(`Emails que no salieron a la primera: ${de('fallo').length}`);
  return enviarTelegram(env, lineas.join('\n'));
}

// Cada día a las 10:00, tras mandar las ofertas
export function textoOfertas({ enviados, importe, normal, hasta }) {
  const menos = Math.round((1 - importe / normal) * 100);
  return [
    `<b>Oferta enviada a ${enviados.length} ${enviados.length === 1 ? 'contacto' : 'contactos'} sin compra</b>`,
    'Se apuntaron hace 4 días y no han comprado:',
    ...enviados.map(e => `· ${esc(e.email)} · ${esc(origen(e.source))}`),
    '',
    `Desde hoy pueden comprar El método Claude por ${euros(importe)} (antes ${euros(normal)}, un ${menos} % menos) hasta el ${esc(hasta)}, solo desde el enlace de su email.`,
  ].join('\n');
}
