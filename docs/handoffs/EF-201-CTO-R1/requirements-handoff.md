# Role Report — EF-201-CTO-R1

## Status
PASS

## Goal
Produce a read-only requirements and architecture handoff for EF-201 Basic Property/Listing workflow without making product, configuration, schema, or test changes.

## Allowed paths used
- `/home/server/projects/estateflow/docs/CURRENT_HANDOFF.md`
- `/home/server/projects/estateflow/docs/TASKS.md`
- `/home/server/projects/estateflow/docs/DEVELOPMENT_PLAN.md`
- `/home/server/projects/estateflow/docs/YUI_TECHNICAL_CONTEXT.md`
- `/home/server/projects/estateflow/apps/api/prisma/schema.prisma`
- `/home/server/projects/estateflow/apps/api/src/features/organizations/**`
- `/home/server/projects/estateflow/apps/api/src/features/auth/**`
- `/home/server/projects/estateflow/docs/handoffs/EF-201-CTO-R1/requirements-handoff.md` (this artifact)

## Files changed
- Created `/home/server/projects/estateflow/docs/handoffs/EF-201-CTO-R1/requirements-handoff.md` only.
- No product, configuration, schema, or test source was edited.

## Requirements and architecture

### Scope
EF-201 is the first property/listing vertical slice after authentication and organization/RBAC. The source plan requires:

- Property domain.
- Address/location data.
- Ownership.
- Listing status.
- Basic image metadata/upload abstraction.
- Separate create, update, publish, and archive commands.
- Server-side allowlisting of fields and states.
- Searchable list/detail views.
- Advanced map functionality deferred.

The approved product context is a synthetic-data, Arabic-first training demo. The intended workflow is `Property → customer inquiry → Lead → follow-up → viewing → deal → commission/receivable → payment → owner financial report`. EF-201 should establish the property/listing records and lifecycle without implementing Leads, Viewings, Deals, Finance, external media providers, public SaaS, or deployment.

### Explicit non-goals
- No CRM lead pipeline or inquiry conversion.
- No viewing scheduling or overlap constraint; viewing concurrency belongs to EF-501.
- No deal or finance behavior.
- No advanced geo search, radius/polygon filtering, clustering, or map UI; the development plan explicitly defers advanced map work.
- No external image provider, social publishing provider, or production upload infrastructure unless separately approved.
- No autonomous publication.
- No tenant-wide refactor, shared package extraction, or unrelated cleanup.
- No real customer data, credentials, live database mutation, migration execution, Docker execution, commit, push, deployment, or public exposure.

### Existing tenant and identity contract
The current schema and organization feature establish the following facts that EF-201 must preserve:

- `Organization` is the tenant boundary and `Membership` links users to organizations.
- Membership uniqueness is `(organizationId, userId)`.
- Membership roles are `OWNER`, `MANAGER`, `BROKER`, and `CLIENT`; membership states include `PENDING`, `ACTIVE`, `SUSPENDED`, and `REVOKED`.
- Only active memberships receive organization permissions. Current organization permissions are `READ_ORGANIZATION` and `MANAGE_MEMBERSHIPS`.
- Broker membership begins pending and requires platform-admin approval before activation.
- Authentication supplies a verified session principal containing `userId`, `verified`, `platformRole`, session identifiers, and a CSRF hash.
- Browser routes use the existing server-side session guard. Unsafe browser mutations use canonical-origin and CSRF guards.
- The existing application and repository patterns separate use cases, domain policy, HTTP adapters, and Prisma persistence.

EF-201 records must carry an organization scope wherever they are organization-owned. Every read and mutation must derive authorization from the authenticated actor plus an organization membership lookup; a client-side hidden control is not authorization. Cross-organization identifiers must not disclose another tenant's resource, and the implementation must use typed not-found/forbidden behavior consistent with the existing organization boundary.

### Recommended feature boundary
Create an organization-scoped `properties` feature using the established modular-monolith shape:

```text
features/properties/
├── domain/                 # property/listing value rules and lifecycle policy
├── application/            # create, update, publish, archive, list, detail use cases
├── http/                   # DTOs, controller, response/error mapping
├── infrastructure/        # Prisma repositories and image metadata adapter
└── tests/                  # domain, use-case, HTTP, and integration evidence
```

The property feature should own property and listing rules. Authentication, organization membership, session, CSRF, and existing audit/security concerns remain owned by their current features. A repository should expose organization-scoped methods rather than accepting unconstrained global resource operations. Controllers should remain thin: parse input, invoke one use case, and map typed outcomes.

### Recommended domain model shape (requires G1 confirmation)
The plan names Property and Listing but does not define their complete schema. The implementation plan should model, at minimum, a tenant-owned property aggregate and a listing lifecycle associated with that property. The following are architecture constraints, not silently approved product decisions:

