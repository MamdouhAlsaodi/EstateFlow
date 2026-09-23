import assert from "node:assert/strict";
import test from "node:test";
import {
  GenerationPolicyError,
  GenerationValidationError,
  assertNoLegalClaims,
  legalClaimDenylist,
  listGenerationTemplates,
  normalizeForPolicyScan,
  placeholderToken,
  renderGenerationTemplate,
  GENERATION_FACT_SLOTS,
  GENERATION_TEMPLATE_VERSION,
} from "../dist/features/content/domain/generation-template.js";
import {
  PROPERTY_CONTENT_ALLOWLIST,
  projectPropertyForContent,
} from "../dist/features/properties/domain/content-projection.js";
import {
  ContentValidationError,
  createContentItem,
  createContentRevision,
} from "../dist/features/content/domain/content.js";

const projection = Object.freeze({
  propertyId: "3f9d5f6e-6b1d-4c4e-9a9a-0f3e2d1c0b9a",
  title: "شقة حي الملقا",
  propertyType: "شقة",
  addressText: "حي الملقا، الرياض",
  version: 4,
});

const NOW = new Date("2026-09-27T10:00:00.000Z");

function baseItemInput(overrides = {}) {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    organizationId: "11111111-1111-4111-8111-111111111111",
    title: "عنوان",
    body: "نص",
    channel: "INSTAGRAM",
    createdBy: "33333333-3333-4333-8333-333333333333",
    createdAt: NOW,
    ...overrides,
  };
}

test("EF-403 projection is a closed allowlist: owner PII and internal fields never project", () => {
  assert.deepEqual(
    [...PROPERTY_CONTENT_ALLOWLIST],
    ["title", "propertyType", "addressText"],
  );
  const projected = projectPropertyForContent({
    id: projection.propertyId,
    title: "شقة حي الملقا",
    propertyType: "شقة",
    addressText: "حي الملقا، الرياض",
    ownerReference: "المالك صالح — 0555 123 456",
    status: "ACTIVE",
    version: 4,
  });
  const serialized = JSON.stringify(projected);
  // Owner personal data is structurally unreachable.
  assert.ok(!serialized.includes("المالك"));
  assert.ok(!serialized.includes("0555"));
  assert.equal(Object.keys(projected).length, 5);
  assert.equal(projected.propertyId, projection.propertyId);
  assert.equal(projected.version, 4);
  // Trim normalization only — never invention.
  const padded = projectPropertyForContent({
    id: projection.propertyId,
    title: "  شقة حي الملقا  ",
    propertyType: "شقة",
    addressText: "حي الملقا، الرياض",
    status: "ACTIVE",
    version: 4,
  });
  assert.equal(padded.title, "شقة حي الملقا");
});

test("EF-403 generation is deterministic: same property version + template + channel → identical copy", () => {
  const first = renderGenerationTemplate({
    channel: "INSTAGRAM",
    projection,
  });
  const second = renderGenerationTemplate({
    channel: "INSTAGRAM",
    projection,
  });
  assert.deepEqual(first, second);
  // A changed property version is the only thing that may change the stamp —
  // the copy itself is a pure function of the projection values.
  const otherChannel = renderGenerationTemplate({ channel: "X", projection });
  assert.notDeepEqual(first.body, otherChannel.body);
  assert.equal(first.templateVersion, GENERATION_TEMPLATE_VERSION);
  assert.equal(first.templateId, "PROPERTY_LISTING_INSTAGRAM_V1");
});

test("EF-403 missing facts become visible placeholders and are never invented", () => {
  for (const channel of listGenerationTemplates().map((t) => t.channel)) {
    const rendered = renderGenerationTemplate({ channel, projection });
    assert.ok(rendered.title.length > 0);
    assert.ok(rendered.body.length > 0);
    for (const slot of rendered.placeholders) {
      assert.ok(
        rendered.body.includes(placeholderToken(slot)) ||
          rendered.title.includes(placeholderToken(slot)),
        `placeholder ${slot} must be visible in the copy`,
      );
      assert.ok(GENERATION_FACT_SLOTS.includes(slot));
    }
    // Every template renders at least the price placeholder: EF-403 has no
    // price facts anywhere, and inventing one is the forbidden failure.
    assert.ok(rendered.placeholders.includes("PRICE"));
    assert.ok(!/\d{4,}/.test(rendered.body.replace(/\[PRICE\]/g, "")));
  }
  const rendered = renderGenerationTemplate({
    channel: "INSTAGRAM",
    projection,
  });
  assert.deepEqual(rendered.placeholders, ["PRICE", "AREA", "BEDROOMS"]);
});

