// Plantillas de los emails de rafa.prompts. Cada función devuelve { asunto, html }.
// Estilo de la web (crema, tinta y terracota), frases cortas y sin exclamaciones.
// El botón usa #B95A39: con texto blanco pasa el contraste AA.

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pila = n => String(n || '').trim().split(/\s+/)[0] || '';
const hola = n => (pila(n) ? `Hola, ${esc(pila(n))}` : 'Hola');

function marco({ kicker, titulo, cuerpo, resumen }) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(titulo.replace(/<[^>]+>/g, ''))}</title></head>
<body style="margin:0; padding:32px 16px; background:#F2EFE7; color:#141311; font-family:-apple-system, 'Segoe UI', system-ui, Arial, sans-serif;">
<div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${esc(resumen || '')}</div>
<div style="max-width:560px; margin:0 auto; background:#ffffff; padding:36px 30px; border-radius:20px;">
  <div style="font-family:'IBM Plex Mono', Menlo, monospace; font-size:11px; letter-spacing:0.18em; text-transform:uppercase; color:#A9502F; font-weight:700; margin-bottom:14px;">${kicker}</div>
  <h1 style="font-size:26px; font-weight:900; line-height:1.15; margin:0 0 18px; letter-spacing:-0.02em; color:#141311;">${titulo}</h1>
  ${cuerpo}
