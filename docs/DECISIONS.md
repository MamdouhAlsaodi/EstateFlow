# EstateFlow — Architecture and Product Decisions

## ADR-001 — Custom-first market entry

- **Status:** Accepted for product planning
- **Date:** 2026-07-20

EstateFlow begins as a configured system for one small real-estate office, then becomes a repeatable package. A broad public SaaS Marketplace is not the first release target.

**Reason:** This creates the shortest path to real workflow evidence, revenue, and a case study while limiting speculative scale work.

## ADR-002 — Shared kernel boundary with MamtrexS

- **Status:** Accepted for planning
- **Date:** 2026-07-20

Organization, CRM, Finance, Automation, Content, Campaign, Notification, Approval, and Audit abstractions are candidates for reuse. Property, geo-search, broker assignment, viewing, and real-estate contract rules remain EstateFlow-specific.

Shared does not mean a premature separate microservice. Modules begin inside EstateFlow behind explicit interfaces and are extracted only when a second product proves the boundary.

## ADR-003 — Financial integrity model

- **Status:** Proposed; requires Phase 0 approval
- **Date:** 2026-07-20

Use a double-entry operational ledger with integer minor currency units, immutable posted entries, reversals, and auditable dimensions for Deal, Property, Broker, Campaign, and Organization.

This is more robust than mutable totals and supports later reuse for agency retainers, project revenue, media spend, and contractor costs.

## ADR-004 — Automation delivery model

- **Status:** Proposed; requires Phase 0 approval
- **Date:** 2026-07-20

Use domain events plus a transactional outbox, a durable queue, idempotency keys, bounded retries, failed-job visibility, and per-action approval policy.

External publishing and sensitive messages require human approval during the pilot.

## ADR-005 — Technical architecture

- **Status:** Proposed from PRD v1.0; not yet implementation approval
- **Date:** 2026-07-20

- Frontend: Next.js + TypeScript.
- API: NestJS modular monolith.
- Data: PostgreSQL + PostGIS.
- Queue/cache: Redis + BullMQ.
- Media: isolated FFmpeg worker.
- Object storage: S3-compatible provider with signed URLs.
- Real-time: Socket.io.
- Contracts: HTML-to-PDF or PDFKit after a focused spike.

The API is stateless where practical. The Media Worker is isolated early because it is CPU-heavy; other domain modules remain a modular monolith until evidence justifies extraction.

## ADR-006 — Tenant-aware, not full SaaS

- **Status:** Proposed; requires Phase 0 approval
- **Date:** 2026-07-20

Business records carry organization ownership from the first migration. The pilot does not implement self-service tenant provisioning, subscription billing, or complex plan enforcement.

This avoids unsafe retrofitting of organization boundaries while keeping the first product small enough to sell and operate.
