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
| TD-02 | No application layer yet | Expected | First vertical slice |
| TD-03 | ESLint is not type-aware (`parserOptions.project`) | Low | Avoided extra config surface; `tsc` is the type gate |
| TD-04 | Money V1 is two-decimal only | Low | JPY-style currencies rejected until an exponent table is justified |
| TD-05 | `headlineSafeToSpendMinor` is a defined heuristic, not a law of accounting | Info | If users find it confusing, change with tests; do not silently add a second competing headline in the UI |
| TD-06 | Vitest 4 was installed (npm latest) | Info | Works; no need to pin to v3 unless CI forces it |

---

## Architectural concerns

| ID | Item | Severity | Notes |
| --- | --- | --- | --- |
| AC-01 | Supabase is chosen but **not provisioned** | Medium | Isolation invariants are specified, not proven against a live policy set |
| AC-02 | Last-write-wins may surprise two people editing allocations at once | Low | V1 household is two adults; stale revision should make this visible. Revisit if we see lost updates |
| AC-03 | Web-first means iOS home-screen install is a Safari ritual if we ever want a PWA | Low | Acceptable until notifications/widgets force native |
| AC-04 | Domain `incomeMinor` is a single total while the intended schema uses income **lines** | Low | Application layer will sum lines into the engine input; do not fork the engine until multiple streams need different payday math |

---

## QOL

| ID | Item | Notes |
| --- | --- | --- |
| QOL-01 | No formatter (Prettier) | Intentional. Avoid a second style tool; ESLint + TypeScript suffice for Phase 0 |
| QOL-02 | README was a stub | Replaced to point at the doc set |

---

## Deferred risks

- iOS Safari viewport/keyboard issues will only show up when UI exists — test on the iPhone 13 then.
- Magic-link email deliverability can block the first household — have a backup sign-in path in mind (password) if magic links fail in real life.
- EU iOS PWA/push caveats are irrelevant until we ship a PWA or push; recorded so we do not “just add notifications” on the web shell.
