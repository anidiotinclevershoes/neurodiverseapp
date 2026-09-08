# PRODUCT.md

**Status:** current  
**Last verified:** 2026-09-05  
**Kind:** current product truth (not a wishlist)

NDApp is a mobile-first application that helps neurodivergent adults and parents reduce everyday executive-function burden.

It is **not** a banking app, a payments app, or a budgeting course.

---

## Hard rule — no financial transactions

NDApp must **never**:

- initiate bank transfers;
- execute payments;
- automate real money movement;
- directly control bank accounts;
- move funds on behalf of users.

NDApp **may**:

- calculate;
- recommend;
- instruct;
- remind;
- track;
- record;
- show steps;
- let users mark manual actions as completed.

Actual movement of money always happens outside NDApp. This is a product constraint and an architectural constraint (see `DECISIONS/0008-no-financial-transactions.md`).

---

## Current V1 — The Budget Button

V1 is deliberately narrow. The first product is **The Budget Button**.

Its job is not to teach budgeting. It should carry some of the executive-function burden of managing household money.

The product should help answer:

1. What needs to happen on payday?
2. What money needs to go where?
3. What must remain available for bills?
4. What can safely be spent?
5. How is the household doing during the month?
6. What happens if an unexpected expense or overspend occurs?
7. How did previous months actually go?

### Who V1 is for

The first real household is two adults sharing one budget, on:

- iPhone 13
- Nothing Phone (3a) / Android

The model is **not** hard-coded to two named people. A household has members; V1 just happens to start with two equal adults.

Both members should see the same household budget state. True realtime is not required. A manual refresh is acceptable.

### What a household can configure in V1

- one currency per household (ISO 4217, two decimal places);
- income for the month;
- payday (when income lands — informational for V1, used to frame the payday checklist);
- accounts, including which account is the payday account;
- recurring monthly bills, including which account each bill is paid from;
- user-defined spending categories (no built-in “Food/Medical/Savings” taxonomy);
- planned allocations into those categories;
- a **protect** flag on a category (leftover in a protected envelope is not treated as the headline “safe to spend”; overspend of it still reduces the headline);
- optional **extra** planned manual transfers that are *not* bill-funding (for example payday account → savings). Bill-funding transfers are derived and must not be entered again as extras;
- recorded spend, including unexpected spend.

Payday bill-funding transfers in V1 are **derived** (payday account → other accounts to cover those accounts’ bills). Users are not asked to design a transfer graph. They can mark a recommended transfer as done in a later slice; that is a record of a manual action, not an instruction to a bank.

### Four V1 experiences

**Payday — “What needs to go where?”**  
The system calculates required manual movements and allocations from this month’s inputs.

**During the month — “How much can we safely spend?”**  
The household sees remaining envelopes and a headline safe-to-spend figure without reconstructing the budget mentally.

**Recovery — “We just spent money we didn’t expect. How do we save the rest of the month?”**  
The system recalculates. It does not shame, lock, or punish. Negative remaining is visible, not clamped to zero.

**History — “How did this month actually go?”**  
V1 does not ship a rich history UI in the first vertical slice. The data model must still keep completed months trustworthy so history can be built later.

### Neurodivergent product principle

Reduce what the user has to hold in their head.

The UX must be calm, low-friction, non-judgmental, forgiving, recovery-friendly, and easy to resume after absence.

Do not introduce shame mechanics, streaks-as-morality, or “you failed this month” framing.

---

## Explicitly deferred (not V1)

These are real ideas. They are **not** current product scope. Do not implement them while building V1 unless a later decision changes this list.

- bank connections, Open Banking, statement import, transaction execution;
- App Store / Play Store shipping;
- native widgets;
- push notification reminders (payday / bills);
- AI insights or behavioural scoring;
- gamification, animations-as-product, productivity OS features;
- Household (chores, shared lists) and Heading Out modules;
- multiple currencies in one household;
- foreign-exchange conversion;
- role-based permissions beyond “household member”;
- invite links with fine-grained admin/guest roles;
- month-closing ceremony UI (the snapshot mechanism is architectural; the ritual is deferred);
- offline-first editing;
- realtime collaborative cursors / live occupancy;
- annual/quarterly bill scheduling UI (the month instance can still hold a one-off bill);
- savings goals with target dates;
- CSV export UI.

---

## Possible future ideas (not commitments)

See `ARCHITECTURE.md` § V1.1 evaluation. Treat that table as **future ideas**, not current truth.

Likely near-term: multiple income lines, irregular income, annual bills as month instances, shared vs personal spend, notifications, month close, export.

Unlikely near-term: AI analysis, bank-driven automation, multi-currency ledgers.

---

## What Phase 1A delivered versus what V1 still needs

Phase 1A proved the spine: two people can sign in, share one household month, persist income and one allocation, see remaining amounts from the domain engine, refresh the same figures, and stay isolated from another household.

It did **not** ship The Budget Button payday checklist, bills, spend capture, or recovery UX.

Implemented now (narrow):

- email + password sign-in;
- create household;
- add a second member by existing account email;
- edit income and one named allocation;
- see unallocated / remaining / headline from the engine;
- save, refresh, conflict and save-failed states.

Still planned for later V1 slices: bills, accounts, payday transfers, spend, extras.

Phase 1B replaces Phase 1A custom JWT with Supabase Auth and targets a public HTTPS deploy. OTP mail is deferred (ADR 0010).

**Private V1 decision — revisit before any public or untrusted-user release.** Email confirmation stays disabled so the trusted two-person household can create an account and sign in immediately. Household isolation is still enforced in Postgres RLS. Do not add a confirmation UX for this V1.
