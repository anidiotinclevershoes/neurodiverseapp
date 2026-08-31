# NDApp

Mobile-first household support for neurodivergent adults. V1 is **The Budget Button**. Phase 1A proves the shared-household spine. It does not move money.

Start at [`CHECKPOINT.md`](CHECKPOINT.md).

## Run locally

PostgreSQL 16, then:

```bash
cp .env.example .env
# create role/database ndapp/ndapp if needed
export DATABASE_URL=postgres://ndapp:ndapp@127.0.0.1:5432/ndapp
export JWT_SECRET=dev-only-change-me
export APPLY_SCHEMA=1
npm install
npm test
npm run dev
```

Open http://127.0.0.1:5173 — create two accounts, create a household, add the second email, save income and one allocation, refresh on the other session.

## Docs

| Document | Purpose |
| --- | --- |
| [PRODUCT.md](PRODUCT.md) | V1 scope |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layers and contracts |
| [ENGINEERING_RULES.md](ENGINEERING_RULES.md) | How to change the code |
| [TEST_STRATEGY.md](TEST_STRATEGY.md) | What blocks merge |
| [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | Debt |
| [DECISIONS/](DECISIONS/) | ADRs |