- Use stable UUID identifiers consistent with the current schema.
- Include `organizationId` on tenant-owned records and enforce tenant-aware query paths.
- Preserve UTC timestamps and use explicit created/updated metadata.
- Keep property facts separate from listing/presentation state so a property can support future listing changes without duplicating core facts.
- Use explicit lifecycle commands instead of a generic mutable status update.
- Allowlist writable fields separately for create, update, publish, and archive.
- Treat precise location as sensitive operational data; do not expose more precision than the approved audience requires.
- Add optimistic-concurrency protection if the chosen update contract permits competing edits; the exact mechanism is a G1 decision.

### Listing lifecycle
The source plan explicitly requires separate `create`, `update`, `publish`, and `archive` commands. Therefore, lifecycle transitions must be explicit, validated server-side, and covered by invalid-transition tests. The exact statuses, allowed transitions, publish audience, and whether republishing is allowed remain unresolved G1 choices. No implementation should infer a public marketplace meaning from the word `publish`.

A safe architectural split is:

```text
create property/listing → editable draft
update allowed draft fields → draft remains editable
publish command → approved published state, subject to G1 audience rules
archive command → non-active state, not destructive deletion
```

This is a boundary proposal only. The status names, transition graph, archive restoration policy, and visibility semantics require explicit approval.

### Image abstraction
EF-201 should define an image metadata and upload abstraction without binding the domain to a provider SDK. The domain/application contract should describe the asset identity, owning organization/resource, upload state, safe metadata, ordering/primary-image intent, and lifecycle outcome. Persistence should store metadata and provider-independent references only after the G1 storage and upload decisions are made.

The abstraction must not accept arbitrary client-supplied storage keys, MIME types, or image dimensions as trusted facts. Server-side validation must allowlist accepted file types and enforce size/count constraints once G1 values are approved. The first implementation should support a replaceable adapter and synthetic/in-memory test double; external delivery or media processing belongs to later work unless separately approved. Image processing states, object storage, signed URLs, deletion semantics, and upload transport are unresolved G1 decisions.

### Authorization matrix to approve
The current source establishes role names but not property/listing permissions. EF-201 requires an explicit matrix before implementation. At minimum, G1 must decide each action for `OWNER`, `MANAGER`, `BROKER`, `CLIENT`, and `PLATFORM_ADMIN`:

| Action | Required G1 decision |
|---|---|
| View organization properties/listings | Role-specific allow/deny and whether visibility is limited to assigned/owned records |
| Create property/listing | Allowed roles and whether a user may create for the whole organization |
| Update property facts | Allowed roles, ownership/assignment restrictions, and editable fields by lifecycle state |
| Publish listing | Allowed roles, approval requirement, and audience |
| Archive listing | Allowed roles, whether property can be archived, and restoration policy |
| Manage images | Allowed roles, ownership restrictions, and whether clients may upload |
| View precise address/location | Role-specific precision and export behavior |

`PLATFORM_ADMIN` is a platform role used by the existing broker-approval path; it must not automatically become tenant data access without an explicit decision. Existing membership verification and active-status requirements remain mandatory.

### HTTP and error contract
The implementation plan should expose distinct endpoints/use cases for the four mutations and separate searchable list/detail queries. Exact paths, pagination, sort/filter fields, response DTOs, and error codes are unresolved G1 choices. The server must reject unknown writable fields, malformed identifiers, invalid lifecycle transitions, cross-tenant access, and unauthorized role actions with the project's existing validation and typed error conventions.

### UI and evidence expectations
The product context requires Arabic-first responsive UI. EF-201 evidence should cover property/listing create and edit forms, list/detail states, validation/error states, lifecycle status display, unauthorized behavior, and image validation behavior. Empty, loading, and error states are part of the feature definition of done. Exact screen inventory and publish visibility are G1 choices, not assumed here.

## Unresolved G1 decisions
The following decisions must be answered explicitly before a plan or implementation packet is approved; none is invented by this handoff:

