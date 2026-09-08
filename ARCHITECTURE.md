# ARCHITECTURE.md

**Status:** current  
**Last verified:** 2026-09-05  
**Kind:** current system architecture

If this file disagrees with code, **do not trust this file blindly**. Investigate, then change the code or this file, and record the reconciliation.

---

## Goal

A simple system with strong boundaries: a pure budget engine, a small application layer, a replaceable persistence adapter, and a mobile-first UI that never pretends a save succeeded.

We are **not** building a generic ND life operating system.

---

## Layers

```
UI  (Vite + React)
  ↓  Supabase Auth session (access token)
  ↓  HTTP commands
Application / use cases   ← src/application/budget-app.ts
  ↓  BudgetInput  →  BudgetResult
Budget domain engine
  ↓  BudgetStore port
Postgres adapter          ← src/persistence/postgres.ts
  ↓
Hosted Supabase Postgres  (CI: Postgres 16 + test-only auth.uid shim)
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

**Authoritative:** household rows in Postgres. Production: hosted Supabase. CI: local Postgres 16 with the same migrations.

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

See `DECISIONS/0005-auth-supabase.md`, `0010-auth-supabase-password.md`, and `0013-rls-scoped-runtime-persistence.md`.

- Authentication: **Supabase Auth** email + password (ADR 0010). The API calls `getUser` on the access token. Phase 1A custom JWT is deleted.
- How identity reaches Postgres: `getUser` yields `user.id`. The request builds `createPostgresStore(pool, userId)`. That adapter, on a held pool client, sets `request.jwt.claim.sub` and `request.jwt.claims` to that id, then `SET LOCAL ROLE authenticated`. Hosted `auth.uid()` reads those settings. It does **not** read the browser cookie by itself.
- Authorization: Postgres RLS on every household table. Policies check `auth.uid()` membership via `private.member_household_ids()`. That is what blocks another household — not the application `isMember` check alone.
- Role `authenticated` may SELECT, INSERT, and UPDATE household rows that RLS allows. Writes still go through the command adapter (revision `UPDATE … WHERE revision = $expected`). A trigger rejects writes unless `app.command_adapter=1`, so the Data API cannot skip revision checking.
- The login role behind `DATABASE_URL` (often `postgres` on hosted Supabase) **can** bypass RLS if used directly. Production household SQL must not run as that role.
- The browser never receives the service-role key or `DATABASE_URL`.
- Client-supplied `household_id` is a parameter, not a permission.
- **Private V1 decision — revisit before any public or untrusted-user release.** Email confirmation stays disabled for the trusted two-person household. Isolation does not depend on a confirmation click.

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

## Schema (Phase 1B)

Migrations in `supabase/migrations/`:

- `households`
- `household_members` (`user_id` → `auth.users`)
- `budget_months` (`income_minor`, `revision`, year, month)
- `categories`
- `month_allocations`

`app_users` was a Phase 1A temporary table and is dropped in `20260831220000_phase1b_auth_users.sql`.

Local CI creates a compatible `auth.users` via `supabase/shims/auth_uid.sql`. That file must never run on hosted Supabase.

Not created yet: accounts, month_incomes lines, bills, extras, spend, processed_commands, closed_snapshot.

Phase 1A mapper supplies a synthetic payday account so `calculateBudget` can run without an accounts table.

**Write path:** Hono command API → per-request `createPostgresStore(pool, userId)` → transaction as `authenticated` + JWT claims → RLS. Membership is a `household_members` row, never a client “I am a member” flag. `DATABASE_URL` is required at runtime for this direct-Postgres adapter. It is also used for migrations and local CI. The browser does not use it.

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
4. **Persistence → Auth/RLS:** the production adapter runs as `authenticated` with the signed-in `sub`. RLS is what isolates households. Service role is never in the client.
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

Trust boundaries: browser UI | Supabase Auth | Hono command API | Postgres+RLS.

| Threat | V1 control |
| --- | --- |
| Cross-household read/write | RLS membership; tests as INV-12/13 |
| Client sends another household’s id | Policy ignores the wish; returns zero rows |
| Stolen publishable key | Expected public; useless without a user session and membership |
| Stolen service role | Operational disaster — key never ships to clients; rotate if leaked |
| Account takeover (email) | Supabase Auth password; no SMS recovery in V1 |
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

## Phase 1B code map

```
src/domain/              money + calculateBudget (unchanged)
src/application/         createBudgetApp commands + MonthView mapping
src/persistence/         user-scoped Postgres store (RLS runtime), migrations helper
src/server/              Hono command API + Supabase getUser
src/web/                 spine UI + supabase-js Auth
api/                     Vercel Node entry for the same Hono app
supabase/migrations/     schema + RLS
supabase/shims/          local/CI auth.uid() + auth.users only
```
