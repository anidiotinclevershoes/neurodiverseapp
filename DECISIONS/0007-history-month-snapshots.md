# 0007 — History: per-month inputs plus immutable close snapshots

**Status:** accepted  
**Date:** 2026-08-31  
**Kind:** current decision

## Context

History is a V1 product question (“how did previous months actually go?”) but not the first UI. The data model must not make trustworthy history impossible. Event sourcing would answer this and also overbuild.

## Decision

- Each calendar month the household uses is a `budget_months` row with **its own** income, bills, allocations, and spend.
- Changing “defaults” or opening a new month copies values; it does not leave live foreign keys into a mutable template.
- **Close** writes `closed_snapshot` JSON (inputs + `BudgetResult` + category **names** as they were). That snapshot is immutable in V1.
- Category rename/delete updates the live catalogue and at most the **open** month, via explicit domain behaviour.
- Reopening a closed month is not a V1 feature. If it is added later, it must be an explicit command that records that history was edited — not a silent overwrite of the snapshot.

Rejected: event sourcing, slowly-changing-dimension category tables in V1, computing history by replaying today’s catalogue onto old spend.

## Consequences

- History UI can render snapshots without the engine needing a time machine.
- Delete-category tests must use one month’s `BudgetInput`, not a global singleton budget.
