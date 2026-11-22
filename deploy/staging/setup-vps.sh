#!/usr/bin/env bash
# One-time setup of the STAGING stack on the VPS (ADR-132). Run as root:
#   bash setup-vps.sh [staging domain]
# Makes /opt/mobileshop-staging with its own compose file, deploy script and secrets (fresh
# passwords — never the shops'), and lets the 'deploy' user run exactly its deploy script.
# It does not read, change or restart anything in /opt/mobileshop.
set -euo pipefail
DIR=/opt/mobileshop-staging
DOMAIN="${1:-staging-mobileshop.oopsolutions.com}"
RAW="https://raw.githubusercontent.com/AbdurRehmanAfzal/mobile-shop-software/staging/deploy/staging"

id -u deploy >/dev/null 2>&1 || { echo "no 'deploy' user on this server"; exit 1; }
docker network inspect n8n_default >/dev/null 2>&1 || { echo "Docker network n8n_default (Traefik) not found"; exit 1; }

install -d -m 755 "$DIR"
curl -fsSL "$RAW/docker-compose.yml" -o "$DIR/docker-compose.yml"
curl -fsSL "$RAW/deploy.sh" -o "$DIR/deploy.sh"
chmod 644 "$DIR/docker-compose.yml"; chmod 755 "$DIR/deploy.sh"

if [ ! -f "$DIR/.env" ]; then
  umask 077
  cat > "$DIR/.env" <<ENV
# STAGING only. Its own passwords; nothing here is shared with /opt/mobileshop/.env
APP_DOMAIN=$DOMAIN
POSTGRES_PASSWORD=$(openssl rand -hex 24)
SECRET_KEY=$(openssl rand -hex 32)
# anyone who knows the address can make a test shop; set to false once yours exist
PUBLIC_SIGNUP=true
# the mobile number(s) that may open the provider's control room on staging, e.g. 03001234567
SUPERUSER_PHONES=
ENV
  chmod 600 "$DIR/.env"
  echo "Created $DIR/.env (domain $DOMAIN, fresh passwords)."
else
  echo "$DIR/.env exists; left as it is."
fi

cat > /etc/sudoers.d/mobileshop-staging-deploy <<SUDO
deploy ALL=(root) NOPASSWD: $DIR/deploy.sh
SUDO
chmod 440 /etc/sudoers.d/mobileshop-staging-deploy
visudo -cf /etc/sudoers.d/mobileshop-staging-deploy

echo
echo "Staging is prepared. The shops' stack was not touched."
echo "Next: push to the staging branch (or run the 'Staging' workflow on GitHub); it calls $DIR/deploy.sh <tag>."
echo "Then open https://$DOMAIN"
