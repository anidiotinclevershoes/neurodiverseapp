# NDApp

Mobile-first household support for neurodivergent adults. V1 is **The Budget Button**. It does not move money.

Start at [`CHECKPOINT.md`](CHECKPOINT.md).

## Local CI (no hosted secrets)

PostgreSQL 16:

```bash
export DATABASE_URL=postgres://ndapp:ndapp@127.0.0.1:5432/ndapp
npm install
npm test
npm run typecheck
npm run lint
npm run build
```

This path uses the test-only `auth.uid()` shim. It never talks to supabase.co.

## Hosted development

`DATABASE_URL` is required at **runtime** on the server (direct Postgres, RLS-scoped per request). It is also used for migrations and local CI. The browser only needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

Copy `.env.example`. Apply committed migrations only (includes the RLS-runtime migration):

```bash
npm run migrate:hosted
npm run dev
```

Sign in with Supabase email + password. Email confirmation stays **disabled** for this private two-person V1. Add the second member by the email of an account that already exists.

Do not paste secrets into chat. Service role is optional (hosted tests / admin only).

### Owner actions that the agent cannot do

1. Put server env on Vercel (no `VITE_` prefix): `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`. Use the pooler URI (port 6543) on Vercel if the direct host blocks serverless.
2. Put browser env on Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (same URL and anon key).
3. From a machine that can reach the database: `npm run migrate:hosted` (session URI port 5432 if the pooler rejects migration SQL).
4. Leave **Confirm email** disabled in Supabase Auth (private V1).
5. Deploy this branch (Vite, Node 22). Send the public URL when it is up.
6. Two-phone smoke: both members see the same August 2026 figures; a third account does not.

Phase 1A custom JWT / `app_users` / `JWT_SECRET` are already deleted. The local auth shim stays for CI only.

## Docs

| Document | Purpose |
| --- | --- |
| [PRODUCT.md](PRODUCT.md) | V1 scope |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layers and contracts |
| [ENGINEERING_RULES.md](ENGINEERING_RULES.md) | How to change the code |
| [TEST_STRATEGY.md](TEST_STRATEGY.md) | What blocks merge |
| [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | Debt |
| [DECISIONS/](DECISIONS/) | ADRs |
