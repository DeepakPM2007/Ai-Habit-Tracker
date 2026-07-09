# Level Up

Level Up is a mobile-first Progressive Web App for building good habits and quitting bad habits with coins, XP, rewards, and streak protection.

## What Is Built

- React + TypeScript PWA powered by Vite
- Offline app shell through `public/sw.js`
- Installable manifest and app icon
- Local-first IndexedDB persistence through Dexie
- Seeded habits, rewards, XP, coins, health, and streak state
- Wallet ledger with idempotency keys for backend sync safety
- AI-style streak protection planner that emits strict JSON-shaped schedule adjustments
- Sync mutation queue for future backend replay
- PostgreSQL schema in `docs/database-schema.sql`

## Run Locally

```bash
npm install
npm run dev
```

Build the production app:

```bash
npm run build
```

## Key Folders

```txt
src/
  app/                 App shell and mobile navigation
  db/                  Dexie client, IndexedDB schema, seed data
  features/aiPlanner/  Strict JSON streak protection planner
  hooks/               Local-first app store
  pwa/                 Service worker registration
  services/            Browser/network services
  styles/              Mobile-first global styles
  types/               Domain models
  utils/               Dates, IDs, XP/level math
```

## Backend Direction

The app currently runs local-first. The next backend step is to expose authenticated sync endpoints that accept `sync_mutations`, replay idempotent wallet transactions, and persist the canonical PostgreSQL models from `docs/database-schema.sql`.
