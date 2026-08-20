FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run type-check && npm run build

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node src/database/migrations ./src/database/migrations
COPY --chown=node:node src/database/seeders ./src/database/seeders
# `src/database/sql` guarda el esquema de contabilidad, y `db:migrate:prod` lo nombra por ruta
# igual que a las otras migraciones. Sin copiarlo, la imagen arranca y la primera migración
# muere con «no such file», que es un fallo de EMPAQUETADO disfrazado de fallo de base de datos.
COPY --chown=node:node src/database/sql ./src/database/sql

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/api/v1/health" >/dev/null || exit 1
# `dist/src/main.js` y no `dist/main.js`: `tsconfig.build.json` compila `src/` y `scripts/`, así
# que el raíz común es la carpeta del proyecto y la salida conserva el `src/`. Con la ruta corta
# la imagen se construía bien y moría al arrancar, que es el peor momento para enterarse.
CMD ["node", "dist/src/main.js"]
