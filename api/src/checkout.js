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

export function checkoutParams(env, body = {}, metadata = {}) {
  const pedido = String(body.plan || 'esencial').toLowerCase();
  // solo se vende un plan si su precio está configurado; si no, se usa Esencial
  const plan = Object.hasOwn(PLANES, pedido) && env[PLANES[pedido]] ? pedido : 'esencial';
  const managed = env.STRIPE_MANAGED_PAYMENTS === 'on';
  const params = {
    ui_mode: managed ? 'embedded_page' : 'embedded',
    mode: 'payment',
    line_items: [{ price: env[PLANES[plan]], quantity: 1 }],
    customer_creation: 'always',
    billing_address_collection: 'auto',
    allow_promotion_codes: true,
    return_url: plan === 'negocio' ? `${env.SUCCESS_URL}&plan=negocio` : env.SUCCESS_URL,
    locale: 'es',
    metadata: { ...metadata, plan },
  };
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
  return { params, plan, managed };
}
