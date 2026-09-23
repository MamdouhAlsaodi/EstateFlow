import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { GenerationApplication } from "../dist/features/content/application/generation-application.js";
import { GenerationPolicyError } from "../dist/features/content/domain/generation-template.js";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";
const PROPERTY_ID = "3f9d5f6e-6b1d-4c4e-9a9a-0f3e2d1c0b9a";
const OWNER_ID = "33333333-3333-4333-8333-333333333333";
const BROKER_ID = "44444444-4444-4444-8444-444444444444";
const CLIENT_ID = "55555555-5555-4555-8555-555555555555";
const NOW = new Date("2026-09-27T10:00:00.000Z");

function membershipReader(memberships) {
  return {
    async findMembership(organizationId, userId) {
      return memberships[`${organizationId}:${userId}`] ?? null;
    },
  };
}

function projectionReader(outcome) {
  return {
    async findContentProjection(organizationId, propertyId) {
      if (organizationId !== ORGANIZATION_ID || propertyId !== PROPERTY_ID)
        return { kind: "not-found" };
      return outcome;
    },
  };
}

function memoryRepository() {
  const calls = { createdDrafts: [] };
  return {
    calls,
    async createGeneratedDraft(input) {
      calls.createdDrafts.push(input);
      return input.item;
    },
    // Unused by generation; present to satisfy the repository port.
    async createContentItem() {},
    async findContentItem() {
      return null;
    },
    async listContentItems() {
      return [];
    },
    async listReviewQueue() {
      return [];
    },
    async listCalendar() {
      return [];
    },
    async listTransitions() {
      return [];
    },
    async listLineage() {
      return [];
    },
    async campaignExistsInOrganization() {
      return false;
    },
    async lineageMaxVariantNumber() {
      return 0;
    },
    async recordContentEdit() {
      return null;
    },
    async recordContentTransition() {
      return null;
    },
    async recordContentRevision() {
      return null;
    },
  };
}

const foundProjection = {
  kind: "found",
  projection: Object.freeze({
    propertyId: PROPERTY_ID,
    title: "شقة حي الملقا",
    propertyType: "شقة",
    addressText: "حي الملقا، الرياض",
    version: 7,
  }),
};

function application(overrides = {}) {
  const repository = overrides.repository ?? memoryRepository();
  return {
    repository,
    app: new GenerationApplication(
      repository,
      overrides.memberships ??
        membershipReader({
          [`${ORGANIZATION_ID}:${OWNER_ID}`]: {
            organizationId: ORGANIZATION_ID,
            role: "OWNER",
            status: "ACTIVE",
          },
          [`${ORGANIZATION_ID}:${BROKER_ID}`]: {
            organizationId: ORGANIZATION_ID,
            role: "BROKER",
            status: "ACTIVE",
          },
          [`${ORGANIZATION_ID}:${CLIENT_ID}`]: {
            organizationId: ORGANIZATION_ID,
            role: "CLIENT",
            status: "ACTIVE",
          },
        }),
      overrides.projections ?? projectionReader(foundProjection),
    ),
  };
}

function generateCommand(overrides = {}) {
  return {
    actor: { verified: true },
    userId: BROKER_ID,
    organizationId: ORGANIZATION_ID,
    contentItemId: randomUUID(),
    propertyId: PROPERTY_ID,
    channel: "INSTAGRAM",
    createdAt: NOW,
    ...overrides,
  };
}

test("EF-403 generation creates a normal DRAFT with an audited IDEA → DRAFT transition and full provenance", async () => {
  const { app, repository } = application();
  const result = await app.generateContentDraft(generateCommand());
  assert.equal(result.kind, "generated");
  assert.equal(result.item.status, "DRAFT");
  assert.equal(result.item.sourcePropertyId, PROPERTY_ID);
  assert.equal(result.item.sourcePropertyVersion, 7);
  assert.equal(
    result.item.generatedTemplateId,
    "PROPERTY_LISTING_INSTAGRAM_V1",
  );
  assert.equal(result.item.generatedTemplateVersion, 1);
  assert.deepEqual([...result.placeholders], ["PRICE", "AREA", "BEDROOMS"]);
  assert.equal(repository.calls.createdDrafts.length, 1);
  const transition = repository.calls.createdDrafts[0].transition;
  assert.equal(transition.fromStatus, "IDEA");
  assert.equal(transition.toStatus, "DRAFT");
  assert.equal(transition.actorId, BROKER_ID);
});

