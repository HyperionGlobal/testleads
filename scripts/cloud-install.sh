#!/usr/bin/env bash
set -euo pipefail
cd /workspace/testleads
npm ci --cache /workspace/.npm-cache
node scripts/init-local.mjs
node --env-file-if-exists=.env scripts/database.mjs
for attempt in {1..30}; do
  if docker exec hyperion-db pg_isready -U hyperion >/dev/null; then break; fi
  if [ "$attempt" = 30 ]; then echo 'PostgreSQL did not become ready' >&2; exit 1; fi
  sleep 1
done
npm run db:generate
npm run db:migrate
npm run db:seed
npm run build
