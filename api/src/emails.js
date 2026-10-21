// Plantillas de los emails de rafa.prompts. Cada función devuelve { asunto, html }.
// Tono: aspiracional (lo que la persona va a conseguir), frases cortas, sin exclamaciones ni rayas.
// Estilo de la web: crema, tinta y terracota. El botón usa #B95A39, que con texto blanco pasa AA.
// Modo oscuro de Gmail (móvil): invierte el texto blanco del botón y deja de leerse. Las dos capas
// .gm-s/.gm-d (fondo negro con mezcla screen y difference) lo devuelven a blanco; solo actúan en Gmail.

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pila = n => String(n || '').trim().split(/\s+/)[0] || '';
const hola = n => (pila(n) ? `Hola, ${esc(pila(n))}` : 'Hola');
const WEB = 'https://rafaprompts.com/';

function marco({ kicker, titulo, cuerpo, resumen }) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${esc(titulo.replace(/<[^>]+>/g, ''))}</title>
<style>u + .body .gm-s { background: #000000; mix-blend-mode: screen; } u + .body .gm-d { background: #000000; mix-blend-mode: difference; }</style></head>
<body class="body" style="margin:0; padding:32px 16px; background:#F2EFE7; color:#141311; font-family:-apple-system, 'Segoe UI', system-ui, Arial, sans-serif;">
<div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${esc(resumen || '')}</div>
<div style="max-width:560px; margin:0 auto; background:#ffffff; padding:36px 30px; border-radius:20px;">
  <div style="font-family:'IBM Plex Mono', Menlo, monospace; font-size:11px; letter-spacing:0.18em; text-transform:uppercase; color:#A9502F; font-weight:700; margin-bottom:14px;">${kicker}</div>
  <h1 style="font-size:26px; font-weight:900; line-height:1.18; margin:0 0 18px; letter-spacing:-0.02em; color:#141311;">${titulo}</h1>
  ${cuerpo}
</div>
<p style="text-align:center; font-size:12px; line-height:1.6; color:#6B675F; margin:20px 0 0;">Rafa · rafaprompts.com · hola@rafaprompts.com</p>
</body></html>`;
}
const p = t => `<p style="font-size:16px; line-height:1.6; color:#333333; margin:0 0 16px;">${t}</p>`;
const boton = (texto, url) => `<p style="margin:26px 0;"><a href="${esc(url)}" style="display:inline-block; background:#B95A39; color:#ffffff; padding:15px 26px; border-radius:999px; text-decoration:none; font-weight:700; font-size:15px;"><span class="gm-s"><span class="gm-d" style="color:#ffffff;">${texto}</span></span></a></p>`;
const nota = t => `<p style="font-size:13px; line-height:1.6; color:#6B675F; margin:0 0 10px;">${t}</p>`;
const enlace = (texto, url) => `<a href="${esc(url)}" style="color:#A9502F; font-weight:700;">${texto}</a>`;
const separador = '<hr style="border:0; border-top:1px solid rgba(0,0,0,0.08); margin:28px 0 20px;">';
const lista = (items, ordenada = true) => {
  const t = ordenada ? 'ol' : 'ul';
  return `<${t} style="margin:0 0 18px; padding-left:22px; font-size:16px; line-height:1.6; color:#333333;">${items.map(i => `<li style="margin:0 0 8px;">${i}</li>`).join('')}</${t}>`;
};
const euros = n => `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })}&nbsp;€`;
const baja = nota('¿Prefieres no recibir más correos? Responde a este con la palabra «baja» y te saco de la lista.');
const curso = p(`Y cuando quieras llevarlo a todo tu negocio, en ${enlace('El método Claude', WEB)} te enseño a automatizar el correo, los clientes, los presupuestos y las facturas, sin programar.`);

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
const ahoraMadrid = () => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'full', timeStyle: 'short' }).format(new Date());

// ---------- Curso ----------

// Compra del curso: confirma el pago y da el acceso. Al comprar tiene «Empezar aquí» y el módulo 01; el resto lo abre
// cuando decide quedarse el curso, y entonces termina la garantía (condiciones, punto 06).
export function compra({ nombre, plan, importe, url, nModulos, garantiaHasta }) {
  const negocio = plan === 'negocio';
  return {
    asunto: 'Ya tienes El método Claude: empieza hoy',
    html: marco({
      kicker: 'Compra confirmada',
      titulo: `${hola(nombre)}: hoy empiezas a recuperar tus tardes`,
      resumen: 'Empieza ya con «Empezar aquí» y el módulo 01.',
      cuerpo: [
        p(`Pago confirmado: <strong>${euros(importe)}</strong> por El método Claude${negocio ? ', plan Negocio' : ''}. Ya puedes empezar:`),
        boton('Empezar el curso', url),
        p('Empieza por «Empezar aquí» y el módulo 01. En una tarde verás todo lo que Claude puede hacer por tu negocio.'),
        p(`Cuando decidas quedártelo, abre el curso completo desde la misma página: los ${nModulos - 1} módulos que faltan y la biblioteca de 100 prompts.`),
        negocio ? p('Tus 12 proyectos del plan Negocio te llegan a este correo en menos de 24 horas desde que abras el curso completo.') : '',
        p(`<strong>Tienes 14 días de garantía</strong>${garantiaHasta ? `, hasta el ${garantiaHasta}` : ''}. Mientras no abras el curso completo, si me lo pides te devuelvo el dinero entero, y «Empezar aquí» y el módulo 01 siguen siendo tuyos.`),
        separador,
        nota(`Si el botón no funciona, copia este enlace en el navegador:<br><span style="word-break:break-all; color:#A9502F;">${esc(url)}</span>`),
        nota('¿Alguna duda? Responde a este correo.'),
      ].join(''),
    }),
  };
}

// Al abrir el curso completo: lo confirma por escrito (con la fecha, porque desde ese momento no hay devolución)
export function cursoCompleto({ nombre, plan, url, cuando, nModulos, siguiente }) {
  const negocio = plan === 'negocio';
  const fecha = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(cuando));
  return {
    asunto: 'Ya tienes El método Claude completo',
    html: marco({
      kicker: 'Curso completo',
      titulo: `${hola(nombre)}: ya tienes los ${nModulos} módulos`,
      resumen: 'Todo el curso, la biblioteca de 100 prompts y las actualizaciones.',
      cuerpo: [
        p(`Desde hoy tienes todo El método Claude: los ${nModulos} módulos, la biblioteca de 100 prompts y las actualizaciones que vayan saliendo.`),
        boton('Seguir con el curso', url),
        p(`Sigue con el módulo 02, «${esc(siguiente)}». Al terminar el 04, Claude estará conectado a tu correo y tus documentos y sabrá cómo trabaja tu negocio.`),
        negocio ? p('Tus 12 proyectos del plan Negocio te llegan a este correo en menos de 24 horas.') : '',
        separador,
        nota(`Abriste el curso completo el ${fecha} (hora de Madrid). Como te indicamos antes de hacerlo, desde ese momento ya no se puede pedir la devolución (artículo 103.m de la Ley General para la Defensa de los Consumidores y Usuarios).`),
      ].join(''),
    }),
  };
}

// Al día siguiente de la compra: los primeros pasos. Si aún no ha abierto el curso completo, se lo recuerda en su sitio.
export function bienvenida({ nombre, url, modulos, completo = true }) {
  const [m1, m2, m3, m4] = modulos;
  const siguientes = [`<strong>Módulo 02 · ${esc(m2)}</strong>`, `<strong>Módulo 03 · ${esc(m3)}</strong>`, `<strong>Módulo 04 · ${esc(m4)}</strong>`];
  return {
    asunto: 'Tu primera semana con Claude, paso a paso',
    html: marco({
      kicker: 'El método Claude · primera semana',
      titulo: `${hola(nombre)}: esta semana Claude empieza a trabajar para ti`,
      resumen: 'El orden que mejor funciona para la primera semana.',
      cuerpo: [
        p('El curso rinde más si lo sigues en orden. Empieza por aquí:'),
        lista(['<strong>Empezar aquí</strong>: lo que vas a montar y lo que necesitas.', `<strong>Módulo 01 · ${esc(m1)}</strong>`]),
        p(completo ? 'Y sigue con estos tres, que son la base de todo lo demás:' : 'Cuando lo tengas claro, abre el curso completo desde tu página y sigue con estos tres, que son la base de todo lo demás:'),
        lista(siguientes),
        p('Al terminarlos, Claude estará conectado a tu correo y tus documentos y sabrá cómo trabaja tu negocio. Desde ahí, cada módulo es una tarea menos: tu web, tus clientes, tus presupuestos, tus facturas.'),
        boton('Seguir con el curso', url),
        p('Si te atascas en algún paso, respóndeme con una captura y te digo cómo seguir.'),
      ].join(''),
    }),
  };
}

// ---------- Llamada de 45 minutos (Calendly) ----------

export function citaConfirmada({ nombre, inicio, tz, joinUrl, cancelUrl, rescheduleUrl }) {
  const c = cuandoCita(inicio, tz);
  return {
    asunto: `Llamada reservada: ${c.largo}`,
    html: marco({
      kicker: 'Llamada de 45 minutos',
      titulo: `${hola(nombre)}: el ${c.largo} vemos qué puede hacer Claude por tu negocio`,
      resumen: `45 minutos por Google Meet, el ${c.largo} (${c.zona}).`,
      cuerpo: [
        p(`Son 45 minutos por Google Meet, el <strong>${c.largo}</strong> (${c.zona}). Sales con las tres tareas que más te compensa automatizar y lo que costaría montarlas, y después te lo mando por escrito.`),
        joinUrl ? boton('Entrar a la llamada', joinUrl) : p('El enlace de Google Meet está en la invitación de Calendly que te ha llegado.'),
        p('<strong>Para sacarle todo el partido</strong>, apunta antes las tres tareas que más horas te quitan cada semana y cuánto tiempo te lleva cada una.'),
        p('Si después quieres que lo montemos juntos, estos 50&nbsp;€ se descuentan del precio de la implantación.'),
        separador,
        (rescheduleUrl || cancelUrl) ? nota(`¿Te viene mal a esa hora? ${rescheduleUrl ? enlace('Cambia la hora', rescheduleUrl) : ''}${rescheduleUrl && cancelUrl ? ' o ' : ''}${cancelUrl ? enlace('cancela la llamada', cancelUrl) : ''}.`) : '',
        nota('Te la recuerdo el día antes y una hora antes.'),
      ].join(''),
    }),
  };
}

export function citaRecordatorio({ tipo, nombre, inicio, tz, joinUrl, rescheduleUrl }) {
  const c = cuandoCita(inicio, tz);
  const dia = tipo === '24h';
  return {
    asunto: dia ? `Mañana a las ${c.hora}: tu plan para automatizar tu negocio` : `En una hora: tu llamada de las ${c.hora}`,
    html: marco({
      kicker: dia ? 'Recordatorio · mañana' : 'Recordatorio · en una hora',
      titulo: dia ? `${hola(nombre)}: mañana a las ${c.hora} diseñamos tu plan` : `${hola(nombre)}: en una hora empezamos`,
      resumen: `Llamada de 45 minutos por Google Meet, el ${c.largo} (${c.zona}).`,
      cuerpo: [
        p(dia ? `Nos vemos el <strong>${c.largo}</strong> (${c.zona}) por Google Meet.` : `A las <strong>${c.hora}</strong> (${c.zona}), por Google Meet.`),
        joinUrl ? boton('Entrar a la llamada', joinUrl) : p('El enlace de Google Meet está en la invitación de Calendly.'),
        dia
          ? p('Trae apuntadas las tres tareas que más horas te quitan cada semana. Con eso, en 45 minutos salimos con un plan concreto.')
          : p('Ten a mano tu lista de tareas. Si quieres enseñarme algo en pantalla, déjalo abierto y lo vemos juntos.'),
        dia && rescheduleUrl ? nota(`¿Te ha surgido algo? ${enlace('Cambia la hora aquí', rescheduleUrl)}.`) : '',
      ].join(''),
    }),
  };
}

// Llamada pagada con Stripe (enlace antiguo, ya desactivado): aquí la fecha aún no está fijada
export function llamadaPagada({ nombre }) {
  return {
    asunto: 'Tu llamada de 45 minutos está reservada',
    html: marco({
      kicker: 'Llamada de 45 minutos',
      titulo: `${hola(nombre)}: vamos a ver qué puede hacer Claude por tu negocio`,
      resumen: 'Te escribo en menos de 24 horas para fijar el día.',
      cuerpo: [
        p('Te escribo en menos de 24 horas desde este correo para fijar el día. Son 45 minutos por videollamada.'),
        p('<strong>Para sacarle todo el partido</strong>, apunta antes las tres tareas que más horas te quitan cada semana y cuánto tiempo te lleva cada una.'),
        p('Sales con las tres que más te compensa automatizar y lo que costaría montarlas. Si después quieres que lo montemos juntos, estos 50&nbsp;€ se descuentan del precio de la implantación.'),
        separador,
        nota('¿Necesitas algo antes? Responde a este correo.'),
      ].join(''),
    }),
  };
}

// ---------- Guías gratis y boletín ----------

// nombre: va detrás de «Tu guía: …». titular: lo que va a conseguir. promesa: lo que hay dentro (sale de la propia guía).
export const GUIAS = {
  'reel-hiperrealista': { ruta: '/videos-ugc', nombre: 'Aprende a crear vídeos UGC con influencers IA', url: 'reel-hiperrealista-con-claude.html', titular: 'Tu primer vídeo UGC con un influencer IA empieza hoy', promesa: 'Del guion al vídeo final con tu influencer IA, paso a paso: imagen, vídeo, voz, subtítulos y sonido.' },
  'agente-creador-reels': { ruta: '/sistema-videos-ugc', nombre: 'Monta un sistema que crea vídeos UGC automáticamente por ti', url: 'agente-creador-reels-claude.html', titular: 'Despierta con tu vídeo listo para publicar', promesa: 'Mientras duermes, el sistema escribe el guion, genera el vídeo y lo monta. Por la mañana solo revisas y publicas.' },
  hooks: { ruta: '/hooks', nombre: '8 fórmulas para escribir hooks que paren el scroll', url: 'hooks.html', titular: 'Tus próximos reels van a parar el scroll', promesa: 'Las fórmulas que mejor me han funcionado en reels, con ejemplos para copiar y una plantilla para tu próximo vídeo.' },
  anzuelo: { ruta: '/anzuelo', nombre: 'Cómo escribir hooks que paren el scroll', url: 'anzuelo.html', titular: 'Tus próximos reels van a parar el scroll', promesa: 'Cómo escribir los primeros 3 segundos de cada reel: 8 patrones, ejemplos reales y una plantilla para copiar y pegar.' },
  brujula: { ruta: '/brujula', nombre: 'Qué métricas miran los creadores que crecen', url: 'brujula.html', titular: 'Vas a saber si tu cuenta crece de verdad', promesa: 'Las 3 métricas que importan, las 5 que son vanidad y un ritual semanal de 15 minutos para convertir números en decisiones.' },
  portero: { ruta: '/portero', nombre: 'Un agente que filtra tus DMs', url: 'portero.html', titular: 'Tus DMs, filtrados por un agente' },
  tienda: { ruta: '/tienda', nombre: 'Cómo monetizar sin sponsors', url: 'tienda.html', titular: 'Gana dinero con tu audiencia sin esperar a los sponsors' },
  voz: { ruta: '/voz', nombre: 'Cómo enseñar a Claude a hablar como tú', url: 'voz.html', titular: 'Claude, escribiendo con tu voz' },
  mensaje: { ruta: '/mensaje', nombre: 'Cómo validar un mensaje sin gastar en anuncios', url: 'mensaje.html', titular: 'Valida tu mensaje antes de gastar un euro' },
  conectar: { ruta: '/conectar', nombre: 'Cómo conectar dos herramientas sin integración', url: 'conectar.html', titular: 'Tus herramientas, hablando entre ellas' },
  vender: { ruta: '/vender', nombre: 'Cómo vender tu producto sin sponsors ni anuncios', url: 'vender.html', titular: 'Vende tu producto sin sponsors ni anuncios' },
  dms: { ruta: '/dms', nombre: 'Cómo automatizar tus DMs sin perder clientes', url: 'dms.html', titular: 'Tus DMs en automático, sin perder clientes' },
  agentes: { ruta: '/agentes', nombre: 'Por qué tu prompt funciona mejor dividido en tres', url: 'agentes.html', titular: 'Tus prompts, funcionando a la primera' },
  automatizar: { ruta: '/automatizar', nombre: 'Qué automatizar primero', url: 'automatizar.html', titular: 'Descubre qué te conviene automatizar primero' },
  metricas: { ruta: '/metricas', nombre: 'Las 3 métricas que importan y las 5 que mienten', url: 'metricas.html', titular: 'Mide solo lo que te hace crecer' },
  borrar: { ruta: '/borrar', nombre: 'Qué automatizaciones mantener y cuáles borrar', url: 'borrar.html', titular: 'Quédate con las automatizaciones que rinden' },
};
GUIAS.yate = GUIAS['reel-hiperrealista'];
GUIAS.madrugon = GUIAS['agente-creador-reels'];
// ?acceso=1 abre la guía sin volver a pedir el email, en cualquier dispositivo
const urlGuia = g => `${WEB}${g.url}?acceso=1`;

export function guia(source) {
  const g = GUIAS[source];
  if (!g) return boletin();
  return {
    asunto: `Tu guía: «${g.nombre}»`,
    html: marco({
      kicker: 'Guía gratis · rafa.prompts',
      titulo: g.titular,
      resumen: g.promesa || `Tu guía: ${g.nombre}.`,
      cuerpo: [
        p(g.promesa || `Aquí tienes la guía completa: «${esc(g.nombre)}».`),
        boton('Abrir la guía', urlGuia(g)),
        p('Una vez al mes te escribo con una guía nueva: lo que ya me funciona con Claude, listo para que lo copies.'),
        curso,
        separador,
        baja,
      ].join(''),
    }),
  };
}

// Alta en el boletín de la home (sin guía concreta)
export function boletin() {
  const tres = ['reel-hiperrealista', 'agente-creador-reels', 'hooks'].map(k => GUIAS[k]);
  return {
    asunto: 'Estás dentro: una guía nueva cada mes',
    html: marco({
      kicker: 'rafa.prompts',
      titulo: 'Estás dentro',
      resumen: 'Una guía nueva al mes y las tres que ya puedes leer.',
      cuerpo: [
        p('Una vez al mes te mando una guía nueva: lo que ya me funciona con Claude, explicado paso a paso para que lo copies.'),
        p('Mientras llega la siguiente, estas tres ya son tuyas:'),
        lista(tres.map(g => `${enlace(g.titular, urlGuia(g))}<br><span style="font-size:14px; color:#6B675F;">${g.promesa}</span>`), false),
        curso,
        separador,
        baja,
      ].join(''),
    }),
  };
}

// A los 4 días del alta, si no ha comprado: su precio personal durante unos días, solo desde su enlace
export function ofertaContacto({ source, url, importe, normal, hasta }) {
  const g = GUIAS[source];
  const vino = g ? `Hace unos días te llevaste la guía «${esc(g.nombre)}».` : 'Hace unos días te apuntaste a las guías de rafa.prompts.';
  return {
    asunto: `Tu precio para El método Claude: ${euros(importe).replace('&nbsp;', ' ')} hasta el ${hasta}`,
    html: marco({
      kicker: 'Solo para ti',
      titulo: `Automatiza tu negocio con Claude por ${euros(importe)}`,
      resumen: `El método Claude por ${euros(importe).replace('&nbsp;', ' ')} en vez de ${euros(normal).replace('&nbsp;', ' ')}, hasta el ${hasta}.`,
      cuerpo: [
        p(`${vino} Si quieres que Claude te quite trabajo en todo tu negocio, no solo en el contenido, te lo pongo fácil: hasta el <strong>${hasta}</strong>, El método Claude te sale por <strong>${euros(importe)}</strong> en vez de <s>${euros(normal)}</s>.`),
        boton(`Ver el curso por ${euros(importe)}`, url),
        p('Aprendes a automatizar tu web, tus clientes, tus presupuestos y tus facturas sin programar, con la biblioteca de 100 prompts. Empiezas con «Empezar aquí» y el módulo 01, y tienes 14 días de garantía.'),
        p('Este precio es solo tuyo y se aplica desde este enlace.'),
        separador,
        baja,
      ].join(''),
    }),
  };
}

// ---------- Avisos para Rafa ----------

const PLANES = {
  esencial: { nombre: 'El método Claude · Esencial' },
  negocio: { nombre: 'El método Claude · Negocio' },
  diagnostico: { nombre: 'Llamada de 45 minutos', hacer: 'Escríbele en menos de 24 horas para fijar el día de la llamada.' },
};
const fila = (k, v) => `<tr><td style="padding:6px 12px 6px 0; color:#6B675F; vertical-align:top; white-space:nowrap;">${k}</td><td style="padding:6px 0; color:#141311;">${v}</td></tr>`;
const tabla = filas => `<table style="width:100%; font-size:14px; line-height:1.5; border-collapse:collapse; margin:0 0 8px;">${filas.join('')}</table>`;

export function avisoVenta({ plan, email, nombre, importe, garantiaHasta }) {
  const pl = PLANES[plan] || PLANES.esencial;
  const hacer = pl.hacer || (plan === 'negocio'
    ? 'Cuando abra el curso completo te aviso para que le mandes los 12 proyectos.'
    : 'No tienes que hacer nada: ya tiene «Empezar aquí» y el módulo 01.');
  return {
    asunto: `Nueva venta · ${pl.nombre} · ${euros(importe).replace('&nbsp;', ' ')}`,
    html: marco({
      kicker: 'Nueva venta',
      titulo: `${esc(nombre || email)} ha comprado ${pl.nombre}`,
      resumen: hacer,
      cuerpo: [
        p(`<strong>${hacer}</strong>`),
        tabla([fila('Importe', euros(importe)), fila('Email', esc(email)), fila('Cuándo', ahoraMadrid()), ...(garantiaHasta ? [fila('Garantía', `hasta el ${garantiaHasta}, mientras no abra el curso completo`)] : [])]),
      ].join(''),
    }),
  };
}

export function avisoCompleto({ plan, email, nombre }) {
  const negocio = plan === 'negocio';
  const hacer = negocio ? 'Mándale los 12 proyectos en menos de 24 horas.' : 'No tienes que hacer nada: su garantía ha terminado.';
  return {
    asunto: `Curso completo abierto · ${email}`,
    html: marco({
      kicker: 'Curso completo abierto',
      titulo: `${esc(nombre || email)} se queda el curso`,
      resumen: hacer,
      cuerpo: [
        p(`<strong>${hacer}</strong>`),
        tabla([fila('Plan', (PLANES[plan] || PLANES.esencial).nombre), fila('Email', esc(email)), fila('Cuándo', ahoraMadrid())]),
      ].join(''),
    }),
  };
}

export function avisoContacto({ email, source, ip, userAgent }) {
  const g = GUIAS[source];
  const origen = g ? `${g.ruta}, «${esc(g.nombre)}»` : source === 'index' ? 'el boletín de la portada' : `«${esc(source)}»`;
  return {
    asunto: `Nuevo contacto · ${g ? g.ruta : source === 'index' ? 'boletín' : source} · ${email}`,
    html: marco({
      kicker: 'Nuevo contacto',
      titulo: esc(email),
      resumen: `Se ha apuntado desde ${origen.replace(/<[^>]+>/g, '')}.`,
      cuerpo: [
        p(`Se ha apuntado desde ${origen} y ya le ha llegado el correo con el enlace.`),
        tabla([fila('Guía', g ? enlace(esc(g.nombre), urlGuia(g)) : esc(source)), fila('Cuándo', ahoraMadrid()), fila('IP', esc(ip || '-')), fila('Navegador', esc((userAgent || '-').slice(0, 160)))]),
      ].join(''),
    }),
  };
}
