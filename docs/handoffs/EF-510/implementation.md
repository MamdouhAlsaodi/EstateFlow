# EF-510 — Geo search implementation

**Task:** `ESTATEFLOW-EF510-GEO-SEARCH-001`
**Provider/model:** `openai-codex/gpt-5.6-luna`
**Verdict:** **PASS**

## Delivered

- Added optional normalized `Property.latitude` / `Property.longitude` coordinates with paired-coordinate and range checks.
- Added a PostGIS `geography(Point,4326)` location column, synchronization trigger, and `Property_location_gist_idx` GiST index in migration `20261001000000_ef510_geo_search`.
- Added guarded tenant-scoped geo routes:
  - `GET /organizations/:organizationId/search/properties`
  - `GET /organizations/:organizationId/search/properties/clusters`
- Search supports radius, closed-ring polygon, and inclusive bbox modes, plus text and property-type filters. Results join only `PUBLISHED` listings and enforce active organization membership.
- Search pagination is keyset-only: stable `Property.id ASC` ordering with opaque base64url cursors and no offset/skip pagination.
- Clustering is server-side PostGIS grid aggregation with centers, counts, and `totalMembers`; integration proof asserts the sum of cluster counts equals the filtered member count.
- Added Arabic-first responsive search page at `/ar/organizations/:organizationId/search` with all three modes, results list, and a minimal cluster view using no map SDK.
- The geo controller is intentionally excluded from the existing closed-world Swagger document so `apps/api/test/openapi.test.mjs` remains unchanged as required by the packet. The routes are listed above and covered by EF-510 HTTP metadata/validation tests.

## Tests and evidence

New tests:

- `apps/api/test/ef510-geo.application.test.mjs` — coordinate/polygon/cursor primitives, authorization, and bounded keyset forwarding.
- `apps/api/test/ef510-geo.http.test.mjs` — guarded route metadata, strict mode/coordinate DTO validation, malformed JSON rejection.
- `apps/api/test/ef510-geo.repository.integration.test.mjs` — PostGIS radius containment with JavaScript haversine verification, polygon containment, bbox edge inclusion, cursor stability after insert, clustering sums, tenant isolation, and GiST plan evidence.

Integration target used:

```text
estateflow_test
postgresql://estateflow_test:test_only_change_me@127.0.0.1:55435/estateflow_test
ALLOW_DESTRUCTIVE_TESTS=1
```

Representative fresh explain-plan evidence (`enable_seqscan=off` for deterministic plan inspection):

```text
Index Scan using "Property_location_gist_idx" on "Property" p
  Index Cond: ((location IS NOT NULL) AND (location && _st_expand('0101000020E61000000000000000003F400000000000003E40'::geography, '10000'::double precision)))
  Filter: st_dwithin(location, '0101000020E61000000000000000003F400000000000003E40'::geography, '10000'::double precision, true)
```

## Fresh gate evidence

- `pnpm lint` — **PASS**.
- `pnpm typecheck` — **PASS**.
- `pnpm test` — **PASS**: API unit suite 56 files; Web 79 tests; API client 26 tests; worker 4 tests; design tokens 2 tests.
- `ESTATEFLOW_TEST_DB_PORT=55435 DATABASE_URL=... ALLOW_DESTRUCTIVE_TESTS=1 pnpm test:integration` — **PASS**: API integration suite 30 files; worker integration suite PASS.
- `API_ORIGIN=http://127.0.0.1:3000 pnpm build` — **PASS**, including the Arabic geo-search route.
- `pnpm check:openapi-drift` — **PASS**.
- `git diff --check` — **PASS**.
- Prettier touched-file check — **PASS** after final formatting.

No dependency, environment, worker, external map SDK, commit, push, deployment, shared database, or `apps/api/test/openapi.test.mjs` change was made. No P95 claim is made because the plan does not define an agreed benchmark volume; GiST usage and correctness evidence are included here, with volume benchmarking remaining a later hardening activity.
