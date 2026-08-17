# EF-233 T5B — Independent Verification

**Date:** 2026-08-17
**Verdict:** PASS
**Boundary:** Cancellation audit schema, immutable state transitions, guarded persistence, aging row pagination, and payment/cancellation concurrency.

## Accepted implementation

- Invoice cancellation audit persists actor, UTC instant, and canonical required reason.
- Database permits only one `ISSUED → CANCELLED` transition; forged `DRAFT → CANCELLED` and all post-cancellation edits reject.
- Issued financial snapshots remain immutable.
- Receivable cancellation permits only untouched OPEN balances with no payment; cancelled receivables cannot reopen or mutate.
- Cancellation re-reads and locks authoritative invoice/receivable rows, rechecks payments, and atomically updates both records.
- Exact cancellation retry replays; changed audit conflicts.
- Aging reads are organization-scoped in SQL, include only OPEN/PARTIALLY_PAID, order by `dueAt,id`, and use stable cursor predicates.
- Cancellation/payment concurrency never persists both CANCELLED and a payment.

## Pi/Luna execution provenance

```text
provider: openai-codex
model: gpt-5.6-luna
native tool lifecycle: observed
T5B worker: PARTIAL pending DB
R1 trigger/test repair: PARTIAL pending DB
R2 clean-code extraction: PASS for non-DB boundary
```

Independent review rejected the first migration before execution because an early trigger return allowed forged `DRAFT → CANCELLED`. R1 repaired this and added SQL assertions. R2 reduced the repository facade from 701 to below 500 lines by extracting mappers, cancellation transaction logic, and aging query logic.

## Real PostgreSQL verification

Target safety:

```text
database: estateflow_test
host: loopback
port: 55433
storage: tmpfs
assert-test-database: PASS
```

Fresh migration result:

```text
12 migrations applied from zero
20260817000000_ef233_cancellation_aging: APPLIED
```

The first DB run found a test expectation bug: same-due rows were expected in insertion order rather than UUID ascending order. The expectation was corrected to the contract.

A later post-extraction DB smoke exposed a real flaky race defect: Prisma wrapped PostgreSQL `40001` inside raw-query metadata, while the retry detector recognized only `P2034`. The detector now recognizes direct and wrapped `40001`. The race test was strengthened from one attempt to eight attempts per run.

Final fresh gate:

```text
focused persistence: 2/2 passed × 3 runs
cancel/payment concurrent races: 8 × 3 = 24 passed
existing EF-233 repository integration: 2/2 passed
build: PASS
lint: PASS
diff-check: PASS
EF233_T5B_24_RACE_FINAL_GATE=PASS
TEST_STACK_STOPPED=YES
```

## Clean-code boundary

```text
prisma-receivable.repository.ts: 474 lines
prisma-receivable-mappers.ts: 130 lines
prisma-receivable-cancellation.ts: 109 lines
prisma-receivable-aging.ts: 42 lines
```

## Remaining boundary

T5B does not accept aging application pagination/cursor encoding, cancellation or aging HTTP endpoints, OpenAPI/generated client, runtime HTTP integration, or Web read/cancel UX. Those remain T5C/T5D.