test("EF-403 legal-claim denylist rejects guarantee wording with typed errors", () => {
  assert.ok(legalClaimDenylist().length >= 10);
  assert.throws(
    () => assertNoLegalClaims("بيع شقة مع ضمان استرداد كامل"),
    (error) =>
      error instanceof GenerationPolicyError &&
      error.code === "GENERATION_POLICY_VIOLATION" &&
      error.matchedTerms.includes("ضمان") &&
      error.matchedTerms.includes("ضمان استرداد"),
  );
  assert.throws(
    () => assertNoLegalClaims("صفقة مضمونة ١٠٠٪"),
    (error) =>
      error instanceof GenerationPolicyError &&
      error.matchedTerms.includes("مضمون"),
  );
  // Diacritics and spelling variations are normalized away.
  assert.throws(
    () => assertNoLegalClaims("عقار مَضْمُون بالكامل"),
    GenerationPolicyError,
  );
  assert.throws(
    () => assertNoLegalClaims("MONEY-BACK GUARANTEE on this deal"),
    (error) =>
      error instanceof GenerationPolicyError &&
      error.matchedTerms.includes("guarantee"),
  );
  assert.equal(normalizeForPolicyScan("أَفضل سِعر مضمون"), "افضل سعر مضمون");
  // Clean marketing copy passes.
  assert.doesNotThrow(() =>
    assertNoLegalClaims("شقة جميلة في حي الملقا متاحة للمعاينة"),
  );
});

test("EF-403 denylist guards the generated copy itself, including tainted property values", () => {
  // A guarantee claim smuggled inside the property title cannot reach a draft.
  assert.throws(
    () =>
      renderGenerationTemplate({
        channel: "INSTAGRAM",
        projection: { ...projection, title: "شقة مضمونة التملك" },
      }),
    GenerationPolicyError,
  );
  assert.throws(
    () =>
      renderGenerationTemplate({
        channel: "EMAIL",
        projection: { ...projection, addressText: "شارع الضمانات، الرياض" },
      }),
    GenerationPolicyError,
  );
});

test("EF-403 template catalog covers every channel exactly once at version 1", () => {
  const templates = listGenerationTemplates();
  assert.equal(templates.length, 10);
  assert.equal(new Set(templates.map((t) => t.channel)).size, 10);
  assert.equal(new Set(templates.map((t) => t.templateId)).size, 10);
  for (const template of templates) {
    assert.equal(template.templateVersion, 1);
    assert.match(template.templateId, /^PROPERTY_LISTING_[A-Z]+_V1$/);
    assert.deepEqual([...template.factSlots], [...GENERATION_FACT_SLOTS]);
  }
});

test("EF-403 unknown channel or unsupported template version is a typed validation error", () => {
  assert.throws(
    () => renderGenerationTemplate({ channel: "MYSPACE", projection }),
    (error) =>
      error instanceof GenerationValidationError &&
      error.code === "GENERATION_VALIDATION_ERROR",
  );
  assert.throws(
    () =>
      renderGenerationTemplate({
        channel: "INSTAGRAM",
        templateVersion: 2,
        projection,
      }),
    GenerationValidationError,
  );
  assert.throws(
    () =>
      renderGenerationTemplate({
        channel: "INSTAGRAM",
        templateVersion: 0,
        projection,
      }),
    GenerationValidationError,
  );
});

test("EF-403 generation provenance stamps the item completely and is rejected when partial", () => {
  const item = createContentItem(
    baseItemInput({
      sourcePropertyId: projection.propertyId,
      sourcePropertyVersion: 4,
      generatedTemplateId: "PROPERTY_LISTING_INSTAGRAM_V1",
      generatedTemplateVersion: 1,
    }),
  );
  assert.equal(item.sourcePropertyId, projection.propertyId);
  assert.equal(item.sourcePropertyVersion, 4);
  assert.equal(item.generatedTemplateId, "PROPERTY_LISTING_INSTAGRAM_V1");
  assert.equal(item.generatedTemplateVersion, 1);
  for (const partial of [
    { sourcePropertyId: projection.propertyId },
    { sourcePropertyVersion: 4 },
    {
      sourcePropertyId: projection.propertyId,
      sourcePropertyVersion: 4,
      generatedTemplateId: "PROPERTY_LISTING_INSTAGRAM_V1",
    },
  ]) {
    assert.throws(
      () => createContentItem(baseItemInput(partial)),
      ContentValidationError,
    );
  }
  assert.throws(
    () =>
      createContentItem(
        baseItemInput({
          sourcePropertyId: projection.propertyId,
          sourcePropertyVersion: 0,
          generatedTemplateId: "PROPERTY_LISTING_INSTAGRAM_V1",
          generatedTemplateVersion: 1,
        }),
      ),
    ContentValidationError,
  );
});

test("EF-403 revisions inherit the generation stamp unchanged; manual items stay unstamped", () => {
  const generated = createContentItem(
    baseItemInput({
      sourcePropertyId: projection.propertyId,
      sourcePropertyVersion: 4,
      generatedTemplateId: "PROPERTY_LISTING_INSTAGRAM_V1",
      generatedTemplateVersion: 1,
    }),
  );
  const manual = createContentItem(baseItemInput());
  assert.equal(manual.sourcePropertyId, undefined);
  const revision = createContentRevision({
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    source: { ...generated, status: "PUBLISHED" },
    lineageMaxVariantNumber: 1,
    organizationId: generated.organizationId,
    createdBy: generated.createdBy,
    createdAt: NOW,
  });
  assert.equal(revision.sourcePropertyId, projection.propertyId);
  assert.equal(revision.sourcePropertyVersion, 4);
  assert.equal(revision.generatedTemplateId, "PROPERTY_LISTING_INSTAGRAM_V1");
  assert.equal(revision.generatedTemplateVersion, 1);
});
