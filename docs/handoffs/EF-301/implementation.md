# EF-301 — Versioned automation rules

## Boundary

EF-301 provides a tenant-scoped, append-only Trigger/Condition/Action rule model. Definitions are closed-world data validated against allowlisted trigger event types, condition operators, and action types; arbitrary JavaScript/code execution is not accepted.

- Rule identity is immutable after creation.
- New behavior is an appended version with `version = previous + 1` and `supersedesVersion` recorded.
- Version rows are database append-only (updates/deletes are rejected by trigger).
- Owner and Manager roles with ACTIVE membership may create, read, append versions, and enable/disable rules. Broker and Client are denied.
- Every repository read/write is organization-scoped and persistence uses organization composite foreign keys.
- HTTP exposes guarded rule commands and version history only; scheduler jobs are not HTTP endpoints.

## Persistence and contract

Migration `20260922120000_ef301_automation_rules_jobs` adds `AutomationRule` and `AutomationRuleVersion` using parameterized raw SQL repositories because this packet does not alter `schema.prisma`. OpenAPI and the generated client publish the six rule operations with closed request/response schemas.

## Deferred

Concrete Lead, Viewing, Finance, and Content action behavior is deferred to EF-303, EF-304, EF-502, and EF-402–405 respectively. A generic delete/PATCH operation is intentionally absent so history cannot be destructively edited.
