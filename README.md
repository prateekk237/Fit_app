# Fit

Personal fitness & nutrition PWA for a single user (Prateek). Next.js 14 + Postgres + Prisma,
installed as a PWA on a Samsung Z Fold 7, deployed alongside AssetShield on a Hostinger KVM 1 VPS.

## Status: Phase 0 — scaffold only

Navigation shell, bottom tab bar, and an empty Prisma schema are in place. Features land phase
by phase per the master plan.

## Local dev

```bash
pnpm install            # installs deps + generates Prisma client
pnpm db:up              # Postgres 16 in Docker (port 5432)
pnpm prisma migrate dev # applies schema (empty in Phase 0)
pnpm dev                # http://localhost:3000
```

Other scripts:

```bash
pnpm db:down     # stop Postgres container
pnpm db:seed     # seed database (stub in Phase 0)
pnpm db:studio   # open Prisma Studio
pnpm typecheck   # tsc --noEmit
pnpm lint        # next lint
pnpm build       # production build (output: standalone)
```

## Environment

Copy `.env.example` to `.env.local` and fill in as phases require.

| Phase used | Key |
| --- | --- |
| 1+ | `DATABASE_URL` |
| 2+ | `JWT_SECRET` |
| 5+ | `NVIDIA_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY` |
| 12+ | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |

## Phase roadmap

| Phase | Deliverable |
| --- | --- |
| 0 | Project scaffold (this commit) |
| 1 | Prisma schema + 120-food seed + 50-exercise seed |
| 2 | 6-digit PIN login + profile page |
| 3 | Dashboard skeleton |
| 4 | Manual food logging |
| 5 | NVIDIA NIM integration |
| 6 | Camera/photo screen |
| 7 | Meal plan screen |
| 8 | Workouts with tracker |
| 9 | Exercise library |
| 10 | Water & weight tracking |
| 11 | Progress photos (body + face) & insights |
| 12 | Alerts & Web Push |
| 13 | AI weekly insights |
| 14 | PWA finalization |
| 15 | Polish |
| 16 | KVM 1-safe Docker deployment |

## Folder layout

```
app/
  (auth)/login/       - PIN login (Phase 2)
  (app)/              - authenticated shell with bottom nav
  api/                - API routes (Phase 2+)
components/
  ui/                 - shadcn primitives
  BottomNav.tsx       - 5-tab navigation
lib/
  db.ts               - PrismaClient singleton
  auth.ts             - JWT + bcrypt helpers (Phase 2)
  ai/                 - NIM client + fallback chain (Phase 5)
  alerts/             - rule engine + Web Push (Phase 12)
  utils.ts            - cn() helper
prisma/
  schema.prisma
  seed.ts
  seed/*.json         - source-of-truth seed data (Phase 1)
public/
  icons/              - PWA icons (Phase 14)
  exercises/          - wger exercise PNGs (Phase 1)
scripts/              - maintenance scripts
types/                - shared TS types
```

## License

Personal project — not open source.
