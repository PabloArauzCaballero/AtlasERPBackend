#!/usr/bin/env bash
# Ruta de ACTUALIZACIÓN de la base (P-12): migra una base vacía con los migradores de una versión
# previa (por defecto la última promovida a `test`), luego la lleva a HEAD con `db:migrate:prod`, y
# exige que quede idéntica a una base migrada desde cero en HEAD.
#
# Caza tres cosas que la migración desde cero no ve: un archivo ya aplicado cuyo contenido cambió
# (el ejecutor lo rechaza por checksum), una migración nueva que choca con el esquema existente, y
# una deriva entre «instalar» y «actualizar».
#
# Requisitos: `yarn build` hecho en HEAD (db:migrate:prod ejecuta dist/), las variables que valida
# src/config/env.ts, y:
#   UPGRADE_FROM_REF       referencia previa (defecto: origin/test)
#   UPGRADE_DATABASE_URL   base VACÍA para la ruta de actualización
#   FRESH_DATABASE_URL     base ya migrada desde cero en HEAD (para comparar)
set -euo pipefail

ref="${UPGRADE_FROM_REF:-origin/test}"
: "${UPGRADE_DATABASE_URL:?falta UPGRADE_DATABASE_URL (base vacía)}"
: "${FRESH_DATABASE_URL:?falta FRESH_DATABASE_URL (base migrada desde cero en HEAD)}"

root="$(git rev-parse --show-toplevel)"
sha="$(git rev-parse --verify "${ref}^{commit}")"
tree="$(mktemp -d "${RUNNER_TEMP:-/tmp}/erp-upgrade-XXXXXX")"
cleanup() { git -C "$root" worktree remove --force "$tree" >/dev/null 2>&1 || rm -rf "$tree"; }
trap cleanup EXIT

echo "▶ Versión previa: ${ref} (${sha})"
git -C "$root" worktree add --detach "$tree" "$sha" >/dev/null
# Las dependencias de HEAD bastan para ejecutar el migrador SQL de la versión previa (pg + tsx).
ln -s "$root/node_modules" "$tree/node_modules"

files="$(cd "$tree" && node -e '
  const s = require("./package.json").scripts["db:migrate:prod"] || "";
  const m = s.match(/src\/database\/[A-Za-z0-9_\/.-]+\.sql/g) || [];
  process.stdout.write(m.join(" "));
')"
if [ -z "$files" ] || [ ! -f "$tree/scripts/db/run-sql.ts" ]; then
  echo "❌ ${ref} no tiene db:migrate:prod con run-sql: no es una versión previa soportada para actualizar." >&2
  exit 1
fi

echo "▶ Migrando con los migradores de ${ref} ($(echo "$files" | wc -w | tr -d ' ') archivos)"
# shellcheck disable=SC2086
(cd "$tree" && DATABASE_URL="$UPGRADE_DATABASE_URL" node_modules/.bin/tsx scripts/db/run-sql.ts $files)

echo "▶ Actualizando a HEAD con db:migrate:prod"
(cd "$root" && DATABASE_URL="$UPGRADE_DATABASE_URL" corepack yarn -s db:migrate:prod)

echo "▶ Comparando con la base migrada desde cero"
(cd "$root" && node_modules/.bin/tsx scripts/db/compare-schemas.ts "$FRESH_DATABASE_URL" "$UPGRADE_DATABASE_URL")
