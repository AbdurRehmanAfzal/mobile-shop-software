#!/usr/bin/env sh
# Nightly backup: database dump + uploaded photos, keeps 14 days. setup-vps.sh installs the cron line:
#   30 2 * * * /opt/mobileshop/backup.sh >> /var/log/mobileshop-backup.log 2>&1
set -eu
cd /opt/mobileshop
STAMP=$(date +%Y%m%d-%H%M)
DEST=${BACKUP_DIR:-/opt/mobileshop-backups}
mkdir -p "$DEST"
. ./.env

docker compose --env-file .env exec -T db \
  pg_dump -U "${POSTGRES_USER:-mobileshop}" -d "${POSTGRES_DB:-mobileshop}" --format=custom > "$DEST/db-$STAMP.dump"

docker run --rm -v mobileshop_uploads:/u:ro -v "$DEST":/b alpine \
  tar czf "/b/uploads-$STAMP.tgz" -C /u .

find "$DEST" -type f -mtime +14 -delete
echo "backup ok $STAMP"
