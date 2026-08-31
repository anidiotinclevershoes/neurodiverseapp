# 0006 — Money: integer minor units, one currency per household

**Status:** accepted  
**Date:** 2026-08-31  
**Kind:** current decision

## Context

IEEE floating point is not a ledger. The first household’s examples are in euros. Multi-currency conversion is not a V1 problem.

## Decision

- Calculate and store money as **integer minor units** (cents).
- TypeScript: `number` that must be a **safe integer** (`assertMinorUnits`). Postgres: `bigint`.
- Parse user input from **strings** (`parseMajorToMinor`). Never take a JavaScript `number` major amount (e.g. `500.50`) as source truth.
- One **ISO 4217** currency per household. No FX.
- V1 currencies have **two decimal places**. Zero-decimal currencies are out of scope until we add an exponent table on purpose.
- Rounding: V1 does not divide money. If division is added later, round to minor units in a documented way and keep a remainder so INV-01 still holds.
- Negative totals are allowed where they mean overspend or an uncovered plan. Bills, allocations, and spend **inputs** cannot be negative.

## Consequences

- Display formatting is a function of minor units + currency code (`Intl` in the UI later; domain currently exposes a fixed `formatMinorAsMajor` for tests).
- The engine takes minor units after the application has parsed input.
