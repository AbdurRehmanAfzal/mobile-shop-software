#!/usr/bin/env bash
# Runs ON the VPS, called by GitHub Actions (staging.yml) as:
#   sudo -n /opt/mobileshop-staging/deploy.sh <image tag>
# Pulls the staging images, restarts the STAGING stack only and checks /health. It never touches
# /opt/mobileshop (the shops). If the new version is not healthy, it goes back to the previous tag.
set -euo pipefail
cd /opt/mobileshop-staging

TAG="${1:?usage: deploy.sh <image tag>}"
[[ "$TAG" =~ ^[0-9a-f]{7,40}$|^staging$ ]] || { echo "bad tag: $TAG"; exit 1; }
PREV="$(cat .current-tag 2>/dev/null || echo staging)"

run() { IMAGE_TAG="$1" docker compose --env-file .env "${@:2}"; }

healthy() {
  for _ in $(seq 1 30); do
    if docker compose --env-file .env exec -T web wget -qO- http://localhost/health >/dev/null 2>&1; then return 0; fi
    sleep 3
  done
  return 1
}

# the stack files of this exact version come with the deploy, as on production
RAW="https://raw.githubusercontent.com/AbdurRehmanAfzal/mobile-shop-software/$TAG/deploy/staging"
if [ "$TAG" != "staging" ]; then
  for f in docker-compose.yml deploy.sh; do
    if curl -fsSL --max-time 20 "$RAW/$f" -o "$f.new"; then
      [ "$f" = docker-compose.yml ] && chmod 644 "$f.new" || chmod 755 "$f.new"
      mv "$f.new" "$f"
    else
      rm -f "$f.new"; echo "could not fetch $f; keeping the old one"
    fi
  done
fi

echo "staging: deploying $TAG (was $PREV)"
pulled=0
for attempt in 1 2 3 4; do
  if run "$TAG" pull backend web; then pulled=1; break; fi
  echo "pull failed (attempt $attempt), retrying in $((attempt * 15))s..."
  sleep $((attempt * 15))
done
[ "$pulled" = 1 ] || { echo "could not pull images for $TAG; nothing changed"; exit 1; }
run "$TAG" up -d --remove-orphans

if healthy; then
  echo "$TAG" > .current-tag
  echo "staging deploy ok: $TAG"
else
  echo "new version is not healthy; backend log:"
  docker compose --env-file .env logs --tail 80 backend || true
  if [ "$PREV" != "$TAG" ]; then
    echo "rolling back to $PREV"
    run "$PREV" up -d --remove-orphans
  fi
  exit 1
fi
