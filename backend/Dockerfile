FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3001

# Aplica migraciones pendientes (y configura el admin en una instalación
# nueva) antes de arrancar. Si falla, el servidor no arranca.
CMD ["sh", "-c", "node database/preparar.js && node src/server.js"]
