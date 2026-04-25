# Manychat: flows por keyword (rafa.prompts)

Cada reel publicado tiene una palabra clave única. Cuando alguien la comenta, Manychat detecta la palabra (case-insensitive, ignora tildes) y le envía el DM correspondiente con el link a la landing.

## Estado actual

| Keyword | Reel | Landing | Status |
|---|---|---|---|
| `YATE` | E01 yate (publicado 2026-04-23) | https://rafaprompts.com/yate.html | Activo |
| `MADRUGON` / `MADRUGÓN` | E02 madrugón (publicado 2026-04-23) | https://rafaprompts.com/madrugon.html | Activo |
| `ANZUELO` | E03 anzuelo (publicado scheduled 2026-04-27) | https://rafaprompts.com/anzuelo.html | **Pendiente crear flow** |
| `BRUJULA` / `BRÚJULA` | E04 brújula (publicado scheduled 2026-05-04) | https://rafaprompts.com/brujula.html | **Pendiente crear flow** |
| `PORTERO` | E05 portero (publicado scheduled 2026-05-11) | https://rafaprompts.com/portero.html | **Pendiente crear flow** |
| `TIENDA` | E06 tienda (publicado scheduled 2026-05-18) | https://rafaprompts.com/tienda.html | **Pendiente crear flow** |

## Cómo crear un flow nuevo (5 minutos por keyword)

1. Manychat → Automation → New flow
2. Nombre interno: `KW_<KEYWORD>` (ej: `KW_ANZUELO`)
3. Trigger: **Keyword** → palabra exacta + variantes con/sin tilde
4. Action 1: **Send Message** con el siguiente template:

### Plantilla de mensaje (sustituir `{{KEYWORD}}` y `{{LANDING_URL}}`)

```
¡Aquí va!

📎 {{LANDING_URL}}

Es la guía completa, paso a paso, gratis. Si te sirve, dímelo. Si tienes dudas, escríbeme aquí mismo.

— Rafa
```

5. Action 2: **Add Tag** → `from_reel:{{keyword_lowercase}}` (para segmentar luego)
6. Save + Activate

## Variantes a configurar por keyword

Manychat considera coincidencia exacta a menos que añadas alternates. Para que también activen tildes, mayúsculas/minúsculas y typos comunes:

| Keyword principal | Alternates a añadir |
|---|---|
| `YATE` | yate |
| `MADRUGON` | MADRUGÓN, madrugon, madrugón |
| `ANZUELO` | anzuelo |
| `BRUJULA` | BRÚJULA, brújula, brujula |
| `PORTERO` | portero |
| `TIENDA` | tienda |

## Verificación post-creación

Antes de publicar el reel correspondiente:
1. Comenta tú mismo la palabra clave en cualquier post
2. Confirma que recibes el DM en menos de 15 segundos
3. Confirma que el link de la landing abre y carga (HTTP 200)
4. Confirma que la landing tiene el cross-link al curso (no es solo content gratis)

## Métrica a vigilar (semanal)

Manychat te muestra "Subscriptions" por flow. La métrica clave es:

- **Tasa de activación**: keywords activados / vistas del reel
- Target: >2% (si tu reel tiene 10.000 vistas, esperas >200 activaciones)

Si por debajo de 1%, el problema es la CTA del reel (palabra difícil, instrucción no clara). No el contenido.

## Webhook a la base de datos (opcional, fase 2)

Cuando los 6 flows estén funcionando, conviene enviar cada nuevo subscriber a un webhook propio (Cloudflare Worker) para:
- Registrar el lead en una base propia (no depender de Manychat)
- Disparar email follow-up vía Brevo a los 3 días
- Medir conversión real keyword → compra del curso

Endpoint a crear: `POST https://rafa-prompts-api.prxystudio.workers.dev/lead`. Por hacer cuando Manychat funcione consistentemente con los 6 keywords.
