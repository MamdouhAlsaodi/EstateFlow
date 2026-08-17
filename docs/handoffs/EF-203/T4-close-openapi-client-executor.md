# EF-203 T4 — Close OpenAPI/client executor report

## Status

**BLOCKED** — the approved closed-world generator rejects the newly documented close operation. Per packet, execution stopped without editing the generator template or generated artifacts.

## Scope and preserved work

- Read the complete contract: `docs/handoffs/EF-203/T0-deal-contract.md`.
- Preserved all pre-existing dirty work; no forbidden path was edited.
- Changed only the allowed controller and OpenAPI test before the generator block.
- `packages/api-client/openapi.json`, `packages/api-client/src/generated.ts`, and `packages/api-client/test/generated-client.test.mjs` were already dirty at packet start and were not hand-edited in this phase.
- No Web, database, migration, credentials, install, commit, push, or deploy activity.

## RED → GREEN evidence

1. Added the close route/path and exact OpenAPI assertions first.
2. RED: `node --test apps/api/test/openapi.test.mjs` failed because `Idempotency-Key` metadata was absent on the close operation.
3. Added Swagger metadata only to `closeWon` and `closeLost`:
   - exact closed request schemas
   - required `Idempotency-Key`
   - `201` for won and `200` for lost
   - no response schema added
4. GREEN: `pnpm --dir apps/api run build` exited 0.
5. GREEN: `node --test apps/api/test/openapi.test.mjs` — 1 pass, 0 failures.

## Required generator evidence

Command: `pnpm run generate:openapi`

Result: exit 1. The existing generator emitted this non-secret diagnostic and stopped before writing artifacts:

```text
Error: Unsupported OpenAPI LeadController operation POST /organizations/{organizationId}/leads/{leadId}/close-won
```

This is the packet’s explicit BLOCKED condition: the current closed-world generator does not accept the two newly documented operations. The generator template was not changed, and generated artifacts were not manually changed.

## Not run after blocker

The following packet verification steps could not establish acceptance because generation is blocked:

- `node scripts/check-openapi-drift.mjs` / `pnpm run check:openapi-drift`
- `node --test packages/api-client/test/generated-client.test.mjs`
- `node --test apps/api/test/ef202-lead.http.test.mjs`

`git diff --check` was run and exited 0 before this report.

## Required unblocker

A separate approved packet must extend `scripts/openapi-client-template.mjs` for the two exact close operations, after which this packet’s generation, drift, generated-client, static HTTP, build, and final diff checks can be rerun. No generic Deal API should be introduced.
