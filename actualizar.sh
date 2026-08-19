#!/usr/bin/env bash
# =========================================================
# ACTUALIZAR LA WEB — un solo comando
# ---------------------------------------------------------
# Metes vídeos nuevos en videos/CATEGORIA/ (o fotos en
# fotos/CATEGORIA/) y lanzas:
#
#     ./actualizar.sh
#
# Hace todo lo demás por ti:
#   1. Comprime los vídeos para web y saca las miniaturas
#   2. Regenera js/datos.js
#   3. Sube a Cloudflare sólo lo que falte
#   4. Guarda los cambios y publica
#   5. Espera y comprueba que la web ya sirve lo nuevo
#
# Opciones:
#   ./actualizar.sh --probar   Hace todo menos publicar, y abre
#                              la web en local para revisarla
#   ./actualizar.sh -m "texto" Mensaje propio para el historial
# =========================================================
set -euo pipefail
cd "$(dirname "$0")"

WEB="https://isidrogonzalez.vercel.app"
PROBAR=false
MENSAJE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --probar) PROBAR=true; shift ;;
    -m) MENSAJE="${2:-}"; shift 2 ;;
    *) echo "Opción desconocida: $1"; exit 1 ;;
  esac
done

paso() { echo; echo "▸ $*"; }
ok()   { echo "  ✓ $*"; }
malo() { echo "  ✗ $*" >&2; }

# ---------- 0. Que esté todo lo necesario ----------
paso "Comprobando herramientas"
falta=false
command -v node   >/dev/null || { malo "Falta Node.  Instálalo desde nodejs.org"; falta=true; }
command -v ffmpeg >/dev/null || { malo "Falta ffmpeg. Instálalo con:  brew install ffmpeg"; falta=true; }
command -v git    >/dev/null || { malo "Falta git."; falta=true; }
$falta && exit 1
[[ -d node_modules ]] || { echo "  · Primera vez: instalando dependencias…"; npm install --silent; }
ok "Todo en su sitio"

# ---------- 1 y 2. Comprimir y regenerar ----------
# --optimizar reutiliza lo ya comprimido, así que sólo trabaja con lo nuevo:
# añadir un vídeo a una carpeta de veinte no recomprime los otros diecinueve.
paso "Preparando los vídeos y las fotos nuevas"
node generar-datos.mjs --optimizar
ok "js/datos.js al día"

# ---------- 3. Cloudflare ----------
paso "Subiendo a Cloudflare lo que falte"
./subir-r2.sh

# ---------- Modo prueba: parar aquí ----------
if $PROBAR; then
  paso "Modo prueba: NO se publica nada"
  echo "  Abriendo http://localhost:8777 — Ctrl+C para salir."
  echo "  Si te convence, lanza  ./actualizar.sh  sin --probar."
  exec node servidor.mjs
fi

# ---------- 4. Guardar y publicar ----------
paso "Publicando"
if [[ -z "$(git status --porcelain)" ]]; then
  ok "No hay cambios que publicar (ya estaba todo al día)"
  exit 0
fi

git add -A
if [[ -z "$MENSAJE" ]]; then
  n=$(grep -c '"titulo"' js/datos.js || echo "?")
  MENSAJE="Actualizar contenido — $n piezas ($(date '+%-d/%m/%Y'))"
fi
git commit -q -m "$MENSAJE"
git push -q origin main
ok "Enviado: $MENSAJE"

# ---------- 5. Comprobar que la web ya lo sirve ----------
# Vercel despliega solo al recibir el push, pero tarda un poco. En vez de
# decir "ya está" y cruzar los dedos, se comprueba de verdad.
paso "Esperando a que la web se actualice"
esperado=$(grep -m1 'const MEDIA_V' js/datos.js | sed 's/.*"\(.*\)".*/\1/')
for i in $(seq 1 20); do
  vivo=$(curl -s "$WEB/js/datos.js" | grep -m1 'const MEDIA_V' | sed 's/.*"\(.*\)".*/\1/' || true)
  if [[ "$vivo" == "$esperado" ]]; then
    ok "La web ya sirve el contenido nuevo"
    echo
    echo "   $WEB"
    echo
    exit 0
  fi
  printf "  · intento %s/20…\r" "$i"
  sleep 10
done

echo
malo "Se ha subido bien, pero la web todavía no lo muestra pasados 3 minutos."
echo "  Míralo en https://vercel.com — a veces sólo va lento."
exit 1
