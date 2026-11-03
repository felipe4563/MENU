# MENU

Sistema de gestión para restaurantes (POS, cocina, caja, inventario, reportes).
Un solo código sirve a **varios restaurantes**, cada uno con su dominio, su
base de datos y sus archivos, todos corriendo en el mismo VPS.

- **Backend:** Node.js + Express + Sequelize + MySQL (`backend/`).
- **Frontend:** React + Vite + Tailwind (`frontend/`).
- **Agente de impresión:** app de Windows que se instala en la PC de cada caja (`print-agent/`).

---

## 1. La idea: un proyecto, varias instancias

```
                 GitHub (repo felipe4563/MENU)
                          │  git push
                          ▼
          GitHub Actions construye las imágenes Docker
                          │
                          ▼
     ghcr.io/felipe4563/menu-backend   ghcr.io/felipe4563/menu-frontend
                          │  docker pull
                          ▼
   VPS: ~/SISTEMAS/MENU-RUSOFT   (un solo clon del repo)
   ├── instancias/rusoft.env  → proyecto Docker "menu-rusoft" → menu.rusoft.dev
   ├── instancias/goxxo.env   → proyecto Docker "menu-goxxo"  → goxxo.rusoft.dev
   └── instancias/<otro>.env  → proyecto Docker "menu-<otro>" → <otro>.rusoft.dev
```

- **El código y las imágenes son los mismos para todos.** Si se corrige un
  error, se corrige en todos los restaurantes a la vez.
- **Cada restaurante es una "instancia":** un archivo `instancias/<nombre>.env`
  con sus contraseñas y su dominio, y un proyecto de Docker Compose
  `menu-<nombre>` con **sus propios contenedores**:
  - `db`: su propia base MySQL (sus productos, ventas, usuarios, cajas).
  - `backend`: la API.
  - `frontend`: la página web (nginx), que reenvía `/api` al backend.
- **Nada se mezcla entre restaurantes:** cada uno tiene su volumen de base de
  datos (`menu-<nombre>_db_data`) y su volumen de imágenes subidas
  (`menu-<nombre>_uploads`).
- **El VPS no construye nada.** Solo descarga las imágenes ya construidas por
  GitHub. Así no se queda sin memoria y el deploy tarda menos de un minuto.

### ¿Por qué la misma imagen sirve para todos los dominios?

El frontend llama a la API con una ruta relativa (`/api/v1`), no con un
dominio fijo. Cada dominio entra por su propio nginx al contenedor de su
restaurante, así que `/api` siempre llega al backend correcto.

Lo que sí cambia por restaurante va en su `.env` (`CORS_ORIGIN`,
`PUBLIC_API_URL`, contraseñas, puerto).

---

## 2. Archivos que hacen que funcione

| Archivo | Qué hace |
|---|---|
| `.github/workflows/imagenes.yml` | En cada `git push` a `main` construye `menu-backend` y `menu-frontend` y las sube a ghcr.io con dos etiquetas: el SHA del commit y `latest`. |
| `docker-compose.yml` | Define los 3 contenedores de **una** instancia. Usa `image: ghcr.io/...:${TAG}`; todas las variables salen del `.env` de la instancia. MySQL va ajustado para ocupar poca RAM (~140 MB en vez de ~350 MB). |
| `deploy.sh` | Actualiza los restaurantes del VPS: `git pull`, descarga las imágenes del commit, levanta cada instancia y limpia imágenes viejas. |
| `deploy/nuevo-restaurante.sh` | Da de alta un restaurante nuevo con un solo comando. |
| `deploy/nginx-host-proxy.conf` | Plantilla del sitio nginx del VPS (dominio → puerto del restaurante). |
| `backend/database/preparar.js` | Corre al arrancar el backend: aplica las migraciones que falten y, en una instalación nueva, configura el admin. |
| `bd/bd_codeculinary.sql` | Esquema inicial con el que nace la base de un restaurante nuevo. |
| `.env.example` | Referencia de todas las variables de una instancia. |
| `instancias/` | **Solo en el VPS** (está en `.gitignore`). Un `.env` por restaurante, con contraseñas. Nunca se sube a GitHub. |

---

## 3. Variables de un restaurante (`instancias/<nombre>.env`)

`nuevo-restaurante.sh` las genera solas. Para cambiar algo, se edita el
archivo y se corre `bash deploy.sh <nombre>`.

| Variable | Para qué |
|---|---|
| `FRONTEND_PORT` | Puerto local (127.0.0.1) del contenedor web. Distinto por restaurante (8090, 8091…). nginx del VPS apunta acá. |
| `DB_NAME`, `DB_USER`, `DB_PASS`, `DB_ROOT_PASS` | Base de datos propia del restaurante. |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Firmas de sesión. Distintas por restaurante. |
| `CORS_ORIGIN`, `PUBLIC_API_URL` | `https://<dominio>` del restaurante, sin barra final. Si están mal, se ven rotas las imágenes subidas. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `NOMBRE_NEGOCIO` | Solo para la **primera** instalación: el backend pone ese email y clave al admin (que debe cambiarla al entrar) y el nombre a la sucursal. |
| `CODEPAY_*` | Pagos QR, si el restaurante los usa. |

---

## 4. Migraciones (cambios en la base de datos)