</div>
<p style="text-align:center; font-size:12px; line-height:1.6; color:#6B675F; margin:20px 0 0;">Rafa · rafaprompts.com · hola@rafaprompts.com</p>
</body></html>`;
}
const p = t => `<p style="font-size:16px; line-height:1.6; color:#333333; margin:0 0 16px;">${t}</p>`;
const boton = (texto, url) => `<p style="margin:26px 0;"><a href="${esc(url)}" style="display:inline-block; background:#B95A39; color:#ffffff; padding:15px 26px; border-radius:999px; text-decoration:none; font-weight:700; font-size:15px;">${texto}</a></p>`;
const nota = t => `<p style="font-size:13px; line-height:1.6; color:#6B675F; margin:0 0 10px;">${t}</p>`;
const enlace = (texto, url) => `<a href="${esc(url)}" style="color:#A9502F; font-weight:700;">${texto}</a>`;
const separador = '<hr style="border:0; border-top:1px solid rgba(0,0,0,0.08); margin:28px 0 20px;">';
const lista = items => `<ol style="margin:0 0 18px; padding-left:22px; font-size:16px; line-height:1.6; color:#333333;">${items.map(i => `<li style="margin:0 0 8px;">${i}</li>`).join('')}</ol>`;
const euros = n => `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })}&nbsp;€`;

// «jueves 22 de octubre a las 10:00 (hora de Madrid)»
export function cuandoCita(iso, tz) {
  const zona = tz || 'Europe/Madrid';
  let fmt;
  try { fmt = o => new Intl.DateTimeFormat('es-ES', { timeZone: zona, ...o }).format(new Date(iso)); }
  catch (_) { return cuandoCita(iso, 'Europe/Madrid'); }
  const dia = fmt({ weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
  const hora = fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const lugar = zona === 'Europe/Madrid' ? 'Madrid' : zona.split('/').pop().replace(/_/g, ' ');
  return { dia, hora, largo: `${dia} a las ${hora}`, zona: `hora de ${lugar}` };
}

// 1. Compra del curso: confirma el pago y da el acceso en el mismo correo
export function compra({ nombre, plan, importe, url, nPdfs, nModulos }) {
  const negocio = plan === 'negocio';
  return {
    asunto: 'Ya tienes El método Claude: aquí está tu acceso',
    html: marco({
      kicker: 'Compra confirmada',
      titulo: `${hola(nombre)}: ya tienes el curso`,
      resumen: 'Tu acceso a los PDF del curso y por dónde empezar.',
      cuerpo: [
        p(`Pago confirmado: <strong>${euros(importe)}</strong> por El método Claude${negocio ? ', plan Negocio' : ''}. Los PDF ya están listos:`),
        boton('Descargar el curso', url),
        p(`En tu página tienes ${nPdfs} PDF: los ${nModulos} módulos, «Empezar aquí» y la biblioteca de 100 prompts. Empieza por «Empezar aquí».`),
        negocio ? p('Los 12 proyectos del plan Negocio te los mando yo a este correo en menos de 24 horas.') : '',
        p('Cada PDF lleva tu nombre y tu email impresos, y las actualizaciones son gratis.'),
        p('Tienes 14 días de garantía. Si el curso no te sirve, responde a este correo y te devuelvo el dinero entero, sin tener que explicar nada.'),
        separador,
        nota(`Si el botón no funciona, copia este enlace en el navegador:<br><span style="word-break:break-all; color:#A9502F;">${esc(url)}</span>`),
        nota('¿Alguna duda? Responde a este correo. Lo leo yo.'),
      ].join(''),
    }),
  };
}

// 2. Bienvenida al día siguiente de la compra: el orden para empezar
export function bienvenida({ nombre, url, modulos }) {
  const [m1, m2, m3, m4] = modulos;
  return {
    asunto: 'Por dónde empezar el curso esta semana',
    html: marco({
      kicker: 'El método Claude · primeros pasos',
      titulo: `${hola(nombre)}: tu plan para empezar`,
      resumen: 'Cuatro PDF en orden y tendrás Claude listo para trabajar con tu negocio.',
      cuerpo: [
        p('Para que el curso no se quede en la carpeta de descargas, este es el orden que te recomiendo para la primera semana:'),
        lista([
          '<strong>Empezar aquí</strong>: qué vas a montar y qué necesitas.',
          `<strong>Módulo 01 · ${esc(m1)}</strong>`,
          `<strong>Módulo 02 · ${esc(m2)}</strong>`,
          `<strong>Módulo 03 · ${esc(m3)}</strong>`,
          `<strong>Módulo 04 · ${esc(m4)}</strong>`,
        ]),
        p('Con esos cinco, Claude ya estará conectado a tu correo y tus documentos y sabrá cómo trabaja tu negocio. Después sigue el orden del curso o salta al módulo que más te urja.'),
        boton('Abrir mis descargas', url),
        p('Si te atascas en algún paso, responde a este correo con una captura y te digo cómo seguir.'),
      ].join(''),
    }),
  };
}

// 3. Llamada de diagnóstico reservada (Calendly)
export function citaConfirmada({ nombre, inicio, tz, joinUrl, cancelUrl, rescheduleUrl }) {
  const c = cuandoCita(inicio, tz);
  return {
    asunto: `Llamada confirmada: ${c.largo}`,
    html: marco({
      kicker: 'Llamada de 45 minutos',
      titulo: `${hola(nombre)}: nos vemos el ${c.largo}`,
      resumen: `Diagnóstico de 45 minutos el ${c.largo} (${c.zona}).`,
      cuerpo: [
        p(`Te espero el <strong>${c.largo}</strong> (${c.zona}). Son 45 minutos por Google Meet.`),
        joinUrl ? boton('Entrar a la llamada', joinUrl) : p('El enlace de Google Meet está en la invitación de Calendly que te ha llegado.'),
        p('<strong>Antes de la llamada</strong>, apunta las tres tareas que más horas te quitan cada semana y cuánto tiempo te lleva cada una.'),
        p('Después te mando por escrito las tres que más compensa automatizar y cuánto costaría. Si contratas la implantación, estos 50&nbsp;€ se descuentan del precio.'),
        separador,
        (rescheduleUrl || cancelUrl) ? nota(`¿No puedes a esa hora? ${rescheduleUrl ? enlace('Cambia la hora', rescheduleUrl) : ''}${rescheduleUrl && cancelUrl ? ' o ' : ''}${cancelUrl ? enlace('cancela la llamada', cancelUrl) : ''}.`) : '',
        nota('Te recuerdo la llamada el día antes y una hora antes.'),
      ].join(''),
    }),
  };
}

// 4 y 5. Recordatorios: 24 horas y 1 hora antes
export function citaRecordatorio({ tipo, nombre, inicio, tz, joinUrl, rescheduleUrl }) {
  const c = cuandoCita(inicio, tz);
  const dia = tipo === '24h';
  return {
    asunto: dia ? `Mañana a las ${c.hora}: tu llamada de 45 minutos` : `En una hora: tu llamada de las ${c.hora}`,
    html: marco({
      kicker: dia ? 'Recordatorio · mañana' : 'Recordatorio · en una hora',
      titulo: dia ? `${hola(nombre)}: mañana a las ${c.hora} hablamos` : `${hola(nombre)}: hablamos a las ${c.hora}`,
      resumen: `Llamada de 45 minutos el ${c.largo} (${c.zona}).`,
      cuerpo: [
        p(`La llamada es el <strong>${c.largo}</strong> (${c.zona}), por Google Meet.`),
        joinUrl ? boton('Entrar a la llamada', joinUrl) : p('El enlace de Google Meet está en la invitación de Calendly.'),
        dia
          ? p('Si aún no lo has hecho, apunta las tres tareas que más horas te quitan cada semana y cuánto tiempo te lleva cada una.')
          : p('Ten a mano tu lista de tareas. Si quieres enseñarme algo en pantalla, déjalo abierto.'),
        dia && rescheduleUrl ? nota(`¿Te ha surgido algo? ${enlace('Cambia la hora aquí', rescheduleUrl)}.`) : '',
      ].join(''),
    }),
  };
}
