# TEST_STRATEGY.md

**Status:** current  
**Last verified:** 2026-08-31  
**Kind:** current test strategy

---

## Shape

We do not chase a decorative pyramid. We test the places this product will actually break.

| Layer | What it protects | Tool (V1) | When |
| --- | --- | --- | --- |
| Domain unit | Money + `calculateBudget` + invariants | Vitest | **Now** (Phase 0) |
| Application | Command handling, revision, mapping | Vitest | First vertical slice |
| Persistence | Writes, reload equality, migrations | Vitest + Supabase local / SQL tests | First slice |
| Security | Household isolation, unauthenticated deny | SQL tests + API tests | First slice — **merge-blocking** |
| UI integration | Intent submitted matches command | Vitest + Testing Library (later) | When UI exists |
| E2E journey | Two-user refresh / isolation in a browser | Playwright | After UI exists |
| Native E2E | — | Not in V1 (web-first) | Only if we later wrap (Capacitor) or rewrite (Expo) |

A previous project failed when layers looked healthy and **interactions** were wrong. Cross-layer journeys are first-class, not an afterthought.

---

## Distinctions

- **Unit / domain:** pure functions, no I/O. Fast, deterministic. This is the financial kernel.
- **Integration:** application + persistence (+ auth). May use a local Supabase or wrapped DB.
- **Persistence:** reload returns identical inputs; failed transaction does not commit half a month.
- **Auth/security:** another household cannot read or write; revoked members lose access; anon is denied.
- **E2E:** a real UI session. Few of these; each maps to a user-visible journey.
- **Regression:** the subset that must run on every PR (CI). Starts as domain tests; grows with the slice.

---

## Cross-layer contracts to protect

The canonical example:

> User changes Food allocation from €500 to €650  
> → UI submits the correct intent  
> → application handles the command  
> → authoritative state changes  
> → persistence succeeds  
> → budget recalculates (Food remaining is €650; unallocated falls by €150; headline does **not** increase — this is an earmark, not new income)  
> → reload returns identical state  
> → second household member sees €650 after refresh  
> → both members’ derived figures match  
> → a third user in another household still sees none of this

Until UI exists, the same journey is tested from the application boundary (command in, persisted state + `BudgetResult` out) plus a second-actor refresh. The UI test is added when there is a UI.

Other contracts:

1. Save failure does not flip UI/application state to “saved”.
2. Stale `expectedRevision` returns **409** and does not silently overwrite.
3. `removeCategory` reject-if-spent behaviour holds through persistence (row still present).
4. Closed-month snapshot is unchanged when an open month is edited (once months exist).
5. Isolation: unauthenticated 401; other household **404** on every resource type; revoked membership fails the next call with the same session.
6. The golden Food €500→€650 fixture is reused at domain, application, persist, and query layers — same assertions, different drivers. Do not re-derive the maths in the UI.

---

## Financial invariant tests

Named in domain tests and in this list. They live next to the engine in `src/domain/budget.test.ts` / `money.test.ts`.

| ID | Rule |
| --- | --- |
| INV-01 | Plan identity: `income = bills + extras + allocations + unallocated` (extras are 0 in the Phase 0 engine; unallocated may be negative) |
| INV-02 | Determinism: same inputs → same `BudgetResult` |
| INV-03 | Transfer recommendations + remain-in-payday = total bills (no double-count) |
| INV-04 | Derived values come only from inputs; tests compare engine output, not a second formula in the UI |
| INV-05 | Overspend is visible (negative remaining), never silently clamped |
| INV-06 | Unexpected uncategorized spend does not break INV-01; it hits the headline |
| INV-07 | Category delete is explicit (`removeCategory`); reject-if-spent by default |
| INV-08 | Editing one month’s input object cannot mutate another month’s object |
| INV-09 | Currency mismatch and non-integer money throw rather than coerce |
| INV-10 | Exactly one payday account; unknown account/category references throw |
| INV-11 | Failed persistence must not be reported as success *(application test — not yet implemented)* |
| INV-12 | Household A cannot access household B *(persistence/RLS — not yet implemented)* |
| INV-13 | Membership is enforced server-side *(RLS — not yet implemented)* |
| INV-14 | Closed snapshots remain stable when live catalogues change *(persistence — not yet implemented)* |

---

## CI gates that block merge

Defined in `.github/workflows/ci.yml`:

| Gate | Phase 0 | After first slice |
| --- | --- | --- |
| `npm run typecheck` | Block | Block |
| `npm run lint` | Block | Block |
| `npm test` (domain) | Block | Block |
| Domain import isolation grep | Block | Block |
| Persistence / RLS tests | n/a | **Block** |
| Migration validation | n/a | **Block** |
| Playwright E2E | n/a | Block once a smoke journey exists |
| Build of the web app | n/a | Block once the app exists |

Advisory (do not block until they exist and are stable): coverage percentages, visual snapshots, lighthouse.

Do not add a coverage threshold that encourages dummy tests.

---

## TDD by layer

- **Domain:** test the invariant or equation first; then change `calculateBudget`.
- **Application:** test the command (including failure and stale revision) first; then the handler.
- **UI:** test that the submitted intent matches the command; do not assert on CSS class names.
- **RLS:** write deny/allow SQL tests before relaxing a policy.

---

## What not to test

- Snapshotting entire React trees.
- Re-testing `Intl` or Vitest itself.
- Duplicate assertion of INV-01 in the UI once the UI only displays `BudgetResult`.
- Implementation details (map iteration order, private helpers).
- Third-party Supabase Auth happy-path internals — test **our** mapping and session-expiry behaviour instead.

---

## Phase 0 vs later

**Phase 0 (done):** Vitest, TypeScript, ESLint, domain money + budget invariant tests, GitHub Actions.

**First slice:** application command tests (real domain, fake I/O ports — **never mock the engine**), persistence round-trip, RLS isolation, 409 stale revision, “save failed” behaviour, Food €500→€650 through persist+second user.

**When UI exists:** one Playwright journey for the slice (two users, refresh, isolation if we can host two sessions).
