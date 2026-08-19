#!/usr/bin/env bash
# =========================================================
# Sube los medios a un bucket de Cloudflare R2
# ---------------------------------------------------------
#   ./subir-r2.sh                → sube todo lo que falte
#   ./subir-r2.sh --todo         → vuelve a subirlo todo
#
# Normalmente no hace falta llamarlo a mano: ./actualizar.sh
# lo lanza como parte del proceso completo.
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
A_LA_VEZ="${A_LA_VEZ:-6}"     # subidas simultáneas
FORZAR=false
[[ "${1:-}" == "--todo" ]] && FORZAR=true

# ---------- Comprobaciones ----------
if ! command -v node >/dev/null; then
  echo "✗ Necesitas Node instalado."; exit 1
fi

# Wrangler, resuelto UNA sola vez.
#
# Antes esto era `npx wrangler` dentro del bucle de subida, o sea una vez por
# archivo. Cada arranque de npx cuesta ~11 segundos (comprueba el registro de
# paquetes por la red antes de ejecutar nada), así que con 46 archivos se iban
# OCHO MINUTOS sin subir un solo byte. Con la copia local de node_modules cada
# llamada tarda 0,7 s: la misma tanda baja de ~8 min a unos 20 s.
if [[ -x "node_modules/.bin/wrangler" ]]; then
  WRANGLER="$PWD/node_modules/.bin/wrangler"
else
  echo "· Instalando wrangler en local (sólo la primera vez)…"
  npm install --silent
  WRANGLER="$PWD/node_modules/.bin/wrangler"
fi
export WRANGLER

echo "· Comprobando sesión de Cloudflare…"
if ! "$WRANGLER" whoami >/dev/null 2>&1; then
  echo "✗ No has iniciado sesión. Ejecuta primero:  ./node_modules/.bin/wrangler login"
  exit 1
fi

# ---------- Bucket ----------
if "$WRANGLER" r2 bucket info "$BUCKET" >/dev/null 2>&1; then
  echo "· El bucket «${BUCKET}» ya existe."
else
  echo "· Creando el bucket «${BUCKET}»…"
  "$WRANGLER" r2 bucket create "$BUCKET" --location weur
  echo "· Activando el acceso público…"
  "$WRANGLER" r2 bucket dev-url enable "$BUCKET" --force
fi
export BUCKET

# ---------- Qué falta por subir ----------
LISTA=".r2-subidos"
touch "$LISTA"
$FORZAR && : > "$LISTA"

PENDIENTES="$(mktemp)"
ACIERTOS="$(mktemp -d)"
trap 'rm -rf "$PENDIENTES" "$ACIERTOS"' EXIT

total=0
for carpeta in "${CARPETAS[@]}"; do
  [[ -d "$carpeta" ]] || continue
  while IFS= read -r -d '' archivo; do
    total=$((total + 1))
    clave="${archivo#./}"
    # La firma lleva el tamaño: si el archivo cambia, se vuelve a subir.
    firma="$clave|$(stat -f %z "$archivo")"
    grep -Fqx "$firma" "$LISTA" && continue
    printf '%s\t%s\n' "$archivo" "$firma" >> "$PENDIENTES"
  done < <(find "./$carpeta" -type f ! -name '.*' -print0)
done

faltan=$(wc -l < "$PENDIENTES" | tr -d ' ')
if [[ "$faltan" == "0" ]]; then
  echo "✓ No hay nada nuevo que subir ($total archivos ya en Cloudflare)."
  exit 0
fi

# ---------- Subida, varias a la vez ----------
# En serie, cada archivo espera a que termine el anterior aunque la conexión
# esté ociosa. De seis en seis se aprovecha el ancho de banda de subida.
echo "· Subiendo $faltan archivos nuevos (de $total), $A_LA_VEZ a la vez…"

subir_uno() {
  archivo="$1"
  firma="$2"
  clave="${archivo#./}"
  case "${archivo##*.}" in
    mp4)      tipo="video/mp4" ;;
    jpg|jpeg) tipo="image/jpeg" ;;
    png)      tipo="image/png" ;;
    webp)     tipo="image/webp" ;;
    *)        tipo="application/octet-stream" ;;
  esac

  registro="$ACIERTOS/$(echo "$clave" | shasum | cut -c1-16)"
  if "$WRANGLER" r2 object put "$BUCKET/$clave" \
       --file "$archivo" \
       --content-type "$tipo" \
       --cache-control "public, max-age=31536000, immutable" \
       --remote >"$registro.log" 2>&1; then
    # Cada subida anota su resultado en un archivo propio: así dos que van a
    # la vez no se pisan al escribir. Se juntan todos al final.
    echo "$firma" > "$registro"
    rm -f "$registro.log"
    echo "  ↑ $clave"
  else
    echo "  ✗ $clave — FALLÓ:"
    sed 's/^/       /' "$registro.log" | tail -4
  fi
}

# macOS trae bash 3.2, que no tiene `wait -n`. Se lanzan por tandas y se
# espera a que termine cada tanda entera: más simple y funciona en todas
# partes sin depender de la versión.
archivos=(); firmas=()
while IFS=$'\t' read -r a f; do
  archivos[${#archivos[@]}]="$a"
  firmas[${#firmas[@]}]="$f"
done < "$PENDIENTES"

i=0
n=${#archivos[@]}
while [ "$i" -lt "$n" ]; do
  k=0
  while [ "$k" -lt "$A_LA_VEZ" ] && [ "$i" -lt "$n" ]; do
    subir_uno "${archivos[$i]}" "${firmas[$i]}" &
    i=$((i + 1)); k=$((k + 1))
  done
  wait
done

# Sólo se dan por subidos los que de verdad han ido bien: si alguno falló,
# la próxima ejecución lo reintenta en vez de darlo por hecho.
cat "$ACIERTOS"/* >> "$LISTA" 2>/dev/null || true
subidos=$(ls -1 "$ACIERTOS" 2>/dev/null | wc -l | tr -d ' ')

echo
if [[ "$subidos" != "$faltan" ]]; then
  echo "⚠ Subidos $subidos de $faltan. Los que fallaron se reintentan si vuelves a lanzarlo."
  exit 1
fi
echo "✓ $subidos archivos nuevos subidos (de $total en total)."
