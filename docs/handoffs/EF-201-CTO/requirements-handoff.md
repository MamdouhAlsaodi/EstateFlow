# Role Report — EF-201-CTO

## Status
PARTIAL

EF-201 requirements and architecture are bounded below, but implementation cannot be authorized until the explicit G1 decisions are made. No product, configuration, schema, or test source was changed.

## Goal
Produce the read-only requirements and architecture handoff for the Basic Property/Listing workflow, grounded in the approved EstateFlow roadmap and the implemented authentication and organization boundaries.

## Allowed paths used
- `docs/handoffs/EF-201-CTO/requirements-handoff.md`

## Files changed
- `docs/handoffs/EF-201-CTO/requirements-handoff.md`

## Commands run
- No shell, database, Docker, migration, test, build, or Git command was run.
- Read-only inspection used only the sources declared by the packet.

## Observed output
- EF-120 and EF-121 are recorded as independently verified PASS; EF-201 depends on EF-121 and EF-104.
- The current Prisma schema has identity, session, organization, and membership models only; no Property, Listing, address/location, ownership, or image model exists.
- Authentication supplies a verified session principal containing `userId`, verification state, platform role, session identifiers, and CSRF hash. Unsafe browser requests are protected by canonical-origin, browser-session, and CSRF guards.
- Organization membership is organization-scoped and active-status gated. Current permissions are only `READ_ORGANIZATION` (Owner, Manager, Broker, Client) and `MANAGE_MEMBERSHIPS` (Owner, Manager). Property/listing permissions do not yet exist.
- The roadmap requires separate create, update, publish, and archive commands; searchable list/detail; address/location and ownership; a basic image metadata/upload abstraction; and defers map/advanced geo to EF-510 and the async media pipeline to EF-601.

## Requirements and architecture

### Product boundary
EF-201 is a single API-domain slice for organization-scoped basic properties/listings. It must not add leads, deals, finance, viewing scheduling, map/radius/polygon search, background media processing, external storage/provider integration, or web UI unless a later approved packet explicitly expands the task.

### Required business capabilities
1. An authorized active member can create a property/listing in one organization.
2. An authorized active member can update only an allowed editable projection of a property/listing in that organization.
3. Publishing and archiving are explicit commands, not generic field updates.
4. Authorized users can retrieve one in-scope detail projection and a searchable, paginated list projection.
5. A basic image boundary can associate validated image metadata with an in-scope property/listing without leaking a server filesystem path or binding the domain to a storage vendor.
6. Every read and mutation is organization-scoped; an identifier from another organization must not disclose existence or permit mutation.

### Authorization and tenant boundary
- The authenticated actor must come from the established browser session guard, and unsafe endpoints must retain canonical-origin and CSRF protection.
- The property feature must define its own property/listing permissions rather than reuse organization-membership permissions as a proxy. Only an `ACTIVE` membership may receive a property permission.
- Repository methods must accept organization scope explicitly and apply it in every lookup, list, update, state transition, and image association. A controller-provided organization ID alone is insufficient evidence of authorization.
- A platform administrator is not implicitly an organization member under the current organization implementation. Any platform-administration or moderation access for listings is an unresolved product decision, not an implied privilege.
- The current roles do not define property access. The G1 authorization matrix must state create, edit, publish, archive, list/detail, and image-association authority for Owner, Manager, Broker, and Client, including whether a Broker can affect all organization listings or only listings they own/are assigned.

### Lifecycle
The roadmap establishes four separate commands: create, update, publish, and archive. The minimum state model must therefore distinguish at least a non-public working state, a published state, and an archived terminal/non-active state; the exact names, valid transitions, restoration rule, and publication prerequisites require G1 approval.

Required invariants after G1:
- State changes are allowlisted transitions enforced by a use case/domain policy, never arbitrary client-supplied status writes.
- Update must reject fields that are immutable in the current lifecycle state.
- Archive must remove an item from the normal active search result according to the approved visibility rule, while preserving the record for authorized audit/history needs.
- Publish must validate the approved minimum completeness criteria and have a typed failure response when those criteria are not met.
- The decision whether a published listing may be edited directly, must return to draft, or requires a separate revision is unresolved.

