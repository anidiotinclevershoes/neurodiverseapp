# CHECKPOINT.md

**Status:** current  
**Last verified:** 2026-08-31  
**Kind:** current known-good state — start here before changing the codebase

**verified_commit:** ae5132d on `cursor/phase-1a-prove-the-spine-6d7b`

---

## Known-good commands

```bash
# Postgres 16 required for persistence/RLS/HTTP tests
export DATABASE_URL=postgres://ndapp:ndapp@127.0.0.1:5432/ndapp
export JWT_SECRET=dev-only-change-me
npm install
npm test          # domain + application + postgres RLS + HTTP journey
npm run typecheck
npm run lint
npm run build
npm run dev       # API :3000 + Vite :5173
```

Fresh schema: first API start with `APPLY_SCHEMA=1` applies `supabase/shims/auth_uid.sql` then `supabase/migrations/20260831200000_phase1a_spine.sql` if `households` is missing. Tests reset and re-apply the schema themselves.

## What exists

- Phase 0 domain engine (unchanged financial rules).
- Application commands: `createHousehold`, `addMember`, `getMonth`, `setIncome`, `setAllocation`, `saveMonth`.
- Postgres persistence + RLS. Command API (Hono). Minimal mobile-first web UI.
- Auth: email + password JWT (`app_users`). Add member by existing email (unknown emails are a silent no-op).

## What is proven

- Two authenticated users can share one household month.
- Income + one allocation persist; reload matches; second member refresh matches.
- Derived remaining / unallocated / headline come from `calculateBudget` only.
- Another household cannot read this month (application NOT_FOUND isolation + RLS zero rows).
- Role `ndapp_authenticated` cannot UPDATE budget tables.
- Stale `expectedRevision` → CONFLICT; newer income preserved.
- Failed store update → UNAVAILABLE; authoritative income stays at the previous value; retry works.
- Unauthenticated HTTP `/month` is 401.
- Domain tests remain green. Persistence tests run against real Postgres when `DATABASE_URL` is set.

## What is not proven

- Hosted Supabase Auth / OTP email.
- iPhone 13 / Nothing Phone on a public URL (app is local `npm run dev`).
- Bills, spend, extra transfers, payday checklist.
- Invite confirm-join (member is added when their email already has an account).

## Current architecture

UI (Vite/React) → Hono command API (JWT) → `createBudgetApp` → `calculateBudget` → Postgres (RLS on SELECT; writes via server role after membership check). Manual refresh. No realtime. See `ARCHITECTURE.md`.

## Next intended step

Payday transfer slice: accounts + bills, derived recommended moves, still no bank connections. Do not start that until this spine PR is accepted.
