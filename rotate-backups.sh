#!/usr/bin/env bash
set -euo pipefail

# Rotate (delete) old DB backups under /srv/cmms-iot/backups.
#
# Defaults:
#   KEEP_DAYS=14   (keep last 14 days)
#   DRY_RUN=1      (show candidates but do not delete)
#
# Usage:
#   ./rotate-backups.sh
#   DRY_RUN=0 ./rotate-backups.sh
#   KEEP_DAYS=30 DRY_RUN=0 ./rotate-backups.sh
#
# Files matched:
#   cmms_db_*.sql.gz

BACKUP_DIR="/srv/cmms-iot/backups"
KEEP_DAYS="${KEEP_DAYS:-14}"
DRY_RUN="${DRY_RUN:-1}"

if [ ! -d "$BACKUP_DIR" ]; then
  echo "[err] Backup dir not found: $BACKUP_DIR"
  exit 1
fi

echo "[rotate] dir=$BACKUP_DIR keep_days=$KEEP_DAYS dry_run=$DRY_RUN"

mapfile -t files < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name "cmms_db_*.sql.gz" -mtime +"$KEEP_DAYS" -print | sort)

if [ "${#files[@]}" -eq 0 ]; then
  echo "[rotate] Nothing to delete."
  exit 0
fi

echo "[rotate] Candidates (${#files[@]}):"
printf ' - %s
' "${files[@]}"

if [ "$DRY_RUN" = "1" ]; then
  echo "[rotate] DRY_RUN=1 => no files deleted."
  echo "         To delete: KEEP_DAYS=$KEEP_DAYS DRY_RUN=0 $0"
  exit 0
fi

for f in "${files[@]}"; do
  rm -f -- "$f"
done

echo "[rotate] Deleted ${#files[@]} files."
