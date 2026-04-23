#!/bin/bash
# Pre-deployment audit. Run on the VPS BEFORE the first Fit deploy to
# baseline state + confirm nothing is occupying the ports Fit needs.
# Abort the deploy if any check fails.
set -e

TS=$(date +%Y%m%d_%H%M%S)
SNAP_DIR=~/fit-deployment/snapshots/$TS
mkdir -p "$SNAP_DIR"
cd "$SNAP_DIR"

echo "=== Snapshot: $(pwd) ==="

echo "--- containers ---"
sudo docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" > containers.txt
cat containers.txt

echo "--- stats ---"
sudo docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}" > stats.txt
cat stats.txt

echo "--- listening ports ---"
sudo lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | grep -v "127.0.0.53" > ports.txt || true
cat ports.txt

echo "--- memory ---"
free -h > memory.txt
cat memory.txt

echo "--- disk ---"
df -h / > disk.txt
cat disk.txt

echo "--- Fit ports expectation ---"
if sudo lsof -iTCP:3100 -sTCP:LISTEN 2>/dev/null; then
  echo "ABORT: port 3100 already in use" && exit 1
else
  echo "3100: FREE ✓"
fi
if sudo lsof -iTCP:5433 -sTCP:LISTEN 2>/dev/null; then
  echo "ABORT: port 5433 already in use" && exit 1
else
  echo "5433: FREE ✓"
fi

echo "--- AssetShield health ---"
ASSET=$(curl -s -o /dev/null -w '%{http_code}' https://assetshield.co.in || echo '000')
echo "AssetShield: $ASSET"
case "$ASSET" in
  200|301|302)
    echo "AssetShield healthy ✓"
    ;;
  *)
    echo "ABORT: AssetShield returned $ASSET — fix that first before deploying Fit"
    exit 1
    ;;
esac

echo "--- Resource budget ---"
FREE_MB=$(free -m | awk '/^Mem:/ {print $7}')
DISK_AVAIL_GB=$(df --output=avail -BG / | tail -1 | tr -dc '0-9')
echo "Free RAM: ${FREE_MB}MB (need ≥ 1200)"
echo "Free disk: ${DISK_AVAIL_GB}GB (need ≥ 8)"
if [ "$FREE_MB" -lt 1200 ]; then echo "ABORT: need ≥ 1.2 GB free RAM" && exit 1; fi
if [ "$DISK_AVAIL_GB" -lt 8 ]; then echo "ABORT: need ≥ 8 GB free disk" && exit 1; fi

echo
echo "✅ Pre-deploy audit passed. Snapshot: $SNAP_DIR"
