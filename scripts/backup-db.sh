#!/usr/bin/env bash
# Backup de Postgres vía pg_dump — lee DATABASE_URL de .env (o del entorno si ya está exportada).
#
# Por qué existe esto además del backup automático de Neon (el Postgres elegido para producción,
# ver render.yaml): un backup independiente del proveedor cubre el caso "se borró/suspendió la
# cuenta/el proyecto entero por error", que un backup que vive DENTRO de esa misma cuenta no
# cubre. No reemplaza el point-in-time recovery de Neon (esa sigue siendo la primera línea de
# defensa) — es una segunda copia, más simple, pensada para guardarse en otro lugar.
#
# Uso manual:  ./scripts/backup-db.sh
# Uso en cron: 0 3 * * * cd /ruta/al/proyecto && ./scripts/backup-db.sh >> backups/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')"
fi
if [ -z "${DATABASE_URL:-}" ]; then
  echo "Falta DATABASE_URL (ni en el entorno ni en .env)" >&2
  exit 1
fi

BACKUP_DIR="backups"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$BACKUP_DIR/flashkings-$TIMESTAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

# En dev local Postgres corre en Docker y no siempre hay pg_dump en el host — si no está, cae a
# ejecutarlo dentro del contenedor (mismo binario, mismo resultado). En un host real (Neon) esto
# no aplica: ahí pg_dump simplemente está instalado y corre directo contra DATABASE_URL.
if command -v pg_dump >/dev/null 2>&1; then
  pg_dump "$DATABASE_URL" | gzip > "$OUT_FILE"
elif docker ps --format '{{.Names}}' | grep -q '^flashkings-postgres$'; then
  DB_NAME="$(echo "$DATABASE_URL" | sed -E 's#.*/([^?]+).*#\1#')"
  docker exec -e PGPASSWORD=postgres flashkings-postgres pg_dump -U postgres "$DB_NAME" | gzip > "$OUT_FILE"
else
  echo "No se encontró pg_dump (ni local ni el contenedor flashkings-postgres)" >&2
  exit 1
fi

echo "Backup creado: $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"

# Poda backups locales más viejos que RETENTION_DAYS — la retención "de verdad" vive en Neon
# (PITR); esta copia local es una red adicional, no necesita guardar historial largo.
find "$BACKUP_DIR" -name "flashkings-*.sql.gz" -mtime "+$RETENTION_DAYS" -delete
