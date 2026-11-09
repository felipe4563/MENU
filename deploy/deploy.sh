#!/bin/bash
# Script de actualización (PM2 + nginx nativo, sin Docker) — mismo código se
# clona en varias carpetas del VPS, cada una con su propio proceso PM2 — por
# eso se ubica solo en vez de tener una ruta fija, así no hay que editarlo
# por instancia ni se pisa entre copias al hacer `git pull`.
# El nombre del proceso PM2 (más abajo) SÍ sigue siendo específico de cada
# instancia y hay que ajustarlo a mano en cada copia.
# Uso: bash deploy/deploy.sh (desde cualquier ubicación, el script resuelve su propia carpeta)

set -e
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Obteniendo cambios..."
# Proteger archivos de entorno locales para que el pull no falle
git update-index --skip-worktree frontend/.env 2>/dev/null || true
git update-index --skip-worktree backend/.env  2>/dev/null || true
git pull origin main

echo "==> Instalando dependencias del backend..."
cd backend && npm install --omit=dev && cd ..

echo "==> Construyendo frontend..."
cd frontend && npm install && npm run build && cd ..

echo "==> Publicando agente de impresión..."
# Deja el .exe en backend/agente-dist/ para que las cajas se auto-actualicen.
# Solo lo descargan si subió "version" en print-agent/package.json.
if (cd print-agent && npm install --no-audit --no-fund && npm run publicar); then
  echo "    agente publicado"
else
  echo "    AVISO: no se pudo construir el agente; se sigue ofreciendo la versión anterior"
fi

echo "==> Reiniciando servicio..."
pm2 reload scarnestropicales-api

echo "==> Recargando Nginx..."
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "Despliegue completado"
pm2 status scarnestropicales-api