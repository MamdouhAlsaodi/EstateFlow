# EF-202-T6 — CRM-04 Lead Notes and Tasks Contract

**Mode:** execution / bounded architecture writer
**Status:** contract only; no product implementation

## 1. Source-backed boundary

CRM-04 requires Lead notes, tasks, owner, due date, next action, follow-up reminder, and inactivity age. EF-202 is bounded to Lead owner assignment, stage, next action, source/UTM, and timeline. The existing Lead is organization-scoped, versioned, and already supports append-only timeline events plus idempotent mutations.

This packet closes only the smallest persistence/API contract for:

- append-only Lead Notes;
- organization-scoped Lead Tasks with a required due date;
- explicit task completion and explicit due-date rescheduling;
- append-only timeline evidence for those mutations.

The existing Lead owner and `nextAction` remain existing Lead fields and are not duplicated on Note or Task.

## 2. Resource contract

### Lead Note

A Note is immutable after creation and cannot be updated or deleted.

Fields:

- `id: string` — server-generated identifier;
- `organizationId: string` — server-derived scope, never accepted as an authority from the client;
- `leadId: string` — route/resource target;
- `body: string` — required trimmed text, bounded by the domain validation limit;
- `createdByUserId: string` — authenticated actor;
- `createdAt: string` — UTC timestamp.

### Lead Task

A Task is organization-scoped to exactly one Lead and has a required due date.

Fields:

- `id: string` — server-generated identifier;
- `organizationId: string` — server-derived scope;
- `leadId: string` — route/resource target;
- `title: string` — required trimmed text, bounded by the domain validation limit;
- `dueAt: string` — required UTC timestamp;
- `status: "OPEN" | "COMPLETED"`;
- `createdByUserId: string` — authenticated actor;
- `createdAt: string` — UTC timestamp;
- `completedAt: string | null`;
- `version: number` — task optimistic-concurrency version.

No task reminder, scheduler state, assignee, recurrence, priority, description, or automation metadata is part of this contract.

## 3. Commands and HTTP shape

All commands are explicit action endpoints under the organization-scoped Lead resource. There is no generic `PATCH` endpoint.

### `POST /leads/{leadId}/notes`

Command: `CreateLeadNote`

Request DTO:

```ts
{
  body: string;
}
```

The idempotency key is supplied through the existing `Idempotency-Key` request header, not the body.

Response: `201` with the complete Note DTO and its created timeline event identity. A same-command replay returns the original result without another Note or event. Reusing the key for a different payload returns a typed idempotency conflict.

### `POST /leads/{leadId}/tasks`

Command: `CreateLeadTask`

Request DTO:

```ts
{
  title: string;
  dueAt: string; // UTC ISO-8601
}
```

The idempotency key is supplied through the existing `Idempotency-Key` request header, not the body.

Response: `201` with the complete Task DTO (`status: "OPEN"`, `version: 1`). Replay and conflicting reuse follow the same idempotency rules as Note creation.

### `POST /leads/{leadId}/tasks/{taskId}/complete`

Command: `CompleteLeadTask`

Request DTO:

```ts
{
  expectedVersion: number;
}
```

The idempotency key is supplied through the existing `Idempotency-Key` request header, not the body.

Response: `200` with the complete Task DTO (`status: "COMPLETED"`, `completedAt` set, version incremented). A stale version is a typed optimistic-concurrency conflict. Replay returns the first result; a different command with the same key is an idempotency conflict.

### `POST /leads/{leadId}/tasks/{taskId}/reschedule`

Command: `RescheduleLeadTask`

Request DTO:

```ts
{
  dueAt: string; // UTC ISO-8601
  expectedVersion: number;
}
```

The idempotency key is supplied through the existing `Idempotency-Key` request header, not the body.

Response: `200` with the complete Task DTO and incremented version. Rescheduling a completed task is rejected by domain policy. Stale version, replay, and idempotency conflicts use the same typed behavior above.

No create command accepts client-controlled organization, actor, timestamps, status, completion time, version, or timeline-event fields.

## 4. Read response boundary

This packet does not add viewing/list/detail behavior. The subsequent implementation may return the created/changed resource from each command, but no Notes/Tasks listing, filtering, searching, pagination, or separate read endpoint is included here. Existing Lead detail/timeline behavior remains unchanged except for the newly defined events being persisted in its append-only timeline.

