// Parámetros de la sesión de Stripe Checkout del curso.
//
// Con STRIPE_MANAGED_PAYMENTS=on (cuenta de Stripe de Rafa Prompts) se usa Managed Payments:
// Stripe es el comerciante registrado, calcula y declara el IVA y emite la factura. Por eso en ese
// modo no se envían automatic_tax, tax_id_collection ni invoice_creation (Stripe los rechaza) y la
// sesión es `embedded_page`. Tampoco admite custom_text. Sin esa variable se mantiene la integración anterior.

export const PLANES = {
  esencial: 'STRIPE_PRICE_ID',
  negocio: 'STRIPE_PRICE_NEGOCIO',
};

// Importe con IVA de cada plan, para el píxel y la API de conversiones
export const IMPORTE = { esencial: 149, negocio: 249 };

// Precio de lanzamiento de Esencial: solo existe mientras no pasa LANZAMIENTO_HASTA (ISO, UTC).
// Lo decide el servidor, así que la fecha de fin es real aunque alguien cambie el reloj de su móvil.
export function lanzamiento(env, ahora = Date.now()) {
  const hasta = Date.parse(env.LANZAMIENTO_HASTA || '');
  if (!env.STRIPE_PRICE_LANZAMIENTO || !hasta || ahora >= hasta) return null;
  return { price: env.STRIPE_PRICE_LANZAMIENTO, importe: Number(env.LANZAMIENTO_IMPORTE), hasta };
}

// oferta: la personal de los 4 días ({ hasta }), ya validada por el Worker. Usa el mismo precio que el lanzamiento.
export function checkoutParams(env, body = {}, metadata = {}, ahora = Date.now(), oferta = null) {
  const pedido = String(body.plan || 'esencial').toLowerCase();
  // solo se vende un plan si su precio está configurado; si no, se usa Esencial
  const plan = Object.hasOwn(PLANES, pedido) && env[PLANES[pedido]] ? pedido : 'esencial';
  const managed = env.STRIPE_MANAGED_PAYMENTS === 'on';
  const personal = oferta && env.STRIPE_PRICE_LANZAMIENTO && ahora < Date.parse(oferta.hasta)
    ? { price: env.STRIPE_PRICE_LANZAMIENTO, importe: Number(env.LANZAMIENTO_IMPORTE), hasta: Date.parse(oferta.hasta), tipo: 'oferta' } : null;
  const general = lanzamiento(env, ahora);
  // si valen las dos, la que dura más (la sesión caduca con ella)
  const lanz = plan !== 'esencial' ? null : [general, personal].filter(Boolean).sort((a, b) => b.hasta - a.hasta)[0] || null;
  const importe = lanz ? lanz.importe : IMPORTE[plan];
  const params = {
    ui_mode: managed ? 'embedded_page' : 'embedded',
    mode: 'payment',
    line_items: [{ price: lanz ? lanz.price : env[PLANES[plan]], quantity: 1 }],
    customer_creation: 'always',
    billing_address_collection: 'auto',
    allow_promotion_codes: true,
    // v = importe cobrado, para que la página de gracias mande a Meta el valor real
    return_url: `${env.SUCCESS_URL}${plan === 'negocio' ? '&plan=negocio' : ''}&v=${importe}`,
    locale: 'es',
    // el pago integrado con el fondo crema de la web (sin el rectángulo blanco) y el botón en terracota
    branding_settings: { background_color: '#F2EFE7', button_color: '#B95A39', border_style: 'rounded' },
    metadata: { ...metadata, plan, ...(lanz ? { precio: lanz.tipo || 'lanzamiento' } : {}), ...(lanz && lanz.tipo === 'oferta' ? { oferta: String(body.oferta || '').slice(0, 40) } : {}) },
  };
  // Con el precio de lanzamiento, la sesión caduca cuando acaba la oferta (Stripe pide entre 30 min y 24 h)
  if (lanz) {
    const s = Math.floor(ahora / 1000);
    params.expires_at = Math.min(Math.max(Math.floor(lanz.hasta / 1000), s + 31 * 60), s + 23 * 3600);
  }
  if (managed) {
    params.managed_payments = { enabled: true };
  } else {
    // Managed Payments tampoco admite custom_text
    params.custom_text = { submit: { message: 'Acceso inmediato. Recibirás los PDFs por email.' } };
    params.automatic_tax = { enabled: true };
    params.invoice_creation = { enabled: true };
    // la factura sale a nombre de la empresa con su NIF (la web promete «Factura para tu empresa»)
    params.tax_id_collection = { enabled: true };
  }
  return { params, plan, managed, importe };
}
