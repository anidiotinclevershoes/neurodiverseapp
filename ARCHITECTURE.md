# ARCHITECTURE.md

**Status:** current  
**Last verified:** 2026-08-31  
**Kind:** current system architecture

If this file disagrees with code, **do not trust this file blindly**. Investigate, then change the code or this file, and record the reconciliation.

---

## Goal

A simple system with strong boundaries: a pure budget engine, a small application layer, a replaceable persistence adapter, and a mobile-first UI that never pretends a save succeeded.

We are **not** building a generic ND life operating system.

---

## Layers

```
UI  (Vite + React — Phase 1A spine only)
  ↓  HTTP commands (JWT)
Application / use cases   ← src/application/budget-app.ts
  ↓  BudgetInput  →  BudgetResult
Budget domain engine
  ↓  BudgetStore port
Postgres adapter          ← src/persistence/postgres.ts
  ↓
PostgreSQL 16 (Supabase-shaped RLS; hosted Supabase not provisioned)
```

### Dependency rules

| Layer | May depend on | Must not depend on |
| --- | --- | --- |
| Domain (`src/domain`) | Standard library only | React, DOM, fetch, Supabase, env, clocks |
| Application | Domain, persistence **port** types | UI components, CSS, navigation |
| Persistence adapter | Application port, `pg`, domain types for mapping | React |
| UI | Application API, domain **result types** for display | SQL, RLS, service role keys |

The same `BudgetInput` must always produce the same `BudgetResult`. That is why the engine is a pure function (`calculateBudget`).

Deviation considered and rejected: putting remaining-amount math in SQL or in React. SQL would couple invariants to one database. React would make tests UI-flavoured and non-deterministic across clients.

---

## Data ownership

**Authoritative:** server-side household records (Phase 1A: PostgreSQL 16; hosted Supabase still the intended production home).

**Derived:** anything `calculateBudget` returns. Derived values may be stored as a cache or as a closed-month snapshot, but live months are always recomputable from inputs.

**Client cache:** a last-known copy for display. It is never the source of truth. V1 does not use optimistic financial writes.

**Clock:** month boundaries and “now” are application concerns. The engine does not call `Date.now()`.

---

## Sync model (V1)

See `DECISIONS/0003-household-sync-manual-refresh.md`.

- Server is authoritative.
- Both household members read the same rows.
- **Manual refresh** is the V1 consistency mechanism (pull-to-refresh and refresh after save).
- **No realtime subscriptions in V1.**
- Money writes use **optimistic concurrency** (`expectedRevision`). Mismatch → 409 + current view. Not silent last-write-wins.
- Stale save: refuse; never clobber quietly.
- Failed save: UI stays in an error/unsaved state. Success chrome is forbidden until the server confirms.
- Offline: V1 is online-required for writes. Reads may show last-known data **labelled as possibly stale**.
- Duplicate submit: UI disables Save while a save is in flight. A `processed_commands` table is still deferred (TD-12).

---

## Household sharing

- `households` is the tenancy root.
- Every financial row has `household_id`.
- Membership is a server-side `household_members` row, **not** a client flag and **not** user-editable JWT `user_metadata`.
- V1 members are equal. No admin/guest split until a later decision.
- A user may later belong to multiple households; V1 UI can still assume one active household. The schema should not unique-constrain a user to a single household.

---

## Authorization

See `DECISIONS/0005-auth-supabase.md`.

- Authentication: email + password JWT against `app_users` (Phase 1A). OTP remains the intended hosted path (ADR 0005, 0009).
- Authorization: Postgres RLS on every exposed table. Policies check `auth.uid()` membership in `household_members`.
- The browser never receives the service-role key.
- Client-supplied `household_id` is a parameter, not a permission.

---

## Money

See `DECISIONS/0006-money-integer-minor-units.md`.

- Storage and calculation: integer minor units (`bigint` in Postgres, safe integer in TypeScript).
- Display: format from minor units; parse user input from decimal **strings**, never from IEEE floats.
- One ISO 4217 currency per household.
- V1 supports two-decimal currencies only.

---

## History integrity

See `DECISIONS/0007-history-month-snapshots.md`.

- Each month has its **own input rows** (or equivalent month-scoped records). Editing February does not update January.
- Closing a month writes an **immutable snapshot** of inputs + `BudgetResult` + copied category names.
- Category rename/delete affects the live catalogue and open month only, with explicit delete behaviour in the domain (`removeCategory`).
- Do not implement event sourcing.

---

## Schema (Phase 1A actually created)

Tables in `supabase/migrations/20260831200000_phase1a_spine.sql`:

- `app_users`
- `households`
- `household_members`
- `budget_months` (`income_minor`, `revision`, year, month)
- `categories`
- `month_allocations`

Not created yet (still the V1 direction): accounts, month_incomes lines, bills, extras, spend, processed_commands, closed_snapshot.

Phase 1A mapper supplies a synthetic payday account so `calculateBudget` can run without an accounts table.

**Write path:** Hono command API. Role `ndapp_authenticated` has SELECT only. Membership is loaded from `household_members`, never from a client “I am a member” flag.

## Application commands (Phase 1A)

- `household.create` / `addMember` (email of an existing user)
- `month.get` / `setIncome` / `setAllocation` / `saveMonth`

`recordSpend` is not implemented (explicit Phase 1A non-goal). Future V1 tables (accounts, bills, extras, spend, income lines, processed_commands) stay deferred.

`openingRollover` is still a named engine input that is **always 0 in V1**.

---

## Cross-layer contracts

