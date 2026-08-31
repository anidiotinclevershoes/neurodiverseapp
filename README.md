# NDApp

Mobile-first household support for neurodivergent adults. V1 is **The Budget Button** — it helps carry the executive-function burden of household money. It does not move money.

This repository is past Phase 0 (technical foundation). The product UI is not built yet.

## Current truth

Start at [`CHECKPOINT.md`](CHECKPOINT.md).

| Document | Purpose |
| --- | --- |
| [PRODUCT.md](PRODUCT.md) | V1 scope, deferred work, no-transaction rule |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layers, contracts, sync, schema direction |
| [ENGINEERING_RULES.md](ENGINEERING_RULES.md) | TDD, reuse, security, documentation freshness |
| [TEST_STRATEGY.md](TEST_STRATEGY.md) | What we test and what blocks merge |
| [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | Debt and concerns |
| [DECISIONS/](DECISIONS/) | Architecture Decision Records |

## Development

```bash
npm install
npm test
npm run typecheck
npm run lint
```

Node 22+. Domain code lives in `src/domain` and must stay free of UI, network, and database imports.
