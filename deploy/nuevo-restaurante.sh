#!/usr/bin/env bash
# Da de alta un restaurante nuevo en este VPS.
#
# Uso:
#   bash deploy/nuevo-restaurante.sh <nombre> <dominio> "<Nombre del negocio>" <email-admin>
# Ejemplo:
#   bash deploy/nuevo-restaurante.sh menu menu.rusoft.dev "Restaurante Demo" admin@rusoft.dev
#
# Antes: el DNS del dominio tiene que apuntar a este VPS (para el certificado).
#
# Qué hace:
#   1. Crea instancias/<nombre>.env con contraseñas y secretos generados y el
#      siguiente puerto libre.
#   2. Instala el sitio en el nginx del VPS (proxy al contenedor).
#   3. Levanta los contenedores (deploy.sh <nombre>). La base se crea vacía
#      y el backend configura el admin con la contraseña generada.
#   4. Muestra el comando de certbot y las credenciales.

set -euo pipefail

main() {
  cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.."

  if [[ $# -ne 4 ]]; then
    sed -n '4,7p' "deploy/nuevo-restaurante.sh"
    exit 1
  fi
  local nombre="$1" dominio="$2" negocio="$3" email="$4"

  [[ "$nombre" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "El nombre solo puede tener minúsculas, números y guiones"; exit 1; }
  local archivo="instancias/${nombre}.env"
  [[ -e "$archivo" ]] && { echo "Ya existe ${archivo}"; exit 1; }

  local puerto
  puerto="$(puerto_libre)"
  local admin_pass
  admin_pass="$(openssl rand -base64 12 | tr -d '/+=' | cut -c1-12)"

  mkdir -p instancias
  umask 077
  cat > "$archivo" <<EOF
# Restaurante: ${negocio} (${dominio}) — creado $(date +%F)
FRONTEND_PORT=${puerto}

DB_NAME=menu_${nombre//-/_}
DB_USER=app
DB_PASS=$(openssl rand -hex 16)
DB_ROOT_PASS=$(openssl rand -hex 16)

JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)

CORS_ORIGIN=https://${dominio}
PUBLIC_API_URL=https://${dominio}

# Solo para la instalación inicial: el admin debe cambiar la contraseña al entrar.
ADMIN_EMAIL=${email}
ADMIN_PASSWORD=${admin_pass}
NOMBRE_NEGOCIO=${negocio}

# CodePay (pagos QR): completar si el restaurante lo usa.
CODEPAY_SANDBOX=true
CODEPAY_PUBLIC_KEY=
CODEPAY_SECRET_KEY=
CODEPAY_NOTIFICATION_SECRET=
CODEPAY_SANDBOX_PUBLIC_KEY=
CODEPAY_SANDBOX_SECRET_KEY=
EOF
  umask 022
  echo "==> Creado ${archivo} (puerto ${puerto})"

  echo "==> Configurando nginx para ${dominio}"
  sed "s/__DOMINIO__/${dominio}/g; s/__PUERTO__/${puerto}/g" deploy/nginx-host-proxy.conf \
    | sudo tee "/etc/nginx/sites-available/${dominio}" >/dev/null
  sudo ln -sf "/etc/nginx/sites-available/${dominio}" "/etc/nginx/sites-enabled/${dominio}"
  sudo nginx -t
  sudo systemctl reload nginx

  bash deploy.sh "$nombre"

  cat <<EOF

========================================================
 ${negocio} listo en http://${dominio}

 Falta el HTTPS (con el DNS ya apuntando a este VPS):
   sudo certbot --nginx -d ${dominio}

 Ingreso:  ${email}
 Clave:    ${admin_pass}   (pide cambiarla al entrar)
========================================================
EOF
}

# Siguiente puerto desde 8090 que no use otro restaurante ni otro sistema del VPS.
puerto_libre() {
  local p=8090
  while grep -qs "^FRONTEND_PORT=${p}$" instancias/*.env || ss -tln | grep -q ":${p} "; do
    p=$((p + 1))
  done
  echo "$p"
}

main "$@"
exit
