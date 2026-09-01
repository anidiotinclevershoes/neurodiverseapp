# CHECKPOINT.md

**Status:** current  
**Last verified:** 2026-08-31  
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

`APPLY_SCHEMA=1` is local/CI only and is refused when `DATABASE_URL` is a `supabase.co` host.

## What exists

- Phase 0 domain engine (unchanged).
- Application commands unchanged: `createHousehold`, `addMember`, `getMonth`, `setIncome`, `setAllocation`, `saveMonth`.
- Postgres adapter talks to `auth.users` for email lookup.
- Command API verifies **Supabase Auth** access tokens (`getUser`). Custom JWT/password hashing is gone.
- Minimal mobile-first UI signs in with Supabase email + password.
- RLS on household tables; `authenticated` has SELECT only. Writes stay on the command path.

## What is proven locally (CI)

- Same spine contracts as Phase 1A, with identity injected as a token verifier (stand-in for `getUser`).
- Custom `/auth/sign-up` is gone (404). Junk tokens are 401.
- Local shim cannot be applied to a `supabase.co` URL.
- Browser production build contains no service-role / JWT_SECRET strings.

## What hosted proof requires

A live Supabase project + public deploy. Run `NDAPP_HOSTED_TESTS=1 npm test` against that project. Do not point hosted tests at the first household’s long-lived data if a separate test project exists.

## What is not this phase

Payday transfers, bills, spend, OTP mail, native apps.

## Current architecture

UI (Vite) → Supabase Auth session → Hono command API (`getUser`) → `createBudgetApp` → `calculateBudget` → hosted Postgres (or local CI Postgres). Manual refresh. See `ARCHITECTURE.md`.

## Next intended step

Payday transfer slice after the hosted spine is accepted.
