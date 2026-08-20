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

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/api/v1/health" >/dev/null || exit 1
# `dist/src/main.js`, no `dist/main.js`. `tsconfig.build.json` incluye `src/**` Y `scripts/**`, así
# que la raíz común que ve tsc es el repositorio y la salida conserva el prefijo `src/`. Con la ruta
# corta la imagen construía sin un error y moría al arrancar con MODULE_NOT_FOUND.
CMD ["node", "dist/src/main.js"]
