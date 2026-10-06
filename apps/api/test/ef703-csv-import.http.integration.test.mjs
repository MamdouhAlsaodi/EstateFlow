// EF-703 — guarded HTTP+PostgreSQL integration suite for reviewed CSV
// property import (dry-run → commit → replay). Synthetic data only: two
// organizations, one OWNER each, and a small bounded CSV of property rows.
// Guarded like ef601-media.http.integration.test.mjs: only runs against the
// local estateflow_test database target with ALLOW_DESTRUCTIVE_TESTS=1, so it
// is skipped on developer machines and must run in CI.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { URL } from "node:url";
import test from "node:test";
import { ValidationPipe } from "@nestjs/common";

const ORIGIN = "https://app.estateflow.test";
const HASH_KEY = "a".repeat(32);
const AUDIT_KEY = "b".repeat(32);
const TABLES = [
  "MediaVariant",
  "MediaAsset",
  "Property",
  "Membership",
  "Organization",
  "User",
  "AccessSession",
  "SessionFamily",
  "RefreshSession",
  "Credential",
  "PasswordReset",
  "EmailVerification",
  "AuthAttempt",
  "AuthRateLimitEvent",
  "SecurityAuditEvent",
];
Object.assign(process.env, {
  NODE_ENV: "test",
  ESTATEFLOW_BROWSER_ORIGIN: ORIGIN,
  ESTATEFLOW_AUTH_HASH_KEY: HASH_KEY,
  ESTATEFLOW_AUDIT_HASH_KEY: AUDIT_KEY,
  ESTATEFLOW_AUTH_FAKE_DELIVERY: "true",
});
const expectedPort = process.env.ESTATEFLOW_TEST_DB_PORT ?? "55433";
function guardedTarget() {
  if (process.env.ALLOW_DESTRUCTIVE_TESTS !== "1" || !process.env.DATABASE_URL)
    return false;
  const url = new URL(process.env.DATABASE_URL);
  return (
    ["postgres:", "postgresql:"].includes(url.protocol) &&
    ["127.0.0.1", "localhost", "::1"].includes(url.hostname) &&
    url.port === expectedPort &&
    url.username === "estateflow_test" &&
    url.pathname === "/estateflow_test"
  );
}
async function sessionFor(prisma, issuer, userId, now) {
  const access = issuer.issue();
  const csrfToken = randomBytes(32).toString("base64url");
  const family = await prisma.sessionFamily.create({
    data: { userId },
    select: { id: true },
  });
  const familyId = family.id;
  await prisma.accessSession.create({
    data: {
      id: access.id,
      familyId: family.id,
      tokenHash: access.hash,
      csrfHash: issuer.hash(csrfToken),
      issuedAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
    },
  });
  return {
    cookie: `__Host-estateflow_access=${access.serialized}; estateflow_csrf=${csrfToken}`,
    csrfToken,
    familyId,
  };
}
async function get(base, path, session) {
  const headers = {};
  if (session) headers.cookie = session.cookie;
  const response = await fetch(`${base}${path}`, { headers });
  const text = await response.text();
  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
    body: text ? JSON.parse(text) : null,
    text,
  };
}
async function postJson(
  base,
  path,
  session,
  body,
  { origin = ORIGIN, withCsrf = true } = {},
) {
  const headers = { origin, "content-type": "application/json" };
  if (session) {
    headers.cookie = session.cookie;
    if (withCsrf) headers["x-csrf-token"] = session.csrfToken;
  }
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
    text,
  };
}

const CSV_HEADER =
  "title,propertyType,addressText,ownerReference,latitude,longitude";
const VALID_CSV = `${CSV_HEADER}
EF-703 Villa One,VILLA,1 Alpha Street,OWN-1,25.2,55.3
EF-703 Villa Two,VILLA,2 Beta Street,,,`;

