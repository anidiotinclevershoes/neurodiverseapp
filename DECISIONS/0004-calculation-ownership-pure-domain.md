# 0004 — Calculation ownership: pure deterministic domain engine

**Status:** accepted  
**Date:** 2026-08-31  
**Kind:** current decision

## Context

Budget math must be identical for both household members and after reload. UI frameworks, SQL dialects, and auth vendors will change more often than “income minus bills minus allocations”.

## Decision

All budget calculation lives in `src/domain` as pure functions:

- `calculateBudget(input) → result`
- `removeCategory(input, id, mode) → input`

The engine does not read clocks, networks, databases, or React state. The application maps persisted rows into `BudgetInput` and persists **inputs**. Derived fields are recomputed (snapshots of derived data are allowed on month close — see 0007).

## Consequences

- Tests for money and invariants do not need a browser or a database.
- SQL must not become a second, drifting implementation of remaining-amount math.
- UI display of remaining amounts must render `BudgetResult`, not re-add the numbers.
