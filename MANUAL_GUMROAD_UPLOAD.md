# Manual : subir los 8 PDFs a Gumroad

Si el script `scripts/create_gumroad_product.mjs` no consigue subir los archivos por API (el endpoint de carga de contenido de Gumroad no es estable), sube los 8 PDFs a mano. Tarda 2 minutos.

## Pasos

1. Abrir el dashboard de Gumroad (sesión como "Rafa : Product Designer & Photographer")
2. Entrar en el producto "El Método Claude"
3. Ir a la pestaña **Content**
4. Arrastrar y soltar estos 8 ficheros en el orden siguiente:

```
/Users/helloimrafa/Projects/rafa-prompts-web/course/pdfs/00-empezar-aqui.pdf
/Users/helloimrafa/Projects/rafa-prompts-web/course/pdfs/modulo-01-pensar-en-claude.pdf
/Users/helloimrafa/Projects/rafa-prompts-web/course/pdfs/modulo-02-claude-md.pdf
/Users/helloimrafa/Projects/rafa-prompts-web/course/pdfs/modulo-03-skills-agentes.pdf
/Users/helloimrafa/Projects/rafa-prompts-web/course/pdfs/modulo-04-pipelines-reales.pdf
/Users/helloimrafa/Projects/rafa-prompts-web/course/pdfs/modulo-05-orquestacion.pdf
/Users/helloimrafa/Projects/rafa-prompts-web/course/pdfs/modulo-06-iteracion-medida.pdf
/Users/helloimrafa/Projects/rafa-prompts-web/course/pdfs/prompt-library-50.pdf
```

5. Guardar y pulsar **Publish** si el producto no está ya publicado.

## Thumbnail

Si el thumbnail tampoco subió por API:

- Subir manualmente `/Users/helloimrafa/Projects/rafa-prompts-web/assets/img/metodo-cover.png` como **cover image** del producto.

## Verificar

Abrir la URL pública del producto (la tienes en `scripts/create_gumroad_product.output.json`). Debe mostrar:
- El cover con el diseño del método
- Los 6 módulos en la descripción
- Precio 149€
- Botón de compra activo
