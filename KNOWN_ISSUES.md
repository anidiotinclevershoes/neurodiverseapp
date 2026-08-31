# KNOWN_ISSUES.md

**Status:** current  
**Last verified:** 2026-08-31  
**Kind:** current debt, bugs, and concerns (not a changelog)

Unrelated cleanup should not be bundled into feature work. Log it here instead.

---

## Bugs

None known in the Phase 0 domain engine.

---

## Technical debt

| ID | Item | Severity | Notes |
| --- | --- | --- | --- |
| TD-01 | No persistence adapter yet | Expected | First vertical slice |
| TD-02 | No application / command API yet | Expected | First vertical slice |
| TD-03 | ESLint is not type-aware (`parserOptions.project`) | Low | Avoided extra config surface; `tsc` is the type gate |
| TD-04 | Money V1 is two-decimal only | Low | JPY-style currencies rejected until an exponent table is justified |
| TD-05 | `headlineSafeToSpendMinor` is a protect-flag overlay, not Alakazam’s `planSafe` | Info | Intended V1 button number is `income − bills − extras − spend`. Engine headline additionally hides protected leftover. Do not show two competing headlines in the UI. Unify when extras exist. |
| TD-06 | Vitest 4 was installed (npm latest) | Info | Works; no need to pin to v3 unless CI forces it |
| TD-07 | Engine `incomeMinor` is a single total | Low | Application will sum `month_incomes` lines. Per-payday split waits until two incomes are real |

---

## Architectural concerns

| ID | Item | Severity | Notes |
| --- | --- | --- | --- |
| AC-01 | Supabase is chosen but **not provisioned** | Medium | Isolation invariants are specified, not proven against a live policy set |
| AC-02 | Concurrent edits | Low | 409 + refresh is the V1 rule. Revisit only if two adults actually collide often |
| AC-03 | Web-first means iOS home-screen install is a Safari ritual | Low | Optional, assisted, once. Not required to use the app |
| AC-04 | Docs live at repo root, not `docs/` | Info | Matches the Phase 0 prompt’s filenames. Slowking’s `docs/` layout was rejected to avoid a second tree |

---

## QOL

| ID | Item | Notes |
| --- | --- | --- |
| QOL-01 | No formatter (Prettier) | Intentional. Avoid a second style tool |
| QOL-02 | README was a stub | Replaced to point at the doc set |

---

## Deferred risks

- iOS Safari viewport/keyboard issues will only show up when UI exists — test on the iPhone 13 then.
- Email OTP deliverability can block the first household — password fallback is the escape hatch.
- EU iOS PWA/push caveats are irrelevant until we ship push; recorded so we do not “just add notifications” on the web shell.

---

## Explicitly rejected (do not reintroduce)

- `packages/` monorepo and hexagonal empty folders
- Event sourcing / Kafka / `{ state, events }` persistence
- Rejecting over-allocation (negative leftover is allowed and visible)
- Silent last-write-wins on money
- Client writes to budget tables
- Service-worker offline cache in V1
- Expo or Capacitor in Phase 0 / first slice
- fast-check / coverage gates as a substitute for the golden journey