1. **Property/listing ownership:** Are records organization-owned only, user-owned/assigned, or both? If both, what is the authoritative ownership relation?
2. **Property/listing cardinality:** Can one property have multiple listings over time or concurrently? Can a listing represent one property only?
3. **Property fields:** Exact required and optional fields for address, property facts, ownership, contact/reference data, and notes; which fields are PII and who may view them?
4. **Location:** Is precise latitude/longitude stored in EF-201, and at what precision is it returned to each role? Is address text searchable?
5. **Lifecycle states:** Exact Property and Listing statuses, initial states, valid transitions, archive/restore behavior, and whether delete is prohibited or allowed only before publication.
6. **Publish meaning:** Internal organization visibility, demo/public visibility, or another audience; whether publish requires approval; whether republish and unpublish are allowed.
7. **Role matrix:** Exact Owner/Manager/Broker/Client permissions for every action in the authorization table, including assignment/ownership restrictions and platform-admin behavior.
8. **Concurrency:** Required optimistic-concurrency mechanism and conflict response for simultaneous edits or lifecycle commands.
9. **Search contract:** Required filters, sort order, pagination/cursor policy, and whether search is organization-wide or restricted by ownership/assignment.
10. **Image contract:** Accepted file types, maximum bytes, image count, primary-image rule, metadata fields, upload transport, storage adapter, processing states, signed access, replacement/deletion, and retention semantics.
11. **Audit:** Which property/listing/image actions require an audit event, which actor/target fields are retained, and whether the existing security audit model is extended or a feature-owned audit record is required.
12. **API/UI surface:** Exact endpoint names, DTO shapes, status/error codes, Arabic labels, and responsive screens required for the EF-201 slice.
13. **Verification boundary:** Whether EF-201 may run isolated PostgreSQL integration tests under the established destructive-test guard, and whether UI/browser evidence is required in this task or a separate packet.

## Test evidence required for the later implementation packet
The implementation packet should require tests written before production behavior where behavior is isolated, with at least:

- Property/listing creation accepts only the approved field set and rejects malformed or forbidden input.
- Required-field, format, and image metadata/upload validation behavior.
- Every approved lifecycle transition succeeds; every unapproved transition fails with a typed result.
- Organization A cannot list, read, update, publish, archive, or manage images for organization B.
- Each approved role/action matrix cell is tested, including inactive membership denial and client restrictions.
- Ownership/assignment restrictions are tested if G1 selects them.
- Concurrent or stale updates are rejected if G1 selects optimistic concurrency.
- Search returns only the authorized organization scope and honors the approved filter/pagination contract.
- Image abstraction uses a test double and never requires a real external provider.
- HTTP contract tests cover success, validation, unauthorized, forbidden, not-found, conflict, and invalid-transition responses.
- If the approved slice includes web UI, responsive Arabic-first form/list/detail evidence must include loading, empty, error, and unauthorized states.

Database integration tests, if approved by G1, must use only the established isolated test database boundary and must not run against a shared or live database. This handoff itself ran no database, Docker, migration, or runtime command.

## Commands run
- `grep -n -A100 -B20 'EF-201' docs/DEVELOPMENT_PLAN.md`
- Read-only file inspection of the packet-declared documentation, schema, organization feature, and auth feature sources.
- `test -f` verification of this handoff artifact after writing.

## Observed output
- The task map identifies EF-201 as dependent on EF-121 and EF-104.
- The development plan defines Property, address/location, ownership, listing status, image metadata/upload abstraction, separate lifecycle commands, server allowlists, and searchable list/detail with advanced maps deferred.
- The schema provides User, Organization, Membership, role/status enums, verified sessions, and security audit persistence; it contains no property/listing models.
- Organization application services enforce verified active membership and role permissions for existing organization operations.
- Auth HTTP boundaries enforce server-side session authentication, canonical origin, and CSRF for unsafe browser mutations.
- No product source was changed and no database, Docker, migration, commit, push, deploy, or external-provider action was run.

## Verification
`test -f /home/server/projects/estateflow/docs/handoffs/EF-201-CTO-R1/requirements-handoff.md` exited with status 0 after the artifact was written.

## Execution lifecycle
completed

## Touched paths observed
- `/home/server/projects/estateflow/docs/handoffs/EF-201-CTO-R1/requirements-handoff.md` only.

## Session/resume reference
None.

## Risks
- The current schema has no Property, Listing, image, or feature-specific audit model; schema design is intentionally deferred to G1-approved implementation planning.
- The existing organization role vocabulary does not define property/listing permissions; applying an assumed matrix would be an unauthorized product decision.
- `publish`, precise location exposure, image storage/transport, and ownership semantics are materially ambiguous and must remain blocked until G1 decisions are recorded.
- No runtime or database verification was appropriate for this read-only CTO phase.

## Documentation impact observed
Required for the next approved implementation planning packet because the feature introduces new domain, API, authorization, data, and image-boundary contracts. This phase changed only its declared handoff artifact.

## Git/publication posture observed
No commit, push, deployment, publication, or external side effect was performed or authorized.

## Recommended next human decision
Approve or revise the numbered unresolved G1 decisions above. After explicit G1 approval, authorize exactly one next workflow: `yui-plan`, scoped only to producing the EF-201 implementation plan/task packet and its declared verification/artifact paths. Do not automatically execute that workflow from this handoff.
