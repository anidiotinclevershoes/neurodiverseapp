# 0012 — Local Postgres CI plus optional hosted Supabase tests

**Status:** accepted  
**Date:** 2026-08-31  
**Kind:** current decision

## Context

CI cannot run a full Supabase stack without Docker or secrets. Hosted RLS must still be proven. Sharing one production household with tests would destroy real data.

## Decision

- **Merge-blocking CI** uses PostgreSQL 16 + `supabase/shims/auth_uid.sql` + an injected access-token verifier. That proves schema, revision, isolation, and command behaviour quickly.
- The shim is **test/local only**. `applySpineSchema({ includeAuthShim: true })` throws if `DATABASE_URL` contains `supabase.co` or `NDAPP_FORBID_AUTH_SHIM=1`.
- **Hosted proof** uses a real Supabase project: `NDAPP_HOSTED_TESTS=1` plus `SUPABASE_*` and `HOSTED_DATABASE_URL`. Tests create disposable `@ndapp.test` users and delete them.
- Hosted CI job runs only when repo variable `NDAPP_HOSTED_TESTS=1` is set. Secrets never go in the repo.
- Do not migrate Phase 1A local demo rows. Hosted starts clean.

## Consequences

- Local and hosted must apply the same files in `supabase/migrations/`.
- Semantic drift is caught by the hosted suite when secrets exist, and by the agent’s hosted run during Phase 1B.
