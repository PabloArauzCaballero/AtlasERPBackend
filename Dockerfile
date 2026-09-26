FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json yarn.lock ./
RUN corepack enable && corepack yarn install --frozen-lockfile --ignore-scripts --non-interactive

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN corepack yarn type-check && corepack yarn build

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY package.json yarn.lock ./
# `--upgrade libcrypto3 libssl3`: la base fija una version de OpenSSL con dos altos que Alpine ya
# corrigio (CVE-2026-14456, en 3.5.8-r0); no llegan solos porque la etiqueta esta clavada. Se
# actualizan ESOS paquetes, nunca `apk upgrade` a secas, que cambiaria la base entre dos builds del
# mismo commit.
RUN apk add --no-cache --upgrade libcrypto3 libssl3

# `yarn cache clean` en la MISMA capa: Yarn 1 descarga a su caché (/usr/local/share/.cache/yarn)
# TODOS los paquetes del lockfile, también los de desarrollo, aunque sólo instale los de producción.
# Sin limpiarla, la imagen llevaba browserslist, fast-uri y js-yaml de desarrollo y Trivy daba 7 altos.
RUN corepack enable && corepack yarn install --production=true --frozen-lockfile --ignore-scripts --non-interactive \
  && corepack yarn cache clean && corepack cache clean

# npm FUERA de la imagen que se despliega, YA instaladas las dependencias.
#
# La mayoria de los CVEs de esta imagen no son dependencias del ERP: viven dentro del npm que trae
# node:22-alpine. Medido con Trivy antes de tocar nada: el CRITICO de `tar` (CVE-2026-59873) y los
# altos de `pacote`, `sigstore`, `picomatch`, `ip-address` y `brace-expansion` salen todos de
# `/usr/local/lib/node_modules/npm`, no de `app/node_modules`.
#
# Es seguro porque nada lo usa en ejecucion: el contenedor arranca con `node dist/src/main.js` y el
# healthcheck es `wget`. Las MIGRACIONES si lo usaban (`npm run db:migrate:prod` en el compose) y por
# eso pasan a `node --run`, que ejecuta el mismo script de package.json sin npm de por medio.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node src/database/migrations ./src/database/migrations
# `src/database/sql` guarda el esquema de contabilidad, y `db:migrate:prod` lo nombra por ruta
# igual que a las otras migraciones. Sin copiarlo, la imagen arranca y la primera migración
# muere con «no such file», que es un fallo de EMPAQUETADO disfrazado de fallo de base de datos.
COPY --chown=node:node src/database/sql ./src/database/sql

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/api/v1/health" >/dev/null || exit 1
# `dist/src/main.js`, no `dist/main.js`. `tsconfig.build.json` incluye `src/**` Y `scripts/**`, así
# que la raíz común que ve tsc es el repositorio y la salida conserva el prefijo `src/`. Con la ruta
# corta la imagen construía sin un error y moría al arrancar con MODULE_NOT_FOUND.
CMD ["node", "dist/src/main.js"]
