import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import process from "node:process";
import { URL } from "node:url";
import test from "node:test";
import { ValidationPipe } from "@nestjs/common";

const ORIGIN = "https://app.estateflow.test";
const HASH_KEY = "a".repeat(32);
const AUDIT_KEY = "b".repeat(32);
const TABLES = [
  "ContentTransition",
  "ContentItem",
  "LeadTouch",
  "LeadAttributionCorrection",
  "CampaignPerformanceEntry",
  "CampaignBudgetCorrection",
  "CampaignTransition",
  "ExpenseEvidenceMetadata",
  "ExpenseApprovalPolicy",
  "Expense",
  "Campaign",
  "Deal",
  "Property",
  "Lead",
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
  };
}
async function post(base, path, session, body, options = {}) {
  const headers = {
    origin: options.origin ?? ORIGIN,
    "content-type": "application/json",
  };
  if (session) {
    headers.cookie = session.cookie;
    if (options.csrf !== false) headers["x-csrf-token"] = session.csrfToken;
  }
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
async function get(base, path, session) {
  const headers = {};
  if (session) headers.cookie = session.cookie;
  const response = await fetch(`${base}${path}`, { headers });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const OWNER_PII = "المالك صالح الحربي 0555 987 6543";
const generatedBody = {
  propertyId: "3f9d5f6e-6b1d-4c4e-9a9a-0f3e2d1c0b9a",
  channel: "INSTAGRAM",
};

test(
  "EF-403 content generation HTTP: guards, authority, placeholders, provenance, denylist, leakage prevention, tenant-safe 404s, normal workflow — no bypass",
  { skip: !guardedTarget() },
  async () => {
    const [
      { NestFactory },
      { AppModule },
      { PrismaService },
      { NodeCryptoCredentialIssuer },
      { cleanupDatabase, assertTablesAreEmpty },
    ] = await Promise.all([
      import("@nestjs/core"),
      import("../dist/app.module.js"),
      import("../dist/database/prisma.service.js"),
      import("../dist/features/auth/infrastructure/node-crypto-credential-issuer.js"),
      import("./support/cleanup-database.mjs"),
    ]);
    const app = await NestFactory.create(AppModule, { logger: false });
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
      const organizationId = randomUUID();
      const otherOrganizationId = randomUUID();
      const ownerId = randomUUID();
      const managerId = randomUUID();
      const brokerId = randomUUID();
      const clientId = randomUUID();
      const propertyId = generatedBody.propertyId;
      const taintedPropertyId = randomUUID();
      await prisma.user.createMany({
        data: [ownerId, managerId, brokerId, clientId].map((id) => ({
          id,
          accountIdentifier: `${id}@test.invalid`,
          verifiedAt: now,
        })),
      });
      await prisma.organization.createMany({
        data: [
          { id: organizationId, name: "Generation HTTP" },
          { id: otherOrganizationId, name: "Other Generation HTTP" },
        ],
      });
      await prisma.membership.createMany({
        data: [
          { organizationId, userId: ownerId, role: "OWNER", status: "ACTIVE" },
          {
            organizationId,
            userId: managerId,
            role: "MANAGER",
            status: "ACTIVE",
          },
          {
            organizationId,
            userId: brokerId,
            role: "BROKER",
            status: "ACTIVE",
          },
          {
            organizationId,
            userId: clientId,
            role: "CLIENT",
            status: "ACTIVE",
          },
          {
            organizationId: otherOrganizationId,
            userId: ownerId,
            role: "OWNER",
            status: "ACTIVE",
          },
        ],
      });
      await prisma.property.createMany({
        data: [
          {
            id: propertyId,
            organizationId,
            title: "شقة حي الملقا",
            propertyType: "شقة",
            addressText: "حي الملقا، الرياض",
            ownerReference: OWNER_PII,
            status: "ACTIVE",
            version: 1,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: taintedPropertyId,
            organizationId,
            title: "أرض تجارية مضمونة الربح",
            propertyType: "أرض",
            addressText: "طريق الملك عبدالله، جدة",
            status: "ACTIVE",
            version: 1,
            createdAt: now,
            updatedAt: now,
          },
        ],
      });
      const issuer = new NodeCryptoCredentialIssuer(HASH_KEY);
      const owner = await sessionFor(prisma, issuer, ownerId, now);
      const manager = await sessionFor(prisma, issuer, managerId, now);
      const broker = await sessionFor(prisma, issuer, brokerId, now);
      const client = await sessionFor(prisma, issuer, clientId, now);
      await app.listen(0, "127.0.0.1");
      base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
      const generatePath = `/organizations/${organizationId}/content/generate`;
      const templatesPath = `/organizations/${organizationId}/content/generation-templates`;

      // ---- Transport guards on the mutation endpoint. ----
      assert.equal(
        (await post(base, generatePath, null, generatedBody)).status,
        401,
      );
      assert.equal(
        (await post(base, generatePath, owner, generatedBody, { csrf: false }))
          .status,
        403,
      );
      assert.equal(
        (
          await post(base, generatePath, owner, generatedBody, {
            origin: "https://evil.test",
          })
        ).status,
        403,
      );
      // Strict DTO: unknown fields rejected.
      assert.equal(
        (
          await post(base, generatePath, owner, {
            ...generatedBody,
            prompt: "اكتب إعلان ذكي",
          })
        ).status,
        400,
      );
      assert.equal(
        (await post(base, generatePath, owner, { channel: "X" })).status,
        400,
      );
      assert.equal(
        (
          await post(base, generatePath, owner, {
            ...generatedBody,
            channel: "MYSPACE",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await post(base, generatePath, owner, {
            ...generatedBody,
            templateVersion: 99,
          })
        ).status,
        400,
      );

      // ---- Template list endpoint. ----
      assert.equal((await get(base, templatesPath, null)).status, 401);
      assert.equal((await get(base, templatesPath, client)).status, 403);
      const templates = await get(base, templatesPath, broker);
      assert.equal(templates.status, 200);
      assert.equal(templates.body.items.length, 10);
      const instagramTemplate = templates.body.items.find(
        (entry) => entry.channel === "INSTAGRAM",
      );
      assert.equal(
        instagramTemplate.templateId,
        "PROPERTY_LISTING_INSTAGRAM_V1",
      );
      assert.equal(instagramTemplate.templateVersion, 1);
      assert.ok(instagramTemplate.factSlots.includes("PRICE"));

      // ---- Guarded generation: broker allowed, client denied. ----
      assert.equal(
        (await post(base, generatePath, client, generatedBody)).status,
        403,
      );
      const generated = await post(base, generatePath, broker, generatedBody);
      assert.equal(generated.status, 201);
      const item = generated.body.item;
      assert.equal(item.status, "DRAFT");
      assert.equal(item.channel, "INSTAGRAM");
      // Provenance stamp: property version + template version.
      assert.equal(item.sourcePropertyId, propertyId);
      assert.equal(item.sourcePropertyVersion, 1);
      assert.equal(item.generatedTemplateId, "PROPERTY_LISTING_INSTAGRAM_V1");
      assert.equal(item.generatedTemplateVersion, 1);
      // Missing facts are visible placeholders — never invented values.
      assert.deepEqual(generated.body.placeholders, [
        "PRICE",
        "AREA",
        "BEDROOMS",
      ]);
      assert.ok(item.body.includes("[PRICE]"));
      assert.ok(item.body.includes("[AREA]"));
      assert.ok(item.title.includes("حي الملقا، الرياض"));
      assert.ok(!/\d{4,}/.test(item.body.replace(/\[PRICE\]/g, "")));

      // ---- Leakage prevention: owner PII appears nowhere in any payload. ----
      const leakageProbe = JSON.stringify([
        generated.body,
        await get(
          base,
          `/organizations/${organizationId}/content/${item.id}`,
          manager,
        ),
        await get(base, `/organizations/${organizationId}/content`, owner),
        await get(
          base,
          `/organizations/${organizationId}/content/review-queue`,
          manager,
        ),
        templates.body,
      ]);
      assert.ok(!leakageProbe.includes("صالح"));
      assert.ok(!leakageProbe.includes("0555"));
      assert.ok(!leakageProbe.includes("ownerReference"));

      // ---- Determinism: the same inputs render byte-identical copy. ----
      const regenerated = await post(base, generatePath, broker, generatedBody);
      assert.equal(regenerated.status, 201);
      assert.equal(regenerated.body.item.title, item.title);
      assert.equal(regenerated.body.item.body, item.body);
      assert.deepEqual(
        regenerated.body.placeholders,
        generated.body.placeholders,
      );

      // ---- Denylist: guarantee claims (even inside property data) are typed-rejected. ----
      const tainted = await post(base, generatePath, broker, {
        ...generatedBody,
        propertyId: taintedPropertyId,
        channel: "X",
      });
      assert.equal(tainted.status, 400);

      // ---- Tenant safety: foreign property → opaque 404. ----
      assert.equal(
        (
          await post(base, generatePath, owner, {
            propertyId: randomUUID(),
            channel: "X",
          })
        ).status,
        404,
      );
      const foreignGenerate = await post(
        base,
        `/organizations/${otherOrganizationId}/content/generate`,
        owner,
        generatedBody,
      );
      assert.equal(foreignGenerate.status, 404);

      // ---- No bypass: the generated DRAFT walks the full EF-402 lifecycle. ----
      assert.equal(
        (
          await post(
            base,
            `/organizations/${organizationId}/content/${item.id}/transition`,
            broker,
            {
              toStatus: "APPROVED",
            },
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await post(
            base,
            `/organizations/${organizationId}/content/${item.id}/edit`,
            broker,
            {
              title: "عنوان يدوي",
              body: "نص يدوي بدون بصمة",
              channel: "X",
            },
          )
        ).status,
        200,
      );
      // Regenerate a clean copy for the lifecycle walk (the first draft was edited).
      const clean = await post(base, generatePath, manager, generatedBody);
      assert.equal(clean.status, 201);
      const cleanId = clean.body.item.id;
      assert.equal(
        (
          await post(
            base,
            `/organizations/${organizationId}/content/${cleanId}/transition`,
            broker,
            {
              toStatus: "REVIEW",
            },
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await post(
            base,
            `/organizations/${organizationId}/content/${cleanId}/transition`,
            manager,
            {
              toStatus: "APPROVED",
            },
          )
        ).status,
        200,
      );
      // Approved content is locked: edits are conflicts even for the owner.
      assert.equal(
        (
          await post(
            base,
            `/organizations/${organizationId}/content/${cleanId}/edit`,
            owner,
            {
              title: "بعد الاعتماد",
              body: "ممنوع",
              channel: "X",
            },
          )
        ).status,
        409,
      );
      const scheduled = await post(
        base,
        `/organizations/${organizationId}/content/${cleanId}/transition`,
        manager,
        {
          toStatus: "SCHEDULED",
          scheduledFor: new Date(now.getTime() + 86_400_000).toISOString(),
        },
      );
      assert.equal(scheduled.status, 200);
      const published = await post(
        base,
        `/organizations/${organizationId}/content/${cleanId}/transition`,
        owner,
        { toStatus: "PUBLISHED" },
      );
      assert.equal(published.status, 200);
      assert.equal(published.body.item.status, "PUBLISHED");
      assert.match(published.body.item.contentHash, /^[0-9a-f]{64}$/);
      // Published generated content keeps its provenance stamp, immutable.
      assert.equal(published.body.item.sourcePropertyId, propertyId);

      // ---- Detail view carries the provenance stamp. ----
      const detail = await get(
        base,
        `/organizations/${organizationId}/content/${cleanId}`,
        owner,
      );
      assert.equal(detail.status, 200);
      assert.equal(detail.body.item.sourcePropertyId, propertyId);
      assert.equal(
        detail.body.item.generatedTemplateId,
        "PROPERTY_LISTING_INSTAGRAM_V1",
      );
      const lifecycle = detail.body.transitions.map((entry) => entry.toStatus);
      assert.deepEqual(lifecycle, [
        "DRAFT",
        "REVIEW",
        "APPROVED",
        "SCHEDULED",
        "PUBLISHED",
      ]);
      assert.equal(detail.body.transitions[0].fromStatus, "IDEA");
      // The generated draft reached the review queue during the walk.
      // (Already approved; the queue shows remaining REVIEW items only.)
      const queue = await get(
        base,
        `/organizations/${organizationId}/content/review-queue`,
        manager,
      );
      assert.equal(queue.status, 200);
      assert.ok(Array.isArray(queue.body.items));
      assert.equal(
        queue.body.items.some((entry) => entry.id === cleanId),
        false,
      );

      // ---- Client cannot read content at all; lists are tenant-scoped. ----
      assert.equal(
        (await get(base, `/organizations/${organizationId}/content`, client))
          .status,
        403,
      );
      const foreignList = await get(
        base,
        `/organizations/${otherOrganizationId}/content`,
        owner,
      );
      assert.equal(foreignList.status, 200);
      assert.equal(foreignList.body.items.length, 0);
      assert.equal(
        (
          await get(
            base,
            `/organizations/${otherOrganizationId}/content/${cleanId}`,
            owner,
          )
        ).status,
        404,
      );

      await cleanupDatabase(prisma, TABLES);
      await assertTablesAreEmpty(prisma, TABLES);
    } finally {
      await app.close();
    }
  },
);
