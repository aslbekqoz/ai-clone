#!/bin/sh
# Postgres konteyneri birinchi marta ishga tushganda: ilova uchun superuser BO'LMAGAN ega rol va baza.
# Superuser RLS'ni chetlab o'tadi — prod'da ilova hech qachon superuser bilan ulanmasin.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE aiclone LOGIN PASSWORD '${APP_DB_PASSWORD}' CREATEROLE;
CREATE DATABASE aiclone OWNER aiclone;
SQL
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname aiclone <<SQL
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SQL
