#!/usr/bin/env bash
# Runs ON the VPS, called by GitHub Actions as:  sudo -n /opt/mobileshop/deploy.sh <image tag>
# Pulls the new images, restarts the stack (migrations run when the backend starts) and checks
# /health. If the new version is not healthy, it goes back to the previous tag.
set -euo pipefail
cd /opt/mobileshop

TAG="${1:?usage: deploy.sh <image tag>}"
[[ "$TAG" =~ ^[0-9a-f]{7,40}$|^latest$ ]] || { echo "bad tag: $TAG"; exit 1; }
PREV="$(cat .current-tag 2>/dev/null || echo latest)"

run() { IMAGE_TAG="$1" docker compose --env-file .env "${@:2}"; }

healthy() {
  for _ in $(seq 1 30); do
    if docker compose --env-file .env exec -T web wget -qO- http://localhost/health >/dev/null 2>&1; then return 0; fi
    sleep 3
  done
  return 1
}

echo "deploying $TAG (was $PREV)"
run "$TAG" pull backend web
run "$TAG" up -d --remove-orphans

if healthy; then
  echo "$TAG" > .current-tag
  docker image prune -f >/dev/null
  echo "deploy ok: $TAG"
else
  echo "new version is not healthy; backend log:"
  docker compose --env-file .env logs --tail 80 backend || true
  if [ "$PREV" != "$TAG" ]; then
    echo "rolling back to $PREV"
    run "$PREV" up -d --remove-orphans
  fi
  exit 1
fi
