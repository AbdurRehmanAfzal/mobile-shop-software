#!/usr/bin/env bash
# One-time setup of the Mobile Shop app on the OOP Solutions VPS. Run as root from this folder:
#   bash setup-vps.sh
# Uses the 'deploy' user made by the website's setup (oop-solutions/website/deploy/setup-vps.sh) and
# lets it run exactly one command: /opt/mobileshop/deploy.sh. HTTPS comes from the existing Traefik.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DIR=/opt/mobileshop

id -u deploy >/dev/null 2>&1 || { echo "no 'deploy' user: run the website's setup-vps.sh first"; exit 1; }
docker network inspect n8n_default >/dev/null 2>&1 || { echo "Docker network n8n_default (Traefik) not found"; exit 1; }

# 1. folder with the compose file, scripts and the secrets file (root only)
install -d -m 755 "$DIR"
install -m 644 "$HERE/docker-compose.yml" "$DIR/docker-compose.yml"
install -m 755 "$HERE/deploy.sh" "$DIR/deploy.sh"
install -m 755 "$HERE/backup.sh" "$DIR/backup.sh"
if [ ! -f "$DIR/.env" ]; then
  install -m 600 "$HERE/.env.example" "$DIR/.env"
  sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/; s/^SECRET_KEY=.*/SECRET_KEY=$(openssl rand -hex 32)/" "$DIR/.env"
  echo "Created $DIR/.env with fresh passwords. Now set APP_DOMAIN and SUPERUSER_PHONES in it."
fi

# 2. the deploy user may run the deploy script as root, and nothing else
cat > /etc/sudoers.d/mobileshop-deploy <<EOF
deploy ALL=(root) NOPASSWD: $DIR/deploy.sh
EOF
chmod 440 /etc/sudoers.d/mobileshop-deploy
visudo -cf /etc/sudoers.d/mobileshop-deploy

# 3. nightly backup at 02:30, 14 days kept in /opt/mobileshop-backups
( crontab -l 2>/dev/null | grep -v mobileshop/backup.sh; echo "30 2 * * * $DIR/backup.sh >> /var/log/mobileshop-backup.log 2>&1" ) | crontab -

echo
echo "Next:"
echo "  1. nano $DIR/.env          (APP_DOMAIN, SUPERUSER_PHONES)"
echo "  2. DNS: A record for APP_DOMAIN -> this server's IP"
echo "  3. If the GitHub images are private: docker login ghcr.io -u AbdurRehmanAfzal   (token with read:packages)"
echo "  4. Push to main (or run the Deploy workflow); CI calls $DIR/deploy.sh <tag>"
