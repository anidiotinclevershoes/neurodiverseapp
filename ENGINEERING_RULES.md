# ENGINEERING_RULES.md

**Status:** current  
**Last verified:** 2026-09-05  
**Kind:** current engineering process (not historical)

Agents and humans follow these rules when changing NDApp.

---

## 1. Read before you write

Before a significant change, review:

1. `CHECKPOINT.md` — known-good state and next intended step;
2. `PRODUCT.md` — is this even in scope?;
3. `ARCHITECTURE.md` — does this cross a boundary?;
4. relevant ADRs in `DECISIONS/`;
5. the current code and tests — **code wins over stale docs**.

If documentation and implementation conflict:

1. Do not blindly trust the docs.
2. Investigate.
3. Reconcile explicitly (change code, or change docs, or both).
4. Mark superseded ADRs as **superseded** with a pointer to the replacement. Do not leave two current truths.

---

## 2. Self-vetting questions

Ask these internally. If a conflict exists, surface it rather than silently proceeding.

- Does this violate `PRODUCT.md`?
- Does this cross an architectural boundary?
- Am I creating a file/component unnecessarily?
- Is there existing code I should reuse?
- Does this change an invariant?
- Which tests should fail before implementation?
- Which regression tests must remain green?
- Does this affect household isolation?
- Does this affect historical data?
- Does this affect synchronization?
- Does documentation need updating?
- Have I expanded scope unintentionally?
- Would this show a successful UI state if persistence failed?
- Does this initiate a real-world payment or bank transfer? (If yes: stop.)

---

## 3. TDD for implementation work

1. Define intended behaviour in plain language.
2. Write failing tests that would catch the failure mode.
3. Confirm the failure is meaningful (not a missing import).
4. Implement the smallest safe change.
5. Make tests pass.
6. Run relevant regression (`npm test`, plus broader suites when they exist).
7. Update documentation (`CHECKPOINT.md` at minimum).
8. Provide a plain-English report.

Do not add tests merely to increase count.

---

## 4. Reuse first

Before creating a new file, component, helper, abstraction, service, hook, utility, schema, or type: inspect whether an existing implementation can be safely reused or extended.

Reuse by default. Duplicate deliberately. Abstract only when justified.

Do **not** force reuse when it introduces excessive conditionals, coupling, unclear responsibilities, fragile abstractions, or harder testing.

If a new file is justified, say why (PR description is enough).

---

## 5. Low-risk changes

Prefer small, reversible, understandable, independently testable, additive changes.

Avoid giant refactors, opportunistic rewrites, unrelated cleanup bundled with features, and broad dependency changes without justification.

If technical debt is discovered:

- fix it immediately only if necessary and safely scoped;
- otherwise log it in `KNOWN_ISSUES.md`.

Do not hide debt. Do not let debt derail the current objective.

---

## 6. Security expectations

- Never trust client-side authorization.
- Never put the Supabase service-role key in a client bundle.
- Never authorize from user-editable JWT `user_metadata`.
- Every exposed table has RLS enabled and least-privilege grants.
- Money values are validated as integer minor units on the way in.
- Logs must not print full financial payloads, access tokens, or magic-link URLs.
- Household A must never see household B. If a change could affect that, add or update an isolation test.

---

## 7. Documentation requirements

Documentation is part of the change, not a follow-up.

- Current V1 behaviour → `PRODUCT.md`
- Layers, contracts, sync, schema direction → `ARCHITECTURE.md`
- Meaningful choice with alternatives → new or updated ADR
- Debt / bugs / QOL → `KNOWN_ISSUES.md`
- Known-good state after the change → `CHECKPOINT.md`

Distinguish:

| Kind | Where |
| --- | --- |
| Current truth | `PRODUCT.md`, `ARCHITECTURE.md`, `CHECKPOINT.md`, ADRs with status **accepted** |
| Historical decision | ADRs (keep them; mark superseded) |
| Deprecated approach | ADR status **superseded** + one-line pointer |
| Future idea | `PRODUCT.md` deferred/future sections, architecture V1.1 table — never written as if shipped |

---

## 8. Regression expectations

- Domain tests in `src/domain/*.test.ts` must stay green.
- Once the vertical slice exists, its cross-layer journey tests block merge.
- Once RLS exists, household isolation tests block merge.
- CI (`typecheck`, `lint`, `test`) blocks merge. Do not disable a gate to land a feature.

---

## 9. Agent operating rules

- Prefer investigation and documentation over speculative code.
- Do not spawn overlapping agents that edit the same production files.
- The integrating agent owns architecture, security, tests, and the final report.
- Pokémon role names (Mewtwo, Alakazam, …) are optional colour for multi-agent phases; they do not replace these rules.
- Phase scope is defined by `CHECKPOINT.md`. Do not “just add” Household or Heading Out.

---

## 10. Failure behaviour

Fail clearly. Never show a successful saved state if authoritative persistence failed.

Invalid money, expired session, lost membership, stale revision, and network errors are user-visible conditions, not console-only events.
