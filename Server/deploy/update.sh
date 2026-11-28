#!/bin/bash
# (Re)starts the Momento API from the code in /opt/momento. Run on the server with:
#   sudo momento-update
# which first gets the latest code from GitHub, then runs this file.
set -euo pipefail

if [ ! -s /opt/momento-config/server.env ]; then
  echo "The settings file /opt/momento-config/server.env is empty. Fill it in first (see README.md)."
  exit 1
fi

# ---- Only code whose server tests passed (audit B2) ----
# The "Server tests" GitHub Action (.github/workflows/server-tests.yml) runs on every push to main. This waits for
# its run on the commit being deployed (up to 20 minutes) and stops unless it passed.
#   sudo momento-update --force    deploys anyway (an emergency fix, or GitHub being down)
if [ "${1:-}" = "--force" ]; then
  echo "--force: deploying without checking the server tests."
else
  SHA="$(git -C /opt/momento rev-parse HEAD)"
  URL="https://api.github.com/repos/teamHexarch/Momento/actions/workflows/server-tests.yml/runs?head_sha=$SHA&per_page=1"
  echo "Checking the server tests for ${SHA:0:7}..."
  STATE=""
  for _ in $(seq 1 80); do
    STATE="$(curl -fsS --max-time 15 "$URL" 2>/dev/null | python3 -c 'import sys, json
runs = json.load(sys.stdin).get("workflow_runs") or []
print(runs[0]["status"] + ":" + str(runs[0]["conclusion"]) if runs else "none")' 2>/dev/null || echo "unreachable")"
    case "$STATE" in
      completed:success) echo "Server tests passed."; break ;;
      completed:*) echo "The server tests for ${SHA:0:7} didn't pass ($STATE). Not deploying."
        echo "See https://github.com/teamHexarch/Momento/actions/workflows/server-tests.yml (or: sudo momento-update --force)"
        exit 1 ;;
      *) sleep 15 ;;
    esac
  done
  if [ "$STATE" != "completed:success" ]; then
    echo "The server tests for ${SHA:0:7} haven't finished ($STATE). Not deploying; try again in a few minutes (or --force)."
    exit 1
  fi
fi

cd /opt/momento/Server/deploy

# Which address(es) Caddy gets HTTPS certificates for, e.g. "api.hexarch.org" or
# "aws-api.hexarch.org, api.hexarch.org"
API_DOMAINS="$(sed 's/[[:space:]]//g; s/,/, /g' /opt/momento-config/domains)"
export API_DOMAINS
echo "Serving on: $API_DOMAINS"

docker compose up -d --build --remove-orphans
docker image prune -f > /dev/null

echo "Waiting for the API to start..."
for _ in $(seq 1 30); do
  if docker compose exec -T api node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" 2>/dev/null; then
    echo "Momento API is running. Its startup messages:"
    docker compose logs --no-log-prefix --tail 8 api
    exit 0
  fi
  sleep 2
done
echo "The API didn't start. Its last messages:"
docker compose logs --no-log-prefix --tail 40 api
exit 1
