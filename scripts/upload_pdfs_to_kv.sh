#!/usr/bin/env bash
# Sube los 18 PDFs del curso a la KV STORE del worker rafa-prompts-api.
# Cada PDF se guarda con la clave `file:<slug>` (formato esperado por el worker).
#
# Prereqs:
#   - CLOUDFLARE_API_TOKEN exportado (con permiso Workers KV Edit)
#   - Los PDFs ya generados en course/pdfs/ (corre `node scripts/generate_pdfs.mjs` antes)
#
# Uso:
#   export CLOUDFLARE_API_TOKEN=...
#   bash scripts/upload_pdfs_to_kv.sh
set -euo pipefail

NS_ID="b6dd7fed4d23474bbca1a23f101a80b4"   # STORE namespace (wrangler.toml)
PDF_DIR="$(cd "$(dirname "$0")/.." && pwd)/course/pdfs"

# Auth: usa CLOUDFLARE_API_TOKEN si está, si no usa la sesión OAuth de wrangler login
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  if ! npx wrangler whoami >/dev/null 2>&1; then
    echo "✘ no auth: exporta CLOUDFLARE_API_TOKEN o ejecuta 'npx wrangler login'" >&2
    exit 1
  fi
fi

# Lista de PDFs: la guía, los módulos en el orden de course/modulos.json (fuente única) y la biblioteca
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILES=("00-empezar-aqui")
while IFS= read -r f; do FILES+=("$f"); done < <(node -e '
  const o = require(process.argv[1]);
  o.modulos.forEach((m, i) => console.log(`modulo-${String(i + 1).padStart(2, "0")}-${m.slug}`));
' "$ROOT/course/modulos.json")
FILES+=("prompt-library-100")

cd "$(dirname "$0")/../api"

for slug in "${FILES[@]}"; do
  src="$PDF_DIR/$slug.pdf"
  if [ ! -f "$src" ]; then
    echo "✘ no encontrado: $src" >&2
    exit 1
  fi
  echo "→ subiendo file:$slug ($(du -h "$src" | cut -f1))"
  npx wrangler kv key put "file:$slug" \
    --path "$src" \
    --namespace-id "$NS_ID" \
    --remote >/dev/null
done

echo ""
echo "✓ ${#FILES[@]} PDFs subidos a KV STORE"
echo ""
echo "next: redespliega el worker para cargar el nuevo PDF_CATALOG"
echo "  cd api && npx wrangler deploy"