1. **UI → Application:** command objects with `householdId`, `monthId`, `expectedRevision`, money as integer minor units (or a parsed string that the application converts **before** the engine).
2. **Application → Domain:** `BudgetInput` in, `BudgetResult` out. No partial/optional silent defaults that hide missing accounts.
3. **Application → Persistence:** write inputs, then read back; compare revision.
4. **Persistence → Auth/RLS:** reads as the user. Writes through the command path. Service role is never in the client.
5. **Reload contract:** GET after PUT returns the same authoritative inputs and the same derived result.
6. **Second-member contract:** after refresh, member B’s `BudgetResult` equals member A’s.
7. **Isolation contract:** household B’s queries return zero rows of household A’s data, including via guessed IDs. Missing-or-forbidden is **404**, not a leaky 403 that confirms the other household exists.

---

## Extension points justified now

- **Household as tenancy root** — other NDApp modules can share identity later without rewriting money tables.
- **Income as line items** — avoids a later painful column-to-table migration.
- **Extra transfers ≠ bill-funding** — named so payday math cannot double-count.
- **Category `protect` flag** — avoids hard-coding “Savings” for the headline overlay.
- **Pure engine** — UI shell can change (web → Capacitor/Expo) without rewriting calculations.

## Extension points deliberately not built

- Plugin architecture, workspace modules, event sourcing, CRDTs, sync protocol, notification gateway, bank adapter interface, AI pipeline, role/permission engine, multi-currency ledgers.

---

## V1.1 evaluation

| Idea | Likelihood | Architecturally important now? | What we did |
| --- | --- | --- | --- |
| Multiple incomes / paydays | Likely | Yes (shape) | Income line items, not a single column |
| Irregular income | Likely | No extra type | Same income lines; some months differ |
| Shared vs personal spend | Plausible | Small | Spend already has no forced “shared” flag; add later |
| Annual / quarterly bills | Likely | No | Instantiate into a month; no recurrence engine |
| Rollover categories | Plausible | No | Would be a month-open copy rule later |
| Recurring allocation templates | Plausible | No | Copy-forward command later |
| Savings goals | Plausible | No | `protect` is enough for V1 |
| Multiple households per user | Plausible | Yes (shape) | Membership table allows it; V1 UI may hide it |
| Roles / permissions | Plausible later | No | Equal members |
| Notifications / reminders | Likely later | No | Platform ADR says web-first; native if iOS push becomes required |
| Month closing | Likely | Yes (shape) | Snapshot field on `budget_months` |
| Future months | Likely | No | A month row can exist before “now” |
| Widgets | Unlikely soon | No | Would force native; not now |
| CSV / export | Plausible | No | Snapshot JSON is export-friendly later |
| Bank-statement import (no execution) | Unlikely V1.1 | No | Do not add a transactions-from-bank table yet |
| Smart / AI insights | Unlikely soon | No | History snapshots enable it later; no AI now |
| Other NDApp modules | Plausible | Yes (shape) | Shared `households` / auth only |

---

## First vertical slice

Implemented in Phase 1A. See `CHECKPOINT.md`. Two authenticated members share one August 2026 month; income + one allocation persist; `calculateBudget` is the only source of remaining / unallocated / headline; another household is isolated; stale revision is 409.

---

## Threat model (proportionate)

Assets: household financial *plans* (income, bills, allocations, spend, notes), account emails, session tokens.

Trust boundaries: browser UI | Hono command API | Postgres+RLS | `app_users` password JWT (hosted Supabase Auth later).

| Threat | V1 control |
| --- | --- |
| Cross-household read/write | RLS membership; tests as INV-12/13 |
| Client sends another household’s id | Policy ignores the wish; returns zero rows |
| Stolen publishable key | Expected public; useless without a user session and membership |
| Stolen service role | Operational disaster — key never ships to clients; rotate if leaked |
| Account takeover (email) | Password JWT today; OTP mail when hosted Supabase Auth is connected; no SMS recovery in V1 |
| Invite abuse | No public join codes; add member from an existing member session; unknown emails are a silent no-op |
| Log leakage | Do not log amounts, tokens, or passwords at info level |
| XSS stealing session | Standard web hygiene when UI exists (framework defaults, no `dangerouslySetInnerHTML` for notes without a later decision) |
| Tampered minor units / floats | Parse and `assertMinorUnits` before persist |
| User claims “I am admin” in JWT user_metadata | Ignored; membership table only |
| Session after membership removal | RLS fails the next query |
| GDPR export/delete | Possible later via household-scoped tables; do not scatter financial blobs into unrelated stores |

Out of V1: mandatory MFA, formal pentest program, HSM, field-level encryption at rest beyond platform defaults.

## Failure states

| Situation | Behaviour |
| --- | --- |
| Network unavailable | Writes do not claim success; reads may show last-known **as stale** |
| Save fails | Error; local draft may remain editable; authoritative state unchanged |
| Stale revision | **409** + current view; ask to refresh and retry; never silent overwrite |
| Second member updated | Visible after refresh; no merge editor in V1 |
| Duplicate submit | In-flight lock or idempotency key |
| Session expired | Auth error; no financial calls as anon |
| Membership lost | Queries empty / forbidden, not a cascade of fake zeros presented as “you have no bills” without context |
| Invalid money string | Validation error, no write |
| Migration mismatch | App must not boot against an unknown schema silently — fail startup/health when we have a server |

## Phase 1A code map

```
src/domain/              money + calculateBudget (unchanged Phase 0 rules)
src/application/         createBudgetApp commands + MonthView mapping
src/persistence/         Postgres store, migrations helper
src/server/              Hono command API + password JWT
src/web/                 minimal mobile-first spine UI
supabase/migrations/     Phase 1A schema + RLS
supabase/shims/          auth.uid() for vanilla Postgres
```
