#!/usr/bin/env bash
# Restaura un backup generado por backup-db.sh. DESTRUCTIVO: pide confirmación explícita porque
# sobrescribe la base apuntada por DATABASE_URL — pensado para restaurar sobre una base vacía/de
# prueba al validar el propio backup, o en una recuperación real, nunca para correrse "por si
# acaso" contra producción.
#
# Uso: ./scripts/restore-db.sh backups/flashkings-20260830-030000.sql.gz
set -euo pipefail
cd "$(dirname "$0")/.."

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Uso: $0 <archivo .sql.gz>" >&2
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')"
fi
if [ -z "${DATABASE_URL:-}" ]; then
  echo "Falta DATABASE_URL (ni en el entorno ni en .env)" >&2
  exit 1
fi

echo "Esto SOBRESCRIBE la base en: $DATABASE_URL"
read -r -p "Escribe 'restaurar' para confirmar: " confirm
if [ "$confirm" != "restaurar" ]; then
  echo "Cancelado."
  exit 1
fi

if command -v psql >/dev/null 2>&1; then
  gunzip -c "$FILE" | psql "$DATABASE_URL"
elif docker ps --format '{{.Names}}' | grep -q '^flashkings-postgres$'; then
  DB_NAME="$(echo "$DATABASE_URL" | sed -E 's#.*/([^?]+).*#\1#')"
  gunzip -c "$FILE" | docker exec -i -e PGPASSWORD=postgres flashkings-postgres psql -U postgres -d "$DB_NAME"
else
  echo "No se encontró psql (ni local ni el contenedor flashkings-postgres)" >&2
  exit 1
fi

echo "Restauración completa desde $FILE"
