#!/bin/sh
# Zaxiradan tiklash (bo'sh bazaga):  deploy/restore.sh backups/aiclone-....dump[.age]
# Rollar avval yaratiladi: RLS siyosatlari va ruxsatlar aiclone / aiclone_app nomlariga bog'langan.
set -eu
cd "$(dirname "$0")/.."
SRC="$1"
if [ "${SRC%.age}" != "$SRC" ]; then
  age -d -i "${BACKUP_AGE_IDENTITY:?BACKUP_AGE_IDENTITY kerak}" -o /tmp/aiclone-restore.dump "$SRC"
  SRC=/tmp/aiclone-restore.dump
fi
DC="docker compose -f docker-compose.prod.yml"
$DC stop api worker
$DC exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aiclone_app') THEN CREATE ROLE aiclone_app NOLOGIN; END IF;
END $$;
DROP DATABASE IF EXISTS aiclone_restore;
CREATE DATABASE aiclone_restore OWNER aiclone;
SQL
$DC exec -T db psql -U postgres -d aiclone_restore -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS vector" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto"
$DC exec -T db pg_restore -U postgres -d aiclone_restore --exit-on-error < "$SRC"
# Tiklangan baza tekshirilgach almashtiriladi: eski baza aiclone_old nomi bilan qoladi.
$DC exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "ALTER DATABASE aiclone RENAME TO aiclone_old" -c "ALTER DATABASE aiclone_restore RENAME TO aiclone"
$DC start api worker
echo "Tiklandi. Tekshiring: $DC run --rm api smoke. Eski baza: aiclone_old (keyin DROP DATABASE aiclone_old)."