test("EF-403 generation is deterministic across repeats and independent of item id or clock", async () => {
  const { app } = application();
  const first = await app.generateContentDraft(generateCommand());
  const second = await app.generateContentDraft(
    generateCommand({ contentItemId: randomUUID() }),
  );
  assert.equal(first.item.title, second.item.title);
  assert.equal(first.item.body, second.item.body);
  assert.deepEqual(first.placeholders, second.placeholders);
});

test("EF-403 authority: broker generates, owner generates, CLIENT is denied", async () => {
  const { app } = application();
  assert.equal(
    (await app.generateContentDraft(generateCommand())).kind,
    "generated",
  );
  assert.equal(
    (
      await app.generateContentDraft(
        generateCommand({ userId: OWNER_ID, channel: "EMAIL" }),
      )
    ).kind,
    "generated",
  );
  const denied = await app.generateContentDraft(
    generateCommand({ userId: CLIENT_ID }),
  );
  assert.equal(denied.kind, "access-denied");
  const unverified = await app.generateContentDraft(
    generateCommand({ actor: { verified: false } }),
  );
  assert.equal(unverified.kind, "access-denied");
  const templates = await app.listTemplates({
    actor: { verified: true },
    userId: CLIENT_ID,
    organizationId: ORGANIZATION_ID,
  });
  assert.equal(templates.kind, "access-denied");
  const brokerTemplates = await app.listTemplates({
    actor: { verified: true },
    userId: BROKER_ID,
    organizationId: ORGANIZATION_ID,
  });
  assert.equal(brokerTemplates.length, 10);
});

test("EF-403 tenant safety: foreign property ids yield opaque not-found", async () => {
  const { app } = application();
  const foreignProperty = await app.generateContentDraft(
    generateCommand({ propertyId: randomUUID() }),
  );
  assert.equal(foreignProperty.kind, "not-found");
  assert.equal(foreignProperty.resource, "property");
  // A non-member is denied before any resource existence is probed.
  const foreignTenant = await app.generateContentDraft(
    generateCommand({ organizationId: OTHER_ORGANIZATION_ID }),
  );
  assert.equal(foreignTenant.kind, "access-denied");
  // Nothing was persisted for any rejected command.
  assert.equal(
    (await app.generateContentDraft(generateCommand({ userId: CLIENT_ID })))
      .kind,
    "access-denied",
  );
});

test("EF-403 archived properties refuse generation with a typed conflict", async () => {
  const { app } = application({
    projections: projectionReader({ kind: "archived" }),
  });
  const result = await app.generateContentDraft(generateCommand());
  assert.equal(result.kind, "conflict");
  assert.equal(result.reason, "property-archived");
});

test("EF-403 policy violations propagate as typed rejections and persist nothing", async () => {
  const { app, repository } = application({
    projections: projectionReader({
      kind: "found",
      projection: Object.freeze({
        propertyId: PROPERTY_ID,
        title: "شقة بيع مضمون",
        propertyType: "شقة",
        addressText: "حي الملقا، الرياض",
        version: 7,
      }),
    }),
  });
  await assert.rejects(
    () => app.generateContentDraft(generateCommand()),
    (error) => error instanceof GenerationPolicyError,
  );
  assert.equal(repository.calls.createdDrafts.length, 0);
});

test("EF-403 a repository race is reported as a conflict, not a silent success", async () => {
  const { app } = application({
    repository: {
      ...memoryRepository(),
      async createGeneratedDraft() {
        return null;
      },
    },
  });
  const result = await app.generateContentDraft(generateCommand());
  assert.equal(result.kind, "conflict");
  assert.equal(result.reason, "generation-race");
});
