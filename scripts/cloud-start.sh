#!/usr/bin/env bash
set -euo pipefail
cd /workspace/testleads
if ! docker container inspect hyperion-db >/dev/null 2>&1; then
  echo 'Local PostgreSQL container is missing; run bash scripts/cloud-install.sh first.' >&2
  exit 1
fi
docker start hyperion-db >/dev/null
for attempt in {1..30}; do
  if docker exec hyperion-db pg_isready -U hyperion >/dev/null; then break; fi
  if [ "$attempt" = 30 ]; then echo 'PostgreSQL did not become ready' >&2; exit 1; fi
  sleep 1
done
if ! node -e 'fetch("http://localhost:3000/api/health").then(async r=>{const b=await r.json();if(!r.ok||b.application!=="Hyperion Lead Intelligence")process.exit(1)}).catch(()=>process.exit(1))'; then
  nohup npm start > /tmp/hyperion-web.log 2>&1 &
  echo $! > /tmp/hyperion-web.pid
fi
if ! pgrep -f '^.*tsx.*scripts/worker.ts$' >/dev/null; then
  nohup npm run worker > /tmp/hyperion-worker.log 2>&1 &
  echo $! > /tmp/hyperion-worker.pid
fi
for attempt in {1..30}; do
  if node -e 'fetch("http://localhost:3000/api/health").then(async r=>{const b=await r.json();if(!r.ok||b.application!=="Hyperion Lead Intelligence")process.exit(1)}).catch(()=>process.exit(1))'; then
    echo 'Hyperion web and PostgreSQL are healthy on port 3000. Worker logs: /tmp/hyperion-worker.log'
    exit 0
  fi
  if [ "$attempt" = 30 ]; then echo 'Application did not become healthy; inspect /tmp/hyperion-web.log' >&2; exit 1; fi
  sleep 1
done
