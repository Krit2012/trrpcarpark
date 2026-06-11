# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

TRRP Car Park — a parking management web app (check-in/check-out, fee calculation, monthly members, tenant companies, user/role admin). UI and all user-facing error messages are in **Thai**. No build step, no framework, no test suite.

## Commands

```bash
# Local dev — Express + JSON file store (db.json), port 3001
npm start            # or: npm run dev  → node server.js

# Local dev against Cloudflare Pages Functions + D1 (mirrors production)
npx wrangler pages dev public --d1=DB

# Apply / reset the D1 schema (production database)
npx wrangler d1 execute trrp-carpark-db --file=./schema.sql --remote
```

There are no tests, no linter, and no build. The frontend is static files in `public/` served as-is.

## Architecture

### Two backends implementing the SAME API — keep them in sync

The HTTP API (`/api/carpark/*`) is implemented **twice**, with duplicated logic:

- [server.js](server.js) — Express, used for **local development**. Persists to `db.json` via [db.js](db.js) (a flat JSON file read/written on every request).
- [functions/api/\[\[route\]\].js](functions/api/[[route]].js) — Cloudflare Pages Function, used in **production**. Persists to a **D1 (SQLite)** database bound as `env.DB` (see [wrangler.toml](wrangler.toml)).

**Any endpoint change must be made in both files**, with matching validation, Thai error strings, and response shapes. The two stores differ: `db.js` keeps booleans/numbers natively; D1 stores `isExecutive` as `0/1` and `settings.value` as TEXT, so the D1 path casts on read (see the `.map(...)` reshaping in the `GET /api/carpark/data` handler).

### Schema migrations live in two places

- D1: [schema.sql](schema.sql) is the canonical schema, **plus** `[[route]].js` runs **self-healing migrations** at the top of every request (try `SELECT col` → on failure `ALTER TABLE ADD COLUMN`). When you add a column, add it to both schema.sql and this self-healing block.
- JSON: [db.js](db.js) `readCarparkDB()` does equivalent in-place migrations (backfilling missing fields with defaults, then rewriting the file).

### Frontend — vanilla JS, offline-first mirror

[public/app.js](public/app.js) (~2400 lines, no modules/bundler) holds all logic as global functions called from inline `onclick`/`onsubmit` in [public/index.html](public/index.html). State lives in module-level `let` variables (`users`, `monthlyVehicles`, `parkingLogs`, `logs`, `session`, ...).

- **Persistence is dual**: every mutation POSTs to the backend AND writes to `localStorage` (keys `trrp_db_users`, `trrp_db_monthly`, `trrp_db_companies`, `trrp_db_logs`, `trrp_session`). On load, the app renders from localStorage immediately, then `syncAllDataWithBackend()` reconciles against the server using `settings.syncVersion` — the server bumps this on every write (`bumpCarparkSyncVersion`).
- Single-page screen switching via `screenMap` / `tabButtonMap` (id-casing maps) and `switchMainScreen()`.
- Fee logic is **client-side**: `HOURLY_RATE = 20` THB/hr, `FREE_HOURS = 1` at the top of app.js.
- `xlsx` (CDN) drives Excel import (`importMonthlyFromExcel` → `/api/carpark/monthly/bulk-replace`) and export.

### Roles

Four roles gate navigation and dashboard actions, checked throughout app.js: `admin`, `user`, `Validator`, `BuildingAdmin`. `Validator` and `BuildingAdmin` carry a `company` and a `max_exemptedHours` cap (used for fee exemptions). Server-side guard: the last `admin` cannot be deleted.

### Authentication

Username + PIN. Users with `adUser === 'Y'` authenticate against the external TRR Active Directory API (`https://trr-api.trrgroup.com/.../Sys_auth_emp_profile_Get`) — both backends proxy this at `/api/carpark/login` and `/api/carpark/auth/verify-ad`. Non-AD users match a plaintext `pin` stored in the DB. No tokens/sessions on the server; the client holds the session in localStorage.

## Versioning convention

On a release, the version string is bumped in **four** spots together: `package.json` `version`, the `<title>` and login-card span in [public/index.html](public/index.html), and the `app.js?v=` cache-buster at the bottom of index.html. Recent commits follow `feat: <summary>, bump version to X.Y.Z`.
