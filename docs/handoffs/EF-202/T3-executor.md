# Role Report — EF-202/T3 Quality Correction

## Status
PASS

## Task
EF-202 T3 quality correction: enforce verified principal plus explicit userId and active OWNER/MANAGER/BROKER membership; validate bounded nested UTM input; strengthen focused Nest HTTP contract tests.

## G2/G3 authorization
The supplied execution packet explicitly authorizes this exact EF-202 T3 correction and limits edits to the listed backend, focused-test, and handoff paths. No scope expansion was performed.

## Changed paths
- `apps/api/src/features/leads/application/lead-application.ts`
  - Membership reader is required at construction and queried for every authorization check.
  - Removed `organizationIds` and embedded-membership fallback authorization.
  - Missing/unverified principal or missing userId is denied; only ACTIVE OWNER, MANAGER, or BROKER membership is accepted.
- `apps/api/src/features/leads/http/lead.dto.ts`
  - Replaced unknown UTM payload with nested class-validator DTO.
  - Supported `source`, `medium`, `campaign`, `term`, and `content` fields are strings capped at 255 characters; nested whitelist/forbid-non-whitelisted validation rejects arbitrary fields.
- `apps/api/test/ef202-lead.http.test.mjs`
  - Added module/controller registration metadata assertions, route/guard assertions, ValidationPipe DTO boundary tests, required idempotency-header plumbing, and repository-isolation membership denial tests.
- `docs/handoffs/EF-202/T3-executor.md`
  - Updated with this correction evidence.

No changes were made to Prisma, UI, dependencies, credentials, commits, pushes, deployment, or live-server/database state.

## Verification commands and literal relevant output

```text
source ~/.nvm/nvm.sh && pnpm --dir apps/api run build
> @estateflow/api@0.1.0 build
> pnpm exec tsc --project tsconfig.json
[exit 0]

node --test apps/api/test/ef202-lead.http.test.mjs
ℹ tests 5
ℹ pass 5
ℹ fail 0
ℹ skipped 0

 git diff --check
[exit 0]
```

The focused tests exercise real compiled Nest decorator/module metadata and the same global ValidationPipe options configured by bootstrap; they do not start a server or use a shared database.

## Risks
The pre-existing broader EF-202 application tests outside this packet's Allowed paths still encode the former organizationIds-based contract and were not edited. This correction's named focused HTTP suite and build pass. A separately authorized test-maintenance packet may be needed if the broader suite is required to run unchanged.

## Clean-code guard
clean-code-guard: clean

## Next human decision
Accept this bounded correction as PASS, then independently decide whether to route a quality/security gate and whether to issue a separate packet to migrate legacy tests to the mandatory membership-reader contract. No auto-progress or publication was performed.
