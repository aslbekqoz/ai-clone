#!/bin/sh
# Konteyner buyrug'i: api | worker | migrate | seed | smoke
set -e
case "${1:-api}" in
  api) exec node --import tsx apps/api/src/server.ts ;;
  worker) exec node --import tsx apps/api/src/worker.ts ;;
  migrate) exec node --import tsx packages/db/src/migrate.ts ;;
  seed) exec node --import tsx apps/api/src/seed.ts ;;
  smoke) exec node --import tsx apps/api/src/smoke.ts ;;
  *) exec "$@" ;;
esac
