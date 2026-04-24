# rafa.prompts · landing

Sitio estático con form que manda el email a un Telegram bot vía Cloudflare Worker.

## Estructura

```
rafa-prompts-web/
├── index.html           ← landing principal
├── yate.html            ← guía 01 (contenido ex-Notion YATE)
├── madrugon.html        ← guía 02 (contenido ex-Notion MADRUGÓN)
├── styles.css           ← sistema de diseño editorial
├── app.js               ← scroll progress, signup form, copy-code, TOC
├── _redirects           ← rewrites para URLs legacy
├── _headers             ← security headers
└── worker/
    ├── subscribe.js     ← Cloudflare Worker que recibe el form y manda a Telegram
    ├── wrangler.toml
    └── package.json
```

## Deploy : 5 pasos

### 1 · Crear el bot de Telegram

1. En Telegram busca **@BotFather** → `/newbot`
2. Elige nombre público, ej. `Rafa Prompts`
3. Elige username, ej. `@rafa_prompts_bot` (tiene que acabar en `_bot`)
4. BotFather te da el token : copia algo como `123456:ABCdef...`

### 2 · Obtener tu Chat ID

1. En Telegram busca **@userinfobot** → `/start`
2. Te responde con tu ID (ej. `987654321`) : cópialo
3. Abre tu bot (el que creaste) y pulsa `/start` para habilitarlo

### 3 · Desplegar el Worker

```bash
cd worker
npm install
npx wrangler login     # primera vez, autoriza via navegador
npx wrangler secret put TELEGRAM_BOT_TOKEN
# pega el token cuando pregunte
npx wrangler secret put TELEGRAM_CHAT_ID
# pega tu chat id
npx wrangler deploy
# al final te imprime la URL del Worker, ej:
# https://rafa-prompts-subscribe.<tu-cuenta>.workers.dev
```

Copia esa URL.

### 4 · Configurar la URL en el frontend

Edita `app.js` línea 25 y sustituye:

```js
const SUBSCRIBE_URL = 'REPLACE_WITH_WORKER_URL';
```

Por la URL del Worker del paso anterior.

### 5 · Desplegar la landing (Cloudflare Pages)

Opción A, drag-drop rápido :

1. Ve a [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create application** → **Pages** → **Upload assets**
2. Nombra el proyecto `rafa-prompts-web`
3. Arrastra la carpeta (solo la raíz, sin `worker/`, o con ella, da igual : Pages solo sirve los HTML)
4. Deploy → te da URL `https://rafa-prompts-web.pages.dev`

Opción B, git :

1. `git init && git add . && git commit -m "initial"`
2. Crea repo Github vacío
3. `git remote add origin ... && git push -u origin main`
4. En Cloudflare Pages : **Connect to Git** → repo → deploy

### 6 · Probar

1. Abre `https://rafa-prompts-web.pages.dev`
2. Mete tu email en el form → envía
3. Te llega mensaje en Telegram. Si no llega : revisa logs del Worker (`wrangler tail`)

### 7 · Conectar dominio propio (opcional, luego)

1. Compra dominio en **Cloudflare Registrar** (ej. `rafaprompts.com`)
2. En Cloudflare Pages → proyecto → **Custom domains** → add
3. DNS se configura automático (5-15 min de propagación)

### 8 · Actualizar Manychat

En los 2 flows (YATE y MADRUGÓN) cambia la URL del enlace final por:

- YATE : `https://rafa-prompts-web.pages.dev/yate.html` (o `https://rafaprompts.com/yate.html` si ya tienes dominio)
- MADRUGÓN : `https://rafa-prompts-web.pages.dev/madrugon.html`

## Cambios frecuentes

- **Editar contenido de una guía** : edita `yate.html` o `madrugon.html` directamente → push → auto-deploy
- **Añadir nueva guía** : copia `yate.html` como base, renombra, edita, añade card en `index.html`
- **Cambiar estilos globales** : `styles.css` → push

## Troubleshooting

### El form no envía nada

- Abre DevTools → Network → busca el POST → mira el error
- Si "CORS" : añade el dominio en el Worker (`env.ALLOWED_ORIGIN`) o deja `*`
- Si 401 : el token Telegram es inválido, regenera con BotFather y `wrangler secret put`

### No recibo mensajes Telegram aunque Worker devuelve 200

- Pulsa `/start` en tu bot (tienes que haberle hablado primero)
- Comprueba que el `chat_id` sea el tuyo, no el del bot

### El copy-button de código no funciona

- Requiere HTTPS (Clipboard API). En `localhost` y `pages.dev` funciona. En `file://` no.
