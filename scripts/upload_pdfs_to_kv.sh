#!/usr/bin/env bash
# Sube los 12 PDFs del curso a la KV STORE del worker rafa-prompts-api.
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

# Map slug -> filename (slug coincide con el nombre del PDF sin .pdf)
FILES=(
  "00-empezar-aqui"
  "modulo-01-pensar-en-claude"
  "modulo-02-claude-md"
  "modulo-03-skills-agentes"
  "modulo-04-pipelines-reales"
  "modulo-05-orquestacion"
  "modulo-06-iteracion-medida"
  "modulo-07-claude-code-arranque"
  "modulo-08-skills-subagentes-mcp"
  "modulo-09-sistema-autonomo"
  "modulo-10-vivir-con-sistema-ia"
  "prompt-library-100"
)

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
echo "✓ 12 PDFs subidos a KV STORE"
echo ""
echo "next: redespliega el worker para cargar el nuevo PDF_CATALOG"
echo "  cd api && npx wrangler deploy"
