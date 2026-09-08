# CHECKPOINT.md

**Status:** current  
**Last verified:** 2026-09-08  
**Kind:** current known-good state — start here before changing the codebase

**verified_commit:** Phase 1B branch `cursor/phase-1b-production-spine-6d7b`

---

## Known-good commands

```bash
# Merge-blocking local gates (Postgres 16 + auth shim)
export DATABASE_URL=postgres://ndapp:ndapp@127.0.0.1:5432/ndapp
npm install
npm test
npm run typecheck
npm run lint
npm run build

# Hosted API + UI (requires a real Supabase project)
export DATABASE_URL="$HOSTED_DATABASE_URL"
export SUPABASE_URL=https://YOUR_PROJECT.supabase.co
export SUPABASE_ANON_KEY=...
export VITE_SUPABASE_URL="$SUPABASE_URL"
export VITE_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY"
npm run migrate:hosted   # committed SQL only — never the local auth shim
npm run dev              # API :3000 + Vite :5173
```

`npm run build` also bundles the Vercel Node function (`api/index.js`) from `src/server/vercel-entry.ts`. That artifact must not import `.ts` files; CI loads it with Node.

`APPLY_SCHEMA=1` is local/CI only and is refused when `DATABASE_URL` is a `supabase.co` host.

## What exists

- Phase 0 domain engine (unchanged).
- Application commands unchanged: `createHousehold`, `addMember`, `getMonth`, `setIncome`, `setAllocation`, `saveMonth`.
- **Production persistence** is `createPostgresStore(pool, userId)`: each command runs in a transaction as Postgres role `authenticated` with the signed-in user's JWT claims. `auth.uid()` reads those claims. RLS is the isolation boundary.
- Command API verifies **Supabase Auth** access tokens (`getUser`) and builds a **per-request** store for that `user.id`. Custom JWT/password hashing is gone.
- Minimal mobile-first UI signs in with Supabase email + password.
- Email confirmation is **intentionally disabled** for this trusted private two-person V1. Revisit before any public or untrusted-user release.

## What is proven locally (CI)

- Same spine contracts as Phase 1A, with identity injected as a token verifier (stand-in for `getUser`).
- The **same adapter used in production** cannot read or write another household.
- Authenticated members succeed through that adapter; non-members cannot join another household through it.
- Stale revision is still 409; failed persistence is still `UNAVAILABLE`.
- Custom `/auth/sign-up` and `/auth/sign-in` are gone (404). Junk tokens are 401.
- Local shim cannot be applied to a `supabase.co` URL.
- Browser production build contains no service-role / JWT_SECRET strings.
- The Vercel function artifact is a bundled `api/index.js`. Node can load it without `.ts` imports; `/health` is 200 and `/households` reaches application auth (401 when signed out).

## What hosted proof requires

A live Supabase project + public deploy, **after** `npm run migrate:hosted` includes `20260905120000_phase1b_rls_runtime.sql`. Run `NDAPP_HOSTED_TESTS=1 npm test` against that project. Do not point hosted tests at the first household’s long-lived data if a separate test project exists.

## What is not this phase

Payday transfers, bills, spend, OTP mail, native apps, public-signup hardening, MFA, email-confirmation UX.

## Current architecture

```
browser Supabase session
  → Hono getUser(access token)
  → createBudgetApp(createPostgresStore(pool, userId))
  → SET LOCAL ROLE authenticated + JWT claims
  → auth.uid() → RLS
  → calculateBudget
```

`DATABASE_URL` is required at **runtime** on the server (and for migrations/CI). It is not a browser variable. See `ARCHITECTURE.md` and ADR 0013.

## Next intended step

Finish hosted deployment (owner secrets + migrate + Vercel). Payday only after the hosted spine is accepted.
