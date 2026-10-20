#!/usr/bin/env bash
# Actualiza los restaurantes de este VPS con las imágenes que construyó
# GitHub Actions (ghcr.io). El VPS no construye nada.
#
# Un solo clon del repo sirve a todos los restaurantes: cada uno es un
# archivo instancias/<nombre>.env y un proyecto de docker compose
# "menu-<nombre>" con su propia base, uploads y puerto.
#
# Uso:
#   bash deploy.sh              actualiza todos los restaurantes
#   bash deploy.sh <nombre>     actualiza solo uno
# Restaurante nuevo: bash deploy/nuevo-restaurante.sh (ver ese archivo).
# Volver a una versión anterior de uno:
#   TAG=<sha> docker compose -p menu-<nombre> --env-file instancias/<nombre>.env up -d --no-build

set -euo pipefail

REGISTRO="ghcr.io/felipe4563/menu"
SERVICIOS=(backend frontend)
ORIGEN_IMAGENES="https://github.com/felipe4563/MENU"

# Todo dentro de main(): bash ya leyó la función completa antes del git pull,
# así que si el pull cambia este archivo no se rompe a mitad de ejecución.
main() {
  cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"

  local instancias=()
  if [[ $# -gt 0 ]]; then
    [[ -f "instancias/$1.env" ]] || { echo "No existe instancias/$1.env"; exit 1; }
    instancias=("$1")
  else
    for f in instancias/*.env; do
      [[ -e "$f" ]] && instancias+=("$(basename "$f" .env)")
    done
  fi
  if [[ ${#instancias[@]} -eq 0 ]]; then
    echo "No hay restaurantes en instancias/. Crear uno con: bash deploy/nuevo-restaurante.sh"
    exit 1
  fi

  if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    echo "Hay cambios sin commitear en el VPS. Revisar con 'git status' antes de desplegar."
    exit 1
  fi

  echo "==> git pull"
  git pull --ff-only

  TAG="$(git rev-parse HEAD)"
  export TAG
  echo "==> Versión: ${TAG:0:7}"

  descargar_imagenes

  local fallidos=()
  for nombre in "${instancias[@]}"; do
    echo "==> Levantando ${nombre}"
    docker compose -p "menu-${nombre}" --env-file "instancias/${nombre}.env" up -d --no-build --remove-orphans
    esperar_backend "$nombre" || fallidos+=("$nombre")
  done

  echo "==> Limpiando imágenes viejas de este proyecto"
  docker image prune -af --filter "label=org.opencontainers.image.source=${ORIGEN_IMAGENES}" >/dev/null

  if [[ ${#fallidos[@]} -gt 0 ]]; then
    echo ""
    echo "ATENCIÓN: el backend no respondió en: ${fallidos[*]}"
    echo "Ver logs: docker compose -p menu-<nombre> --env-file instancias/<nombre>.env logs backend"
    exit 1
  fi
  echo ""
  echo "Listo: ${instancias[*]} en ${TAG:0:7}"
}

# Si GitHub Actions todavía está construyendo, reintenta cada 30 s hasta 15 min.
descargar_imagenes() {
  local intento
  for intento in $(seq 1 30); do
    local ok=1
    for s in "${SERVICIOS[@]}"; do
      docker pull -q "${REGISTRO}-${s}:${TAG}" >/dev/null 2>&1 || { ok=0; break; }
    done
    if [[ $ok -eq 1 ]]; then
      echo "==> Imágenes descargadas"
      return 0
    fi
    echo "    Imágenes de ${TAG:0:7} aún no disponibles (intento ${intento}/30), esperando 30 s..."
    sleep 30
  done
  echo "No aparecieron las imágenes de ${TAG:0:7} en 15 min. Revisar GitHub → Actions."
  echo "Producción sigue con la versión anterior."
  exit 1
}

# El backend aplica migraciones al arrancar; si fallan, no levanta.
# Se considera arriba cuando nginx deja de responder 502/503/504.
esperar_backend() {
  local nombre="$1" puerto codigo
  puerto="$(grep -E '^FRONTEND_PORT=' "instancias/${nombre}.env" | cut -d= -f2)"
  for _ in $(seq 1 30); do
    codigo="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${puerto}/api/v1/" || true)"
    if [[ "$codigo" != "000" && "$codigo" != 502 && "$codigo" != 503 && "$codigo" != 504 ]]; then
      echo "    ${nombre}: backend arriba"
      return 0
    fi
    sleep 3
  done
  return 1
}

main "$@"
exit
