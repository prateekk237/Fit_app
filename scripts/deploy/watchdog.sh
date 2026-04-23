#!/bin/bash
# Protects AssetShield from a runaway Fit. Runs every minute via cron.
# Stops Fit containers if:
#   (a) host free RAM drops below 300 MB, or
#   (b) AssetShield stops returning 200 / 301 / 302.
#
# Install:
#   chmod +x watchdog.sh
#   sudo touch /var/log/fit-watchdog.log
#   sudo chown deploy:deploy /var/log/fit-watchdog.log
#   crontab -e  →  * * * * * /home/deploy/apps/fit/watchdog.sh

set -u

THRESHOLD_MB=300
LOG=/var/log/fit-watchdog.log
COMPOSE_DIR=/home/deploy/apps/fit
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.prod.yml"

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

AVAIL=$(free -m | awk '/^Mem:/ {print $7}')
FIT_RUNNING=$(docker ps --filter "name=fit-app" --format "{{.Names}}" | wc -l)

# (a) Low RAM guard
if [ "$AVAIL" -lt "$THRESHOLD_MB" ] && [ "$FIT_RUNNING" -gt 0 ]; then
  log "CRITICAL: only ${AVAIL}MB available. Stopping Fit to protect AssetShield."
  cd "$COMPOSE_DIR" && docker compose -f "$COMPOSE_FILE" stop fit-app fit-postgres
fi

# (b) AssetShield health guard
ASSET=$(curl -s -m 5 -o /dev/null -w '%{http_code}' https://assetshield.co.in || echo '000')
case "$ASSET" in
  200|301|302) ;;
  *)
    log "AssetShield returned ${ASSET}. Stopping Fit as precaution."
    cd "$COMPOSE_DIR" && docker compose -f "$COMPOSE_FILE" stop fit-app fit-postgres
    ;;
esac
