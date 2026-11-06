#!/bin/bash
# (Re)starts the Momento API from the code in /opt/momento. Run on the server with:
#   sudo momento-update
# which first gets the latest code from GitHub, then runs this file.
set -euo pipefail

if [ ! -s /opt/momento-config/server.env ]; then
  echo "The settings file /opt/momento-config/server.env is empty. Fill it in first (see README.md)."
  exit 1
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
