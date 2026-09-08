# Database

Committed migrations in `migrations/` are the only schema that may run on **hosted Supabase**.

Runtime isolation is applied in `20260905120000_phase1b_rls_runtime.sql`: production queries must run as `authenticated` with JWT claims. See ADR 0013.

`shims/auth_uid.sql` is **local/CI only**. It fabricates `auth.uid()` (from `request.jwt.claim.sub` or `request.jwt.claims`) and a thin `auth.users` table so Postgres 16 in GitHub Actions can exercise the same RLS policies.

Do not run the shim against `*.supabase.co`. `npm run migrate:hosted` applies migrations only. `APPLY_SCHEMA=1` is refused when `DATABASE_URL` looks hosted.
