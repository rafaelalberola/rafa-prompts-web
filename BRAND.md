# rafa.prompts · sistema de diseño

Tokens de marca. Aplican a : landing, cursos, PDFs, lead magnets, cover images de reels, subtítulos, cualquier pieza pública.

## Paleta

Cuatro colores, solo cuatro.

| Token | Hex | Uso |
|---|---|---|
| `--bg` | `#0A0A0A` | Fondo dark (hero, covers, end cards) |
| `--bg-cream` | `#F2EFE7` | Fondo claro (landing default, PDFs, sales page) |
| `--ink` | `#111111` | Texto principal sobre fondo claro |
| `--accent` | `#DA7756` | Único acento. Destacar palabras, botones CTA, logo `.prompts`, rules |

Tres tonos de ink para jerarquía (derivados de `--ink`) :
- `--ink` `#111111` : body principal
- `--ink-soft` `#5a5a5a` : subtítulos y texto secundario
- `--ink-mute` `#999999` : mono labels, meta info

## Tipografía

Tres familias, cada una con un rol estricto.

| Familia | Pesos | Uso |
|---|---|---|
| **Archivo** | 800, 900 | Display. Todos los headlines, hero, títulos de módulo, CTAs |
| **Newsreader** | 400 italic, 500 italic | Remates editoriales, frases de relieve, subtítulos italic en hero |
| **IBM Plex Mono** | 400, 600 | Labels técnicos, counters, kickers, meta info, código |

Nunca usar otras fuentes. Si un bloque requiere humanidad, usar Newsreader italic. Si requiere estructura, Archivo. Si requiere contexto técnico, Mono.

### Escala tipográfica

Ratio 1.333 (major third). Clamps responsive.

| Nivel | Móvil | Desktop | Uso |
|---|---|---|---|
| Hero | 44px | 124px | h1 principal |
| Display | 36px | 72px | h1 páginas interiores |
| H2 | 28px | 48px | Secciones |
| H3 | 22px | 32px | Sub-secciones |
| Body | 17px | 18px | Párrafos |
| Small | 14px | 15px | Meta, footnotes |
| Mono | 12px | 13px | Labels, counters |

## Assets visuales

Ubicación : `/assets/img/`

| Archivo | Uso |
|---|---|
| `logo.svg` | Wordmark principal : "rafa" ink + ".prompts" accent `#DA7756` |
| `logo-dark.svg` | Wordmark para fondos dark (cream + accent) |
| `logo-mark.svg` | Símbolo compacto (`./` accent sobre negro) : app icon, favicon scaling |
| `favicon.ico` | Multi-size (16/32/48) |
| `favicon-16.png`, `favicon-32.png` | Referencias específicas |
| `apple-touch-icon.png` | 180×180 iOS home screen |
| `og-image.png` | 1200×630 social share |
| `metodo-cover.png` | 1280×720 thumbnail curso Gumroad |
| `modulo-01-cover.png` … `modulo-06-cover.png` | 800×450 cada uno |
| `rafa-portrait.webp` | Foto personal para hero + sobre mí |

## Componentes reutilizables

Clases CSS definidas en `styles.css` :

- `.btn` : botón primary (ink bg, cream text) · variante `.btn.accent` (accent bg + ink text), `.btn.ghost`
- `.card` : cartera base · variantes `.card-paper`, `.card-ink`, `.card-accent`
- `.callout` : caja de aviso · variantes `.callout.warn`, `.callout.info`
- `.code-block` : pre con botón copiar · auto-instrumentado por `app.js`
- `.eyebrow` : kicker mono encima de titulares (accent color)
- `.progress` : barra accent arriba (scroll indicator, global)
- `.brand` : wordmark inline (logo en header)

## Tono y voz

Ver `/Users/helloimrafa/.claude/projects/-Users-helloimrafa-Projects-social-content/memory/feedback_lead_magnet_content_rules.md` y `feedback_course_writing_style.md`.

Resumen :

- **Nunca** : competidores, em-dash, costes €, jerga técnica, contenido denso
- **Siempre** : primera persona para bio, directo, pasos numerados, analogías cotidianas, feedback positivo

## Uso en plataformas externas

- **Gumroad** : thumbnail = `metodo-cover.png` · descripción usa tipografía Archivo (via CSS fallback system-ui si no cargan fonts) · acento `#DA7756` consistente
- **PDFs del curso** : header con logo SVG + footer con `rafa.prompts · el método claude · {n} de {total}`
- **Reels** : subtítulos Archivo 800, spray filter SVG, highlight accent sweep left→right
- **Carruseles** : 3 templates disponibles en `briefs/reel_hyperrealistic/carousel_templates/` (del proyecto social content), usan el mismo sistema

## Principios no negociables

1. Máximo 4 colores en pantalla a la vez
2. Un solo acento (`#DA7756`) por pieza
3. Jerarquía tipográfica clara : una sola Archivo 900 por bloque
4. Mono para labels, nunca para párrafos
5. Newsreader italic solo para énfasis editorial, nunca para copy funcional
6. Spray filter SVG en todos los titulares (h1, h2, h3), nunca en body
