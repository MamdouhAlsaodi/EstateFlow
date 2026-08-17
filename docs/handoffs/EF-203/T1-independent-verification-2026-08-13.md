# EF-203 T1 — Independent Verification (2026-08-13)

## Verdict

**PASS — domain/application contract accepted.** This acceptance is limited to EF-203 T1; persistence, migration, HTTP, OpenAPI, generated client, and Web remain unimplemented.

## Scope reviewed

- Terminal Lead stages: `CLOSED_WON`, `CLOSED_LOST`.
- Explicit `closeWon` and `closeLost` domain commands.
- One `Deal` intent only for won outcomes; no Deal/Event for lost outcomes.
- Versioned `DealClosedWon` event intent, `schemaVersion: 1`.
- Mandatory typed repository close/preflight ports; no runtime capability probing.
- Terminal guard for active Lead mutations.
- Command-specific idempotency replay types and preflight ordering.

## Fresh independent evidence

| Requirement | Evidence |
|---|---|
| Terminal state and bounded close semantics | EF-203 domain tests PASS |
| Existing Lead/CRM-04 domain and application behavior | EF-202 regressions PASS |
| Same-key replay after actual version advance | EF-203 application test PASS; replay returns original Deal/Event with no second Lead read/mutation |
| Same key + changed property or expected version | EF-203 application test PASS; typed idempotency conflict before Lead read/mutation |
| Type and dispatch safety | Fresh source scan: no `as any`, unsafe double cast, dynamic capability guard, or repository-index dispatch in Lead domain/application |
| Fresh regression count | `30 passed, 0 failed` |
| Diff hygiene | `git diff --check` PASS |

## Build status and precise boundary

The API TypeScript build is **not PASS at T1**. The fresh diagnostic classifies its errors solely to T2 work: Prisma schema/generated enum alignment and `PrismaLeadRepository` implementation of new mandatory `preflightClose`, `closeWon`, and `closeLost` ports. No workaround or ignored build claim was used.

## T2 non-negotiables

- Apply only to isolated, guarded `estateflow_test`.
- Atomically canonicalize/hash close input and recheck idempotency within the close transaction to close races.
- Enforce same-organization active Property and active BROKER membership.
- Enforce one Deal per Lead, append the exact close timeline, and persist the won event in one transaction.
- Reject active child commands on terminal Leads inside persistence.
