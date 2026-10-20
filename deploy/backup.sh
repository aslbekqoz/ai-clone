#!/bin/sh
# Kunlik zaxira (cron: 15 3 * * * /opt/aiclone/deploy/backup.sh). Zaxirada biometrik ma'lumot bor (ovoz, surat):
# BACKUP_AGE_RECIPIENT bilan shifrlanadi va faqat O'zbekistondagi xotirada saqlanadi.
set -eu
cd "$(dirname "$0")/.."
DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
mkdir -p "$DIR"
FILE="$DIR/aiclone-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U postgres -d aiclone -Fc > "$FILE"
if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then
  age -r "$BACKUP_AGE_RECIPIENT" -o "$FILE.age" "$FILE" && rm "$FILE"
  FILE="$FILE.age"
else
  echo "⚠️  BACKUP_AGE_RECIPIENT yo'q — zaxira shifrlanmagan" >&2
fi
find "$DIR" -name 'aiclone-*.dump*' -mtime +"$KEEP_DAYS" -delete
echo "Zaxira: $FILE ($(du -h "$FILE" | cut -f1))"
