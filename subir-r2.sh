#!/usr/bin/env bash
# =========================================================
# Sube los medios a un bucket de Cloudflare R2
# ---------------------------------------------------------
#   ./subir-r2.sh                → sube todo lo que falte
#   ./subir-r2.sh --todo         → vuelve a subirlo todo
#
# Después, pega la URL que imprime al final en js/config.js:
#     cdn: "https://pub-xxxxx.r2.dev",
# y la web servirá los vídeos desde Cloudflare en vez de
# desde tu hosting. Ancho de banda de salida: gratis.
# =========================================================
set -euo pipefail
cd "$(dirname "$0")"

BUCKET="${BUCKET:-isidro-gonzalez-media}"
CARPETAS=(previews posters videos-web fotos-web)
FORZAR=false
[[ "${1:-}" == "--todo" ]] && FORZAR=true

# ---------- Comprobaciones ----------
if ! command -v npx >/dev/null; then
  echo "✗ Necesitas Node instalado."; exit 1
fi

echo "· Comprobando sesión de Cloudflare…"
if ! npx wrangler whoami >/dev/null 2>&1; then
  echo "✗ No has iniciado sesión. Ejecuta primero:  npx wrangler login"
  exit 1
fi

# ---------- Bucket ----------
if npx wrangler r2 bucket info "$BUCKET" >/dev/null 2>&1; then
  echo "· El bucket «$BUCKET» ya existe."
else
  echo "· Creando el bucket «$BUCKET»…"
  npx wrangler r2 bucket create "$BUCKET" --location weur
  echo "· Activando el acceso público…"
  npx wrangler r2 bucket dev-url enable "$BUCKET" --force
fi

# ---------- Subida ----------
LISTA=".r2-subidos"
touch "$LISTA"
$FORZAR && : > "$LISTA"

total=0
subidos=0

for carpeta in "${CARPETAS[@]}"; do
  [[ -d "$carpeta" ]] || continue
  while IFS= read -r -d '' archivo; do
    total=$((total + 1))
    clave="${archivo#./}"

    # Ya subido y sin cambios → lo saltamos
    firma="$clave|$(stat -f %z "$archivo")"
    if grep -Fqx "$firma" "$LISTA"; then continue; fi

    case "${archivo##*.}" in
      mp4)          tipo="video/mp4" ;;
      jpg|jpeg)     tipo="image/jpeg" ;;
      png)          tipo="image/png" ;;
      webp)         tipo="image/webp" ;;
      *)            tipo="application/octet-stream" ;;
    esac

    printf "  ↑ %s … " "$clave"
    npx wrangler r2 object put "$BUCKET/$clave" \
      --file "$archivo" \
      --content-type "$tipo" \
      --cache-control "public, max-age=31536000, immutable" \
      --remote >/dev/null
    echo "ok"
    echo "$firma" >> "$LISTA"
    subidos=$((subidos + 1))
  done < <(find "./$carpeta" -type f ! -name '.*' -print0)
done

echo
echo "✓ $subidos archivos nuevos subidos (de $total en total)."
echo
echo "Ahora copia la URL pública del bucket en js/config.js:"
echo
npx wrangler r2 bucket dev-url get "$BUCKET" 2>/dev/null || \
  echo "  (mírala en el panel de Cloudflare → R2 → $BUCKET → Settings → Public access)"
echo
echo '    cdn: "https://pub-XXXXXXXX.r2.dev",'
echo
