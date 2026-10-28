#!/usr/bin/env sh
# Nightly backup: database dump + uploaded photos, keeps 14 days here (30 days off-server). setup-vps.sh installs the cron line:
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

# Off-server copy (owner, 2026-10-28): when RCLONE_REMOTE is set in .env (e.g. "gdrive-safe:"), the
# new files go to Google Drive and copies older than 30 days are removed there. Use an encrypted
# rclone "crypt" remote: the backup holds CNIC photos. Setup: docs/12 "Backups".
if [ -n "${RCLONE_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  rclone copy "$DEST" "$RCLONE_REMOTE" --max-age 2d --no-traverse
  rclone delete "$RCLONE_REMOTE" --min-age 30d || true
  echo "offsite copy ok $STAMP -> $RCLONE_REMOTE"
fi
