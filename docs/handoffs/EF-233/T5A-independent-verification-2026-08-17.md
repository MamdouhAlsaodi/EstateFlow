# EF-233 T5A — Independent Verification

**Date:** 2026-08-17
**Verdict:** PASS
**Boundary:** Invoice-cancellation and receivable-aging domain/application behavior only.

## Accepted behavior

- Only an issued invoice with one matching untouched OPEN receivable and no payment may cancel.
- Cancellation preserves financial snapshots and outstanding amount while deriving `CANCELLED` invoice/receivable states.
- Cancellation records canonical reason, actor, and UTC time; cancellation cannot precede issue time.
- Exact cancelled snapshot retries replay; changed actor/time/reason conflicts.
- Invalid replay audit input raises typed validation instead of runtime errors or false conflicts.
- Mismatched tenant/invoice/Deal/money/issue/due snapshots reject.
- Paid/partially paid/cancelled receivables reject new cancellation.
- Aging remains query-time UTC arithmetic with exact CURRENT and 1–30/31–60/61–90/91+ boundaries; paid/cancelled rows are excluded.
- Authorization precedes validation/resource lookup, and missing/cross-tenant resources remain opaque typed not-found.

## Pi execution provenance

```text
provider: openai-codex
model: gpt-5.6-luna
native tool results: observed
initial worker verdict: PASS, rejected as PARTIAL by independent review
repair worker verdict: PASS, independently reviewed
```

Yui review found and fixed one runtime integration defect after the repair worker: repository methods had been extracted and invoked unbound, which would lose `this` on the Prisma repository. A regression fake now requires a bound receiver.

## Fresh independent gate

```bash
pnpm exec prettier --write \
  apps/api/src/features/finance/domain/receivable.ts \
  apps/api/src/features/finance/application/receivable-application.ts \
  apps/api/test/ef233-receivable-reconciliation.application.test.mjs
pnpm --dir apps/api run build
node --test --test-concurrency=1 \
  apps/api/test/ef233-receivable-reconciliation.application.test.mjs
node --test --test-concurrency=1 \
  apps/api/test/ef233-receivable.application.test.mjs
pnpm --dir apps/api lint
git diff --check -- <T5A paths>
```

Result:

```text
focused reconciliation: 13 passed, 0 failed
existing EF-233 application: 18 passed, 0 failed
build: PASS
lint: PASS
diff-check: PASS
EF233_T5A_FINAL_GATE=PASS
```

## Remaining boundary

This evidence does not accept persistence, migration, concurrency, aging query pagination, HTTP, OpenAPI/client, or Web. Cancellation repository ports remain temporarily optional only until T5B implements them; they must become required in T5B.
