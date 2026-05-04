# Fit — Deployment

Two supported targets, pick one:

- **Vercel + Neon + R2 (recommended, ₹0/mo)** — see below.
- **Hostinger VPS Docker** — see [`DEPLOY-VPS.md`](./DEPLOY-VPS.md).

---

# Vercel + Neon + Cloudflare R2

| Layer | Service | Free tier headroom |
| --- | --- | --- |
| Hosting | Vercel Hobby | 100 GB bandwidth, 100 GB-hr functions |
| Database | Neon Postgres (Singapore) | 0.5 GB, auto-pauses 5 min idle |
| Image storage | Cloudflare R2 | 10 GB, free egress |
| Cron | cron-job.org | unlimited HTTP triggers |
| AI | NVIDIA NIM + Groq + Gemini fallback | 40 / 30 / 10 RPM |

Total: **₹0/month** with **zero AssetShield risk** (fully isolated).

---

## 0. Pre-reqs

- GitHub repo pushed up to date
- A NIM API key (https://build.nvidia.com)
- (Optional) Groq + Gemini keys for fallback resilience

## 1. Neon Postgres — 10 min

1. Sign in at https://neon.tech with GitHub.
2. **Create project**: `fit-pwa`, Postgres 16, region **Singapore (sin-1)**, db `fitdb`.
3. Copy the connection string. Append `&connect_timeout=10&pool_timeout=10` for graceful resume.
4. From your laptop with that string in `.env.local`:

   ```bash
   pnpm prisma migrate deploy
   pnpm prisma db seed
   ```

5. Verify in Neon SQL Editor: `SELECT COUNT(*) FROM foods;` → `120`.

## 2. Cloudflare R2 — 10 min

1. Sign up at https://cloudflare.com.
2. **R2 → Create bucket** `fit-uploads`, region **APAC**.
3. **Manage R2 API Tokens → Create**: name `fit-pwa-token`, scope **Object Read & Write** to `fit-uploads`. Capture `Access Key ID`, `Secret`, `Account ID`.
4. **Bucket settings → Public Access → Allow access via custom subdomain** (the app uses an auth-gated proxy route, but R2's public URL keeps things simple). Capture `R2_PUBLIC_URL`.

## 3. Vercel — 15 min

1. Sign up at https://vercel.com with GitHub.
2. **Add New Project** → import this repo. Framework auto-detects Next.js. Default build/install commands.
3. **Settings → Environment Variables** (Production):

   ```
   DATABASE_URL              postgresql://…neon.tech/fitdb?sslmode=require&connect_timeout=10
   JWT_SECRET                <openssl rand -base64 48>
   NVIDIA_API_KEY            nvapi-…
   GROQ_API_KEY              gsk_…              (optional)
   GEMINI_API_KEY            AIza…              (optional)
   VAPID_PUBLIC_KEY          <web-push generate>
   VAPID_PRIVATE_KEY         <web-push generate>
   VAPID_SUBJECT             mailto:you@example.com
   NEXT_PUBLIC_VAPID_PUBLIC_KEY  <same as VAPID_PUBLIC_KEY>
   R2_ACCOUNT_ID             …
   R2_ACCESS_KEY_ID          …
   R2_SECRET_ACCESS_KEY      …
   R2_BUCKET_NAME            fit-uploads
   R2_PUBLIC_URL             https://pub-xxx.r2.dev
   CRON_SECRET               <openssl rand -base64 32>
   NEXT_PUBLIC_APP_URL       https://fit-yourname.vercel.app
   FIT_ENABLE_CRON           false
   ```

4. **Deploy.** Get the auto-assigned `*.vercel.app` URL.
5. Optional custom domain: **Settings → Domains → Add `fit.assetshield.co.in`** → add the CNAME Vercel gives you in Cloudflare DNS. SSL auto-provisions.

## 4. cron-job.org — 5 min

Sign up at https://cron-job.org. Three jobs, all method `GET` with custom header `Authorization: Bearer <CRON_SECRET>`:

| Job | URL | Schedule |
| --- | --- | --- |
| `fit-alerts` | `https://<app>/api/cron/alerts` | every 15 min |
| `fit-weekly` | `https://<app>/api/cron/weekly-digest` | Sun 21:00 Asia/Kolkata |
| `fit-keepalive` | `https://<app>/api/cron/keepalive` | every 4 min, 07:00–23:00 IST |

Test each job once via the "Run now" button — execution log should report `200 OK`.

## 5. Smoke test from your phone — 5 min

1. Open the Vercel URL.
2. Login with PIN `123456`. Change it under Profile → Security.
3. Take a food photo → confirm AI returns real items (not `provider: "mock"`).
4. Chrome menu → **Install app** → Fit appears full-screen on the home screen.
5. Enable notifications when prompted; trigger a test push by hitting `POST /api/alerts/evaluate` with the session cookie (or wait 15 min for the cron tick).
6. Add a weight log → confirm the dashboard ring + weight trend update.

---

## What changes vs. local dev

The same code runs in both places. Behaviour switches based on env presence:

| Env var | Effect |
| --- | --- |
| `R2_BUCKET_NAME` set | Photos go to R2; otherwise saved to `./uploads/` |
| `CRON_SECRET` set | `/api/cron/*` accepts cron-job.org pings |
| `FIT_ENABLE_CRON=true` | Run node-cron in-process (Hostinger VPS only) |

## Free-tier guard rails baked in

- AI photo route: `maxDuration = 10` + per-provider Promise.race timeouts (NIM 8 s → Groq 7 s → Gemini 6 s). Worst case still finishes inside Vercel's 10 s budget.
- Storage: R2 Class B reads cached for 7 days client-side via the SW (`fit-photos` cache).
- Neon: keepalive cron (4 min during waking hours) avoids cold-pause stalls on the first food log.
- Web Push: VAPID-signed payloads; the SW handler that landed in Phase 12 is environment-agnostic — works identically on Vercel.

---

## Emergency rollback

Vercel keeps every deployment. **Project → Deployments → previous green one → "Promote to Production"**. Takes ~10 s. Or revert the offending commit on `main` and push — auto-redeploys.

For DNS cutover: in Cloudflare DNS, delete the `fit` CNAME — the subdomain stops resolving, AssetShield is unaffected.

---

## Trade-offs accepted

| What | Mitigation |
| --- | --- |
| 200–400 ms latency to India (US/EU edge) | Static pages cached by SW; only API calls feel it |
| 3–5 s cold start on idle DB | `keepalive` cron during waking hours |
| ~2 % photo failures (provider chain still timing out) | Toast "Try again" UX in Phase 6 already covers this |
| Vercel commercial-use email (single user, unlikely) | Switch to `DEPLOY-VPS.md` if it ever happens |

---

## When to migrate to the Hostinger VPS plan

- 2nd user added (family / friend)
- Heavy continuous use (alerts firing 50+ times/day)
- Vercel free-tier limit hit
- You want sub-100 ms latency from India

Both deployment plans use the same source tree — pivoting takes the runbook in `DEPLOY-VPS.md` and changing `R2_*` to `UPLOADS_DIR=/var/fit/uploads` in env. No code changes.