- Cada cambio de esquema es un archivo en `backend/database/migrations/`
  (`055_devoluciones.sql`, `056_...`), numerado en orden.
- La tabla `migraciones` de cada base guarda cuáles ya se aplicaron.
- Al arrancar, el backend corre `preparar.js`, que aplica **solo las que
  faltan**, en orden. Si una falla, el backend **no arranca**: así nunca
  corre código nuevo sobre un esquema viejo. `deploy.sh` lo detecta y avisa.
- Un restaurante nuevo nace con `bd/bd_codeculinary.sql`, que ya incluye
  hasta la 051, y el backend le aplica el resto.

**Para agregar una migración:** crear el archivo con el número siguiente,
probarlo en local, hacer push y correr `bash deploy.sh`. Se aplica sola en
todos los restaurantes.

**Base que ya existía antes de este sistema de migraciones** (no tiene la
tabla `migraciones`): el backend se niega a arrancar hasta que se le indica
hasta qué migración tiene. Hay que revisar qué tiene la base y correr:

```bash
docker compose -p menu-<nombre> --env-file instancias/<nombre>.env \
  run --rm backend node database/preparar.js --baseline 053
```

---

## 5. Uso en el VPS

Todo se corre desde la carpeta del clon:

```bash
cd ~/SISTEMAS/MENU-RUSOFT
```

### Actualizar después de un `git push`

1. Esperar el ✅ en GitHub → **Actions** ("Imágenes Docker").
2. En el VPS:

```bash
bash deploy.sh            # actualiza TODOS los restaurantes
bash deploy.sh goxxo      # actualiza solo uno
```

Si Actions todavía está construyendo, `deploy.sh` espera solo (hasta 15 min).
Si no aparecen las imágenes, aborta y los restaurantes siguen con la versión
anterior.

### Dar de alta un restaurante nuevo

1. En el proveedor del dominio, crear un registro **A**:
   `<sub> → IP del VPS` (por ejemplo `goxxo → 51.222.155.42`).
2. En el VPS:

```bash
bash deploy/nuevo-restaurante.sh goxxo goxxo.rusoft.dev "Goxxo" admin@goxxo.com
sudo certbot --nginx -d goxxo.rusoft.dev
```

El script:

- elige el siguiente puerto libre (desde 8090);
- genera las contraseñas;
- crea `instancias/goxxo.env`;
- instala el sitio nginx;
- levanta los contenedores;
- **muestra el email y la clave del admin** (también quedan en el `.env`).

Al entrar por primera vez, el sistema pide cambiar la clave.

### Comandos útiles

```bash
# Atajo para no repetir (cambiar "goxxo" por el restaurante)
P="docker compose -p menu-goxxo --env-file instancias/goxxo.env"

$P ps                      # estado de sus contenedores
$P logs -f backend         # logs del backend (errores, migraciones)
$P restart backend         # reiniciar el backend
$P stop                    # apagar ese restaurante (los datos quedan)
$P up -d --no-build        # volver a levantarlo

# Respaldo de la base de un restaurante
$P exec db sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' > ~/respaldo_goxxo_$(date +%F).sql

# Volver a una versión anterior (SHA de un commit viejo)
TAG=<sha> $P up -d --no-build

# Memoria del VPS
free -h
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}" | grep menu-
```

Cada restaurante ocupa más o menos **200–250 MB de RAM** (MySQL ~140 MB,
backend ~60 MB, nginx ~5 MB). Antes de sumar uno, conviene que
`free -h` muestre más de ~500 MB en `available`.

---

## 6. Desarrollo local (en la PC)

```bash
# MySQL de XAMPP encendido, base bd_codeculinary
cd backend  && npm install && npm run dev    # API en http://localhost:3001
cd frontend && npm install && npm run dev    # web en http://localhost:5173
```

- `backend/.env` apunta a la base local.
- Los tests (`cd backend && npx jest <archivo> --runInBand`) usan **la misma
  base local**. Después de correrlos hay que borrar los datos "…Test" que
  quedan.
- El login es de **sesión única**: si alguien entra con el mismo usuario en
  otro lado, la sesión anterior se cierra.

---

## 7. Agente de impresión

El agente (`print-agent/`) se instala en la PC de cada caja y recibe los
tickets (venta, cocina, cierre) en `http://127.0.0.1:4321`. **No se
actualiza con `deploy.sh`.** Cuando cambia el código del agente hay que
reinstalarlo en cada PC de cada restaurante. Si el agente no está corriendo,
el navegador imprime un ticket HTML de respaldo.

---

## 8. Resumen rápido

| Quiero… | Hago… |
|---|---|
| Subir un cambio a todos | `git push` → ✅ en Actions → `bash deploy.sh` en el VPS |
| Subir solo a un restaurante | `bash deploy.sh <nombre>` |
| Restaurante nuevo | Registro A en el DNS → `bash deploy/nuevo-restaurante.sh …` → `certbot` |
| Cambiar la base de datos | Nueva migración `NNN_algo.sql` → push → deploy (se aplica sola) |
| Ver por qué no arranca | `docker compose -p menu-<nombre> --env-file instancias/<nombre>.env logs backend` |
| Volver atrás | `TAG=<sha> docker compose -p menu-<nombre> --env-file instancias/<nombre>.env up -d --no-build` |
