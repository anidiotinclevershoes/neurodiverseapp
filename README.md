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

Copy `.env.example`. Point `DATABASE_URL` / `SUPABASE_*` / `VITE_SUPABASE_*` at a real project. Apply committed migrations only:

```bash
npm run migrate:hosted
npm run dev
```

Sign in with Supabase email + password. Add the second member by the email of an account that already exists.

## Docs

| Document | Purpose |
| --- | --- |
| [PRODUCT.md](PRODUCT.md) | V1 scope |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layers and contracts |
| [ENGINEERING_RULES.md](ENGINEERING_RULES.md) | How to change the code |
| [TEST_STRATEGY.md](TEST_STRATEGY.md) | What blocks merge |
| [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | Debt |
| [DECISIONS/](DECISIONS/) | ADRs |
