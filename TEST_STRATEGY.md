# TEST_STRATEGY.md

**Status:** current  
**Last verified:** 2026-09-08  
**Kind:** current test strategy

---

## Shape

We do not chase a decorative pyramid. We test the places this product will actually break.

| Layer | What it protects | Tool (V1) | When |
| --- | --- | --- | --- |
| Domain unit | Money + `calculateBudget` + invariants | Vitest | Now |
| Application | Command handling, revision, mapping | Vitest (memory store) | Now |
| Persistence | Writes, reload equality | Vitest + Postgres | Now |
| Security | Household isolation, unauthenticated deny | Postgres RLS + HTTP | Now |
| UI integration | Intent submitted matches command | Manual / browser | Thin spine UI |
| E2E journey | Two-user refresh / isolation in a browser | Playwright | Later |
| Native E2E | — | Not in V1 (web-first) | Only if we later wrap |

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

The same journey is tested from the application boundary (memory store), from Postgres + RLS, and from the HTTP command API. The UI is thin: it submits `/month/save` and displays `MonthView`. Browser two-session Playwright remains later.

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
| INV-11 | Failed persistence must not be reported as success *(application: UNAVAILABLE; UI stays save-failed)* |
| INV-12 | Household A cannot access household B *(the production `createPostgresStore(pool, userId)` path, not only a standalone SET ROLE probe)* |
| INV-13 | Membership is enforced server-side *(household_members + RLS; client “I am a member” is ignored)* |
| INV-14 | Closed snapshots remain stable when live catalogues change *(persistence — not yet implemented)* |

---

## CI gates that block merge

Defined in `.github/workflows/ci.yml`:

| Gate | Phase 1B |
| --- | --- |
| `npm run typecheck` | Block |
| `npm run lint` | Block |
| Domain import isolation grep | Block |
| `npm test` (domain + application + Postgres + HTTP; serial files) | Block |
| `npm run build` | Block (SPA + bundled Vercel function; Node probe of `/health` and `/households`) |
| Browser bundle secret grep | Block |
| Vercel function `.ts` import check | Block (`npm run check:vercel-function`, also part of `npm run build`) |
| Hosted Supabase suite | Optional when `vars.NDAPP_HOSTED_TESTS=1` |

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

## Phase 1B vs later

**Local CI:** application commands, Postgres round-trip through the user-scoped production adapter, RLS as role `authenticated`, HTTP journey with an injected verifier (custom `/auth/*` gone), password sign-in path without a confirmation flow, Vite build, bundled Vercel function loaded with Node (no `.ts` imports), bundle secret grep.

**Hosted:** `src/persistence/hosted.test.ts` when `NDAPP_HOSTED_TESTS=1` — real `getUser`, PostgREST RLS, disposable users.

**Later:** Playwright two-session on real phones.
