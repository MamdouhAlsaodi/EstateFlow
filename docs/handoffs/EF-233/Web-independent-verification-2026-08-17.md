# EF-233 Web — Independent Verification

**Date:** 2026-08-17
**Verdict:** PASS

## Accepted boundary

Arabic, organization-scoped command workspace for the three accepted EF-233 operations:

1. Create an invoice draft for an existing Deal.
2. Issue an invoice and create exactly one receivable.
3. Record a partial or full receivable payment.

Route:

```text
/ar/organizations/:organizationId/finance/receivables
```

The workspace is command-only. It does not claim finance read models, balances, aging, exports, cancellation, amendment, refunds, reminders, gateway reconciliation, or ledger automation.

## Transport and safety verification

- Uses the established same-origin `ApiClient.request` transport.
- Browser credentials, request ID, session, and CSRF behavior remain centralized.
- The adapter emits the exact three T4 paths and exact request DTO keys.
- Payment alone emits `Idempotency-Key`.
- Payment retry identity is created once, survives failures, and rotates only after success.
- UUID, canonical positive decimal-string money, uppercase three-letter currency, and strict UTC millisecond timestamps are validated before fetch.
- Unknown request keys and invalid route contexts reject before fetch.
- No optimistic financial balance or receivable state is rendered.
- First success and exact replay produce different accurate feedback.
- Session failure clears the cached CSRF token and exposes an explicit recovery action.

## Interface verification

- Arabic RTL shell integration: PASS.
- Three-stage gold financial rail: PASS.
- Desktop visual smoke at the organization-scoped route: PASS.
- Technical UUID/money/timestamp inputs use LTR direction inside the RTL page: PASS.
- Full UTC placeholders visible without clipping: PASS.
- Labels, heading hierarchy, status/alert roles, focus treatment, reduced motion, and responsive single-column breakpoint: PASS.
- No runtime financial command was sent during visual smoke.

## Clean-code guard

The initial 420-line workspace mixed orchestration, form primitives, and validation. It was split without changing behavior:

- `receivable-command-workspace.tsx`: 294 lines, orchestration and composition.
- `receivable-command-contract.ts`: validation, form state, replay/session predicates.
- `finance-command-form.tsx`: presentational command form and technical field primitives.

```text
clean-code-guard: 1 fixed, 0 flagged for author
```

## Verification evidence

```text
Focused EF-233 Web tests: 6/6 PASS
Web suite: 44/44 PASS
Generated client suite: 23/23 PASS
API suite: 262 pass, 19 integration-only skips, 0 fail
Workspace lint: PASS
Workspace typecheck: PASS
Production workspace build: PASS
OpenAPI drift: PASS
git diff --check: PASS
```

The production build exposes:

```text
/ar/organizations/[organizationId]/finance/receivables
```

## Decision

**EF-233 Web is accepted within its explicit command-only boundary. EF-233 is closed across T0–T4 and Web. The next roadmap task is EF-234 — Expenses, beginning with a bounded T0 contract rather than implementation by assumption.**
