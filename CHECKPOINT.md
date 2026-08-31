# CHECKPOINT.md

**Status:** current  
**Last verified:** 2026-08-31  
**Kind:** current known-good state — start here before changing the codebase

---

## What exists

- Authoritative documentation set (this file, `PRODUCT.md`, `ARCHITECTURE.md`, `ENGINEERING_RULES.md`, `TEST_STRATEGY.md`, `KNOWN_ISSUES.md`, `DECISIONS/*`, `AGENTS.md`).
- Pure domain engine: `src/domain/money.ts`, `src/domain/budget.ts`.
- Domain tests: 21 Vitest examples covering money safety and budget invariants.
- CI: GitHub Actions running `typecheck`, `lint`, and `test` on pull requests and `main`.
- Tooling: TypeScript (strict), Vitest, ESLint flat config, Node 22.

## What is proven

- Integer minor-unit money rejects floats and currency mismatch.
- `calculateBudget` is deterministic and conserves plan identity.
- Payday transfer recommendations do not double-count bills.
- Overspend and unexpected spend are visible, not clamped.
- Category removal is explicit and does not mutate a different month’s input object.
- `npm test`, `npm run typecheck`, and `npm run lint` pass locally as of this checkpoint.

## What is not proven

- Persistence, RLS, auth, multi-user refresh, UI, or device UX on iPhone 13 / Nothing Phone (3a).
- A live Supabase project.

## Current architecture

Web-first mobile UI (not built) → application commands (not built) → **pure domain engine (built)** → Supabase/Postgres (chosen, not built). Manual refresh. No payments. See `ARCHITECTURE.md`.

## Current known limitations

See `KNOWN_ISSUES.md`. Phase 0 did not implement The Budget Button.

## Next intended step (first vertical slice)

**Do not expand this slice.** It exists to prove the architecture, not to finish the product.

1. Provision Supabase (or equivalent Postgres+Auth) with `households` and `household_members` and RLS.
2. Auth: two real users, magic link (or password fallback).
3. Create one household; both users are members.
4. Open a month; set monthly income (integer minor units).
5. Create one category and one allocation; persist.
6. Server (or application layer) runs `calculateBudget`; remaining / headline is derived, not typed in by the user.
7. Reload as user A: identical state.
8. Refresh as user B: identical allocation and identical derived remaining.
9. A third user / other household cannot read that data.
10. A failed save does not display success.

**Out of this slice:** bills, multiple accounts, payday transfer checklist, history UI, PWA/service worker, realtime, native apps, spend recording UI, recovery UX polish.

### Why this slice (and not a bigger one)

It crosses every dangerous boundary: auth, membership, command, persistence, pure calculation, reload, second device, isolation, failure visibility.

Payday transfers are important product, but they do not prove tenancy. They are the next slice after this one is green.