### Data and persistence constraints
- Create tenant-owned Property/Listing persistence only in the EF-201 schema task, with UUID identifiers and a required `organizationId` relation to `Organization` using restrictive deletion semantics consistent with existing ownership records.
- The schema must represent the approved property/listing distinction. It must not assume that a property and listing are the same entity without G1 direction.
- Address/location must support the G1-approved basic representation. Precise PostGIS point storage, GiST indexes, radius/polygon filters, clustering, and map contracts remain deferred to EF-510; EF-201 must not prematurely introduce them.
- Ownership must be modeled only after G1 defines its business meaning (owner contact/person, legal owner, broker assignment, or internal listing owner). It must not invent an unverified customer/contact dependency before EF-202.
- Add indexes and uniqueness constraints only for approved list/search and lifecycle queries, always including `organizationId` where tenancy is relevant.
- Use a migration and isolated PostgreSQL integration tests when persistence is approved; do not run migrations or mutate a database in the read-only requirements phase.
- Decide at G1 whether optimistic concurrency/versioning is required for EF-201 updates. The roadmap requires it for EF-202 but does not explicitly settle it for listings.

### Image abstraction
EF-201 requires an application port and metadata model, not a storage-provider commitment. Its domain-facing contract should use a stable opaque media reference plus approved metadata (for example, declared MIME type, size, original filename policy, ordering/role, and association state); no DTO may expose a server filesystem path, credential, or provider-specific secret.

G1 must select one bounded initial behavior:
1. metadata/association only, with no binary upload endpoint;
2. a local/demo storage adapter behind the port; or
3. an upload-intent contract that is implemented later with EF-601.

The decision must also define accepted image types, maximum size/count, signature/content validation ownership, deletion/orphan policy, whether images are required before publishing, and who may attach/remove/reorder images. Signed upload URLs, variant generation, scanning, asynchronous processing, and external object storage are not implied by EF-201 and remain EF-601 work unless explicitly approved.

### Candidate API contract shape (subject to G1 and subsequent plan)
All routes require an authenticated active organization membership and organization-scoped authorization. Mutations require the established unsafe-browser guards.

- `POST /organizations/:organizationId/properties` — create from an allowlisted create DTO; returns a typed property/listing detail projection and `201`.
- `GET /organizations/:organizationId/properties` — returns a paginated, searchable in-scope list projection; supported filters/sort/cursor semantics require G1 definition.
- `GET /organizations/:organizationId/properties/:propertyId` — returns an in-scope detail projection or the approved non-disclosure response for cross-tenant/not-found access.
- `PATCH /organizations/:organizationId/properties/:propertyId` — updates only allowlisted editable fields; returns the updated projection.
- `POST /organizations/:organizationId/properties/:propertyId/publish` — explicit lifecycle command; returns the resulting state or typed validation/state-transition error.
- `POST /organizations/:organizationId/properties/:propertyId/archive` — explicit lifecycle command; returns the resulting state or typed validation/state-transition error.
- Image endpoint(s) must be selected only after the G1 image behavior decision; no provider-specific route is prescribed here.

The final planner must choose the canonical resource term (`property`, `listing`, or separate resources), DTO fields, pagination form, query syntax, response/error codes, and OpenAPI/client regeneration impact. Controllers remain parse → invoke use case → map typed error; they must not contain authorization, lifecycle, or persistence policy.