## 5. Timeline contract

Extend the existing `TimelineEventType` and Prisma enum with exactly these types:

- `LEAD_NOTE_ADDED`
- `LEAD_TASK_CREATED`
- `LEAD_TASK_COMPLETED`
- `LEAD_TASK_RESCHEDULED`

Every event retains the existing envelope: `leadId`, `organizationId`, `occurredAt`, and append-only persistence. Event `data` is an exact allowlist; no arbitrary client metadata is accepted:

| Event | Allowed data keys |
|---|---|
| `LEAD_NOTE_ADDED` | `noteId` |
| `LEAD_TASK_CREATED` | `taskId`, `dueAt` |
| `LEAD_TASK_COMPLETED` | `taskId`, `completedAt` |
| `LEAD_TASK_RESCHEDULED` | `taskId`, `fromDueAt`, `toDueAt` |

All values are strings; no event contains Note body, Task title, actor PII, credentials, or unbounded payload. Events are created atomically with their resource mutation and cannot be updated or deleted. No timeline event is emitted for reads or rejected commands.

## 6. Authorization, tenancy, and non-disclosure

- Resolve the authenticated actor's active organization membership and role before command execution.
- Load Lead and child resource through the organization-scoped repository boundary using both `organizationId` and resource ID.
- A missing Lead, Note, or Task outside the actor's organization returns the same non-disclosing not-found outcome; do not reveal whether the foreign ID exists.
- Do not trust organization IDs, actor IDs, ownership fields, or resource IDs supplied in a body as authorization evidence.
- Apply the existing Lead ownership/organization policy; a command cannot create or mutate a child belonging to another organization.
- Authorization failures, cross-organization IDs, and absent resources must not disclose names, titles, body text, membership state, or existence.
- Do not log Note body, Task title, or full request payload; correlation/request identifiers may be retained according to existing audit conventions.

## 7. Subsequent execution packet boundaries

The next implementation packet may modify only these exact areas:

### Schema/persistence

- `apps/api/prisma/schema.prisma`: add `LeadNote`, `LeadTask`, their organization/Lead relations, required indexes/uniques, task version/status fields, and the four enum values above.
- `apps/api/prisma/migrations/`: one reviewed migration for those schema changes only.
- `apps/api/src/features/leads/infrastructure/`: Prisma mapping and repository implementation for the two resources, idempotency, atomic event writes, and version checks.

### Domain

- `apps/api/src/features/leads/domain/lead.ts`: the four event types and narrow Note/Task value/transition policies; preserve existing Lead behavior.
- Additional narrowly scoped files under `apps/api/src/features/leads/domain/` only if required by the implementation, with no reminder/automation model.

### Application

- `apps/api/src/features/leads/application/create-lead-note.ts`
- `apps/api/src/features/leads/application/create-lead-task.ts`
- `apps/api/src/features/leads/application/complete-lead-task.ts`
- `apps/api/src/features/leads/application/reschedule-lead-task.ts`
- `apps/api/src/features/leads/application/lead-repository.ts`: narrow repository ports/results for these commands; retain organization scope, idempotency, and typed stale-version outcomes.

### HTTP/contracts

- `apps/api/src/features/leads/http/`: explicit DTO parsing, controller routes, response mapping, and non-disclosing error mapping for the four commands only.
- `apps/api/src/features/leads/contracts/`: stable request/response/error types only for this contract.

### Tests

- `apps/api/src/features/leads/tests/`: domain, application, repository/integration, and HTTP tests for validation, append-only behavior, idempotent replay/conflict, stale versions, completion/rescheduling rules, organization isolation, and non-disclosing authorization failures.

No web/UI, generated client, migration execution, reminder worker, automation, or unrelated Lead/Deal behavior belongs in that packet.

## 8. Explicitly deferred

The following are outside CRM-04 closure here: reminder delivery or scheduling, inactivity-age calculation, automation rules/escalation, task viewing/listing/search/filtering, task assignment beyond existing Lead owner, recurring tasks, notifications, deals, property links, calls/messages/viewings/contracts/financial events, UI implementation, exports, bulk operations, schema changes in this read-only packet, and generic update/delete endpoints.

## 9. Execution constraints

This report is the only artifact of EF-202-T6-CONTRACT. No product source, schema, migration, test, configuration, generated artifact, dependency, credential, database, commit, push, or deployment is modified by this packet.
