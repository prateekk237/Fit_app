# Fit — VPS Deployment Runbook

Single-user PWA deployed on Hostinger KVM 1 (4 GB / 2 vCPU) alongside
AssetShield. Coexistence is non-negotiable — AssetShield ranks above Fit.

## Resource budget (hard)

| Component | RAM cap | CPU |
| --- | --- | --- |
| `fit-app` (Next.js standalone) | 500 MB | 0.7 |
| `fit-postgres` (Postgres 16-alpine) | 250 MB | 0.5 |
| **Total Fit** | **≤ 750 MB** | — |

Both containers carry `oom_score_adj: 500` — the kernel kills Fit first
if RAM pressure hits.

## Ports (127.0.0.1 only)

| Service | Port | Bind |
| --- | --- | --- |
| fit-app | 3100 | 127.0.0.1 |
| fit-postgres | 5433 | 127.0.0.1 |
| Public subdomain | `fit.assetshield.co.in` | via host Nginx → 3100 |

AssetShield's existing ports (3000 / 4000 / 5432 / 1883 / 8883) are
untouched.

---

## First-time setup (~ 60 min)

### 1. Baseline audit

```bash
ssh deploy@<VPS_IP>
mkdir -p /home/deploy/apps/fit/{backups,logs}
cd /home/deploy/apps/fit
bash scripts/deploy/audit-pre-fit.sh   # aborts if ports busy, RAM low, AssetShield sick
```

Snapshot is saved under `~/fit-deployment/snapshots/<timestamp>/`.

### 2. Upload deploy assets

From your laptop (or via git clone on the VPS):

```bash
scp docker-compose.prod.yml  deploy@VPS:/home/deploy/apps/fit/
scp scripts/deploy/*.sh      deploy@VPS:/home/deploy/apps/fit/
scp deploy/nginx-fit.conf    deploy@VPS:/tmp/
```

### 3. Environment file

Create `/home/deploy/apps/fit/.env.production` (chmod 600):

```env
GITHUB_USER=<your-github-username>
IMAGE_TAG=latest

POSTGRES_USER=fit
POSTGRES_PASSWORD=<long random password>
POSTGRES_DB=fit

JWT_SECRET=<openssl rand -hex 32>

NVIDIA_API_KEY=nvapi-…
GROQ_API_KEY=
GEMINI_API_KEY=

VAPID_PUBLIC_KEY=<npx web-push generate-vapid-keys — public>
VAPID_PRIVATE_KEY=<… private>
VAPID_SUBJECT=mailto:you@example.com
```

### 4. DNS

In Cloudflare / your registrar:

- A record `fit.assetshield.co.in` → VPS_IP
- Proxy **off** (grey cloud) during setup — turn on later if desired
- TTL 300

### 5. TLS cert

```bash
sudo certbot certonly --nginx -d fit.assetshield.co.in \
  --non-interactive --agree-tos -m assetshieldsupport@gmail.com
```

### 6. Nginx

```bash
sudo cp /tmp/nginx-fit.conf /etc/nginx/sites-available/fit.assetshield.co.in
sudo ln -s /etc/nginx/sites-available/fit.assetshield.co.in /etc/nginx/sites-enabled/
sudo nginx -t                 # MUST pass
sudo systemctl reload nginx
curl -sI https://assetshield.co.in | head -1   # must still be 200/301/302
```

### 7. Watchdog cron

```bash
chmod +x /home/deploy/apps/fit/watchdog.sh
sudo touch /var/log/fit-watchdog.log
sudo chown deploy:deploy /var/log/fit-watchdog.log
crontab -e
# Add this line:
* * * * * /home/deploy/apps/fit/watchdog.sh
```

### 8. Pull the image, start services

```bash
cd /home/deploy/apps/fit

# Login to GHCR with a personal access token (read:packages).
echo <GHCR_PAT> | docker login ghcr.io -u <github-user> --password-stdin

set -o allexport && source .env.production && set +o allexport

docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d fit-postgres
sleep 20
free -h

docker compose -f docker-compose.prod.yml run --rm fit-migrate
docker compose -f docker-compose.prod.yml up -d fit-app

curl http://127.0.0.1:3100/api/health
docker stats --no-stream
```

### 9. End-to-end smoke from phone

- Open `https://fit.assetshield.co.in`
- Log in with PIN `123456`, change to your preference in Profile
- Take a food photo → confirm the AI pipeline returns JSON
- Install to home screen (Samsung Z Fold 7 Chrome menu → "Install app")
- Enable notifications → verify a push arrives (e.g. via manual
  `POST /api/alerts/evaluate`)

### 10. Monitor first 24 hours

```bash
tail -f /var/log/fit-watchdog.log
docker compose -f docker-compose.prod.yml logs -f
```

---

## CI/CD after first deploy

Pushes to `main` trigger `.github/workflows/deploy.yml` which:

1. Builds the image on GitHub Actions runners (never on the VPS).
2. Pushes to `ghcr.io/<owner>/fit-pwa:{latest,sha-<sha>}`.
3. SSH into VPS, runs `audit-pre-fit`-style checks inline, pulls the
   new image, runs migrations, swaps `fit-app`, health-polls.
4. Verifies both `https://assetshield.co.in` **and**
   `https://fit.assetshield.co.in` still return 200 / 301 / 302.

GitHub secrets required: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.
`GITHUB_TOKEN` is auto-provided.

---

## Emergency rollback (30 s)

```bash
cd /home/deploy/apps/fit
docker compose -f docker-compose.prod.yml down
sudo rm /etc/nginx/sites-enabled/fit.assetshield.co.in
sudo nginx -t && sudo systemctl reload nginx
curl -I https://assetshield.co.in
```

AssetShield is restored; Fit is offline until you fix and re-deploy.

---

## KVM 1 tradeoffs accepted

- NIM photo analysis may 5–10 % fail on first try → the fallback chain
  (Groq / Gemini) handles it automatically.
- Cold start ~ 40 s (vs ~ 15 s on KVM 2).
- No Redis → food search hits Postgres every time (fine for 1 user).
- Watchdog may auto-stop Fit during AssetShield traffic spikes —
  that's working as designed.

### Upgrade to KVM 2 if

- Watchdog stops Fit ≥ 3 times/week (check `/var/log/fit-watchdog.log`)
- AssetShield RAM steady > 2.5 GB
- A second user is added
- Redis caching becomes necessary