### Test requirements for the future implementation packet
- Domain/use-case tests for allowed and rejected lifecycle transitions, publish completeness, allowlisted update fields, and property permission decisions.
- Repository/API integration tests proving active-membership enforcement and cross-organization denial for detail, list, update, publish, archive, and image association.
- API tests for unauthenticated, unverified/inactive, forbidden-role, invalid DTO, missing/invalid CSRF or Origin on mutations, not-found/non-disclosure behavior, and typed conflict/validation responses.
- Isolated PostgreSQL integration tests for organization-scoped persistence, constraints/index assumptions, and migration-backed behavior.
- Image tests for the approved port behavior and validation boundaries; no real external provider or filesystem dependency.
- Contract-drift/OpenAPI verification after any approved HTTP DTO/controller change.

## Verification
- Verification performed: source-to-requirement inspection only, as listed in **Observed output**.
- Not performed by packet constraint: database, Docker, migrations, tests, build, runtime smoke, Git inspection, commit, push, or deployment.
- Consequently, no implementation or runtime claim is made.

## Execution lifecycle
Completed as one read-only CTO requirements phase; no executor was started.

## Touched paths observed
- No product/config/schema/test source path was touched.
- The only written path is the packet-declared handoff artifact.

## Session/resume reference
None.

## Risks
- **G1 required:** the product has not selected the Property-versus-Listing aggregate model; exact required fields and searchable fields; ownership meaning; lifecycle transition table and publication prerequisites; role/ownership authorization matrix; cross-tenant non-disclosure response; address/location precision and visibility; update concurrency policy; or initial image behavior and validation limits.
- The existing organization authorization model is intentionally too narrow for property operations. Reusing it without a feature-specific permission policy would conflate membership administration with listing authority.
- Introducing PostGIS, real upload storage, provider credentials, asynchronous media work, or unapproved customer/contact models in EF-201 would widen into deferred EF-510/EF-601/EF-202 scope.
- Documentation impact is **required** once G1 selects public API, authorization, data-model, lifecycle, or media decisions: a later separate documentation task must update `docs/YUI_TECHNICAL_CONTEXT.md` and create an ADR if the selected aggregate, media boundary, or authorization policy involves material alternatives. This read-only handoff does not authorize those edits.

## Recommended next human decision
Approve G1 only with explicit answers to the following decision list:

1. Is the initial aggregate one `Property` that contains listing state, or separate `Property` and `Listing` resources? State the canonical API resource term.
2. Which exact create/update fields are required, optional, searchable, immutable after publish, and safe to return in list versus detail projections?
3. What does “ownership” mean in EF-201, and does it depend on a future Lead/Contact model or only an internal member assignment?
4. What are the exact lifecycle states, allowed transitions, publish prerequisites, archive visibility, restoration rule, and published-edit policy?
5. For Owner, Manager, Broker, and Client, which property actions are permitted? Is authority organization-wide or limited to creator/assignee? Does PlatformAdmin have any listing access in EF-201?
6. Should cross-organization property access return `404` non-disclosure or `403` after membership authorization fails?
7. What basic address/location fields are allowed now, who can see precise location, and is any geospatial point/index explicitly deferred to EF-510?
8. Is optimistic concurrency/version required for EF-201 update/state commands?
9. Select the initial image behavior (metadata-only, local/demo adapter, or deferred upload-intent), plus MIME/signature validation, size/count limits, publish requirement, ordering, and deletion/orphan policy.
10. Confirm that EF-201 excludes real customer data, external storage/provider credentials, migrations without a separately approved executor packet, web UI, maps, and async media processing.

After explicit G1 approval, run exactly **`yui-scout`** in the `luna-scout` lane for a read-only EF-201 impact map. Suggested bounded scout scope: `apps/api/prisma/schema.prisma`, `apps/api/src/features/auth/**`, `apps/api/src/features/organizations/**`, API module/bootstrap registration and database-boundary files directly required to register a new feature, existing API test conventions and OpenAPI-generation/configuration sources directly required to define verification, and the approved G1 record. The scout must identify exact future property-feature paths, integration points, test locations, migration implications, and documentation impact; it must not edit or implement. The following `yui-plan` phase must turn the approved G1 answers and scout evidence into bounded implementation packets before any executor is authorized.