test(
  "EF-703 guarded CSV import: dry-run writes nothing, commit inserts, replay is 409, cross-org is denied",
  { skip: !guardedTarget() },
  async () => {
    const [
      { NestFactory },
      { AppModule },
      { PrismaService },
      { NodeCryptoCredentialIssuer },
      { requestIdMiddleware },
      { cleanupDatabase, assertTablesAreEmpty },
    ] = await Promise.all([
      import("@nestjs/core"),
      import("../dist/app.module.js"),
      import("../dist/database/prisma.service.js"),
      import("../dist/features/auth/infrastructure/node-crypto-credential-issuer.js"),
      import("../dist/common/http/request-id.middleware.js"),
      import("./support/cleanup-database.mjs"),
    ]);
    const app = await NestFactory.create(AppModule, { logger: false });
    app.use(requestIdMiddleware);
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    const prisma = app.get(PrismaService);
    const now = new Date();
    let base;
    try {
      await prisma.$connect();
      await cleanupDatabase(prisma, TABLES);
      const organizationIdA = randomUUID();
      const organizationIdB = randomUUID();
      const ownerAId = randomUUID();
      const ownerBId = randomUUID();
      await prisma.user.createMany({
        data: [ownerAId, ownerBId].map((id) => ({
          id,
          accountIdentifier: `${id}@test.invalid`,
          verifiedAt: now,
        })),
      });
      await prisma.organization.createMany({
        data: [
          { id: organizationIdA, name: "EF-703 Org A" },
          { id: organizationIdB, name: "EF-703 Org B" },
        ],
      });
      await prisma.membership.createMany({
        data: [
          {
            organizationId: organizationIdA,
            userId: ownerAId,
            role: "OWNER",
            status: "ACTIVE",
          },
          {
            organizationId: organizationIdB,
            userId: ownerBId,
            role: "OWNER",
            status: "ACTIVE",
          },
        ],
      });
      const issuer = new NodeCryptoCredentialIssuer(HASH_KEY);
      const ownerA = await sessionFor(prisma, issuer, ownerAId, now);
      const ownerB = await sessionFor(prisma, issuer, ownerBId, now);
      await app.listen(0, "127.0.0.1");
      base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
      const dryRunPathA = `/organizations/${organizationIdA}/properties/csv-import/dry-run`;
      const commitPathA = `/organizations/${organizationIdA}/properties/csv-import/commit`;

      // Baseline: the Property table starts empty for this clean database.
      const propertyCountBefore = await prisma.property.count();

      // Org A dry-run: parses and validates but must write nothing.
      const dryRun = await postJson(base, dryRunPathA, ownerA, {
        csv: VALID_CSV,
      });
      assert.equal(dryRun.status, 200);
      assert.equal(dryRun.body.report.totalRows, 2);
      assert.equal(dryRun.body.report.validRows, 2);
      assert.equal(dryRun.body.report.errors.length, 0);
      assert.deepEqual(dryRun.body.report.previews, [
        {
          row: 1,
          title: "EF-703 Villa One",
          propertyType: "VILLA",
          hasOwnerReference: true,
        },
        {
          row: 2,
          title: "EF-703 Villa Two",
          propertyType: "VILLA",
          hasOwnerReference: false,
        },
      ]);
      // Boundedness: no cell contents beyond valid-row previews leak.
      const dryRunSerialized = JSON.stringify(dryRun.body);
      assert.equal(dryRunSerialized.includes("1 Alpha Street"), false);
      assert.equal(dryRunSerialized.includes("OWN-1"), false);
      assert.equal(await prisma.property.count(), propertyCountBefore);

      // Org B (valid session, origin, CSRF) is denied on org A's dry-run and
      // commit with the standard typed 403; nothing mutates.
      const deniedB = await postJson(base, dryRunPathA, ownerB, {
        csv: VALID_CSV,
      });
      assert.equal(deniedB.status, 403);
      const commitWrongOrg = await postJson(
        base,
        `/organizations/${organizationIdB}/properties/csv-import/commit`,
        ownerA,
        { csv: VALID_CSV, dryRunToken: dryRun.body.dryRunToken },
      );
      assert.equal(commitWrongOrg.status, 403);
      assert.equal(await prisma.property.count(), propertyCountBefore);

      // Org A commits with the bound token: both rows are inserted.
      const commit = await postJson(base, commitPathA, ownerA, {
        csv: VALID_CSV,
        dryRunToken: dryRun.body.dryRunToken,
      });
      assert.equal(commit.status, 200);
      assert.equal(commit.body.imported, 2);
      assert.equal(commit.body.skippedDuplicate, 0);
      const importedRows = await prisma.property.findMany({
        where: { organizationId: organizationIdA },
        select: { title: true, addressText: true, ownerReference: true },
      });
      assert.equal(importedRows.length, 2);

      // Token replay is single-use: exact 409 and nothing more is inserted.
      const replay = await postJson(base, commitPathA, ownerA, {
        csv: VALID_CSV,
        dryRunToken: dryRun.body.dryRunToken,
      });
      assert.equal(replay.status, 409);
      assert.equal(await prisma.property.count(), propertyCountBefore + 2);

      // Commit with a token bound to different bytes is rejected (409 typed)
      // and writes nothing.
      const tampered = await postJson(base, commitPathA, ownerA, {
        csv: `${VALID_CSV}\nEF-703 Villa Three,VILLA,3 Gamma Street,,26.0,55.4`,
        dryRunToken: dryRun.body.dryRunToken,
      });
      assert.equal(tampered.status, 409);
      assert.equal(await prisma.property.count(), propertyCountBefore + 2);

      // Commit without a token at all is rejected; nothing mutates.
      const noToken = await postJson(base, commitPathA, ownerA, {
        csv: VALID_CSV,
      });
      assert.equal(noToken.status, 409);
      assert.equal(await prisma.property.count(), propertyCountBefore + 2);

      // Duplicate addressText+title within the organization: dry-run + commit
      // of the same rows again skips duplicates and imports nothing new.
      const duplicateDryRun = await postJson(base, dryRunPathA, ownerA, {
        csv: VALID_CSV,
      });
      assert.equal(duplicateDryRun.status, 200);
      const duplicateCommit = await postJson(base, commitPathA, ownerA, {
        csv: VALID_CSV,
        dryRunToken: duplicateDryRun.body.dryRunToken,
      });
      assert.equal(duplicateCommit.status, 200);
      assert.equal(duplicateCommit.body.skippedDuplicate, 2);
      assert.equal(duplicateCommit.body.imported, 0);
      assert.equal(await prisma.property.count(), propertyCountBefore + 2);

      // Guard conventions: CSRF-missing and wrong-origin requests are denied
      // at the guards with 403; neither dry-run nor commit mutates state.
      const deniedNoCsrf = await postJson(
        base,
        dryRunPathA,
        ownerA,
        { csv: VALID_CSV },
        { withCsrf: false },
      );
      assert.equal(deniedNoCsrf.status, 403);
      const deniedWrongOrigin = await postJson(
        base,
        dryRunPathA,
        ownerA,
        { csv: VALID_CSV },
        { origin: "https://evil.example" },
      );
      assert.equal(deniedWrongOrigin.status, 403);
      assert.equal(await prisma.property.count(), propertyCountBefore + 2);
    } finally {
      await app.close();
      await cleanupDatabase(prisma, TABLES);
      await assertTablesAreEmpty(prisma, TABLES);
    }
  },
);
