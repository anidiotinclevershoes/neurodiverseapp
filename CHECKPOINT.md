# CHECKPOINT.md

**Status:** current  
**Last verified:** 2026-08-31  
**Kind:** current known-good state — start here before changing the codebase

**verified_commit:** `edc0ddd` (foundation commit). This file is updated in the same change as specialist integration.

---

## Known-good commands

```bash
npm install
npm test          # 22 passing domain tests
npm run typecheck
npm run lint
```

## What exists

- Authoritative documentation set (this file, `PRODUCT.md`, `ARCHITECTURE.md`, `ENGINEERING_RULES.md`, `TEST_STRATEGY.md`, `KNOWN_ISSUES.md`, `DECISIONS/*`, `AGENTS.md`).
- Pure domain engine: `src/domain/money.ts`, `src/domain/budget.ts` (folder is `src/domain`, not a `packages/` monorepo).
- Domain tests: Vitest examples covering money safety and budget invariants, including a named Food €500→€650 case.
- CI: GitHub Actions running `typecheck`, `lint`, domain-import isolation, and `test`.
- Tooling: TypeScript (strict), Vitest, ESLint flat config, Node 22.

## What is proven

- Integer minor-unit money rejects floats and currency mismatch.
- `calculateBudget` is deterministic and conserves plan identity.
- Payday transfer recommendations do not double-count bills.
- Overspend and unexpected spend are visible, not clamped.
- Category removal is explicit and does not mutate a different month’s input object.

## What is not proven

- Persistence, RLS, auth, multi-user refresh, UI, or device UX on iPhone 13 / Nothing Phone (3a).
- A live Supabase project.
- Extra-transfer payday math (schema named; engine still derives bill-funding only).

## Current architecture

Web-first mobile UI (not built) → **command API** (not built; only writer) → **pure domain engine (built)** → Postgres via Supabase (chosen, not built). Manual refresh. Optimistic concurrency on money. Email OTP. No payments. See `ARCHITECTURE.md`.

## Current known limitations

See `KNOWN_ISSUES.md`. Phase 0 did not implement The Budget Button.

## Specialist integration (accepted vs rejected)

Accepted into the docs above: command-only writes; 409 on stale month revision; email OTP not magic link; Capacitor as default later wrap; extras ≠ bill-funding; first slice includes one spend; isolation 404 not leaky 403.

Rejected (do not revive without a new ADR): `packages/` monorepo; event-sourced ledger; `{ state, events }` bus; rejecting over-allocation instead of showing negative leftover; moving all docs under `docs/`; Expo-from-day-one; service-worker PWA; client `update()` on budget tables; silent last-write-wins on money.

## Next intended step (first vertical slice)

**Do not expand this slice.** It exists to prove the architecture, not to finish the product.

1. Provision Supabase with `households` and `household_members` and RLS.
2. Auth: two real users, **email OTP** (password fallback if mail fails).
3. Create one household; both users are members (seed membership in SQL — skip invite UX).
4. Open a month; `SetIncome` (integer minor units).
5. One category, `SetAllocation`, one `RecordSpend` — all through the command path.
6. Server runs `calculateBudget`; remaining is derived, not typed in by the user.
7. Reload as user A: identical state and version.
8. Refresh as user B: identical allocation, spend, and derived remaining.
9. A third user / other household cannot read that data (**404**).
10. A failed save does not display success.
11. **No UI required for this extra:** two concurrent `SetIncome` with the same `expectedRevision` → one success, one **409**.

**Out of this slice:** bills, multiple accounts, payday transfer checklist, extra transfers UI, history UI, PWA/service worker, realtime, native apps, recovery UX polish, invite screens.

### Why this slice

It crosses auth, membership, command idempotency, persistence, pure calculation (allocation **and** spend), reload, second device, isolation, failure visibility, and stale concurrency — the spine — with one month, one category, one spend.

Payday transfers are the next product slice after this one is green. Invites are the slice after pairing is proven by seeded membership.
