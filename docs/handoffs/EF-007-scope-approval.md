# EF-007 — Demo-first scope approval

**Status:** Approved
**Decision owner:** Mamdouh Alsaudi
**Approved on:** 2026-07-25

## Approved delivery mode

EstateFlow begins as a **Training Demo**. It simulates a small real-estate office using curated synthetic data only. No pilot-office data, external credentials, public deployment, or commercial commitment is part of this scope.

## Approved first vertical slice

```text
Property → customer inquiry → Lead → follow-up → viewing
→ deal → commission/receivable → payment → owner financial report
```

## Approved operating choices

- UI language: Arabic-first.
- Reminder channel: in-app only.
- Data import: manual synthetic CSV.
- Architecture: Next.js web, NestJS modular-monolith API, PostgreSQL/PostGIS, Redis/BullMQ worker, organization-aware ownership, immutable operational finance records, transactional outbox.

## Boundaries

- The work is portfolio/training simulation, not a claim of accounting, legal, or production readiness.
- No personal customer data, provider tokens, WhatsApp/social APIs, payment gateway, or production deployment is allowed.
- Synthetic demo fixtures are added only once the corresponding operational vertical slice exists and can consume them.

## Consequence

EF-101 may begin for the Training Demo scope. Commercial pilot pricing, named-office interviews, and external channels remain deferred to a later pilot decision.
