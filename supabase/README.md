# Database

Committed migrations in `migrations/` are the only schema that may run on **hosted Supabase**.

`shims/auth_uid.sql` is **local/CI only**. It fabricates `auth.uid()` and a thin `auth.users` table so Postgres 16 in GitHub Actions can exercise the same RLS policies.

Do not run the shim against `*.supabase.co`. `npm run migrate:hosted` applies migrations only. `APPLY_SCHEMA=1` is refused when `DATABASE_URL` looks hosted.
