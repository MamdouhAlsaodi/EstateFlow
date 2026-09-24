import assert from "node:assert/strict";
import test from "node:test";
import { arMessages, createTranslator } from "../i18n/catalog";
import {
  normalizeGeneratedDraft,
  normalizeGenerationTemplates,
  splitPlaceholderSegments,
} from "../features/content/content-contract";
import {
  generationPanelIntroKey,
  generationProvenanceLabel,
  generationSlotLabels,
} from "../features/content/content-labels";

const orgId = "11111111-1111-4111-8111-111111111111";
const itemId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const propertyId = "3f9d5f6e-6b1d-4c4e-9a9a-0f3e2d1c0b9a";
const actorId = "33333333-3333-4333-8333-333333333333";
const createdAt = "2026-09-27T10:00:00.000Z";

const validTemplate = {
  templateId: "PROPERTY_LISTING_INSTAGRAM_V1",
  channel: "INSTAGRAM",
  templateVersion: 1,
  titlePattern: "{PROPERTY_TYPE} في {ADDRESS}",
  bodyPattern: "المساحة: [AREA] — السعر: [PRICE]",
  factSlots: ["PRICE", "AREA", "BEDROOMS", "BATHROOMS"],
};

const validGenerated = {
  item: {
    id: itemId,
    organizationId: orgId,
    variantNumber: 1,
    title: "شقة في حي الملقا، الرياض",
    body: "المساحة: [AREA] — السعر: [PRICE]",
    channel: "INSTAGRAM",
    status: "DRAFT",
    sourcePropertyId: propertyId,
    sourcePropertyVersion: 3,
    generatedTemplateId: "PROPERTY_LISTING_INSTAGRAM_V1",
    generatedTemplateVersion: 1,
    createdBy: actorId,
    createdAt,
    updatedAt: createdAt,
  },
  placeholders: ["PRICE", "AREA"],
  templateId: "PROPERTY_LISTING_INSTAGRAM_V1",
  templateVersion: 1,
};

test("EF-403 generation templates normalize with closed-world fields", () => {
  const response = normalizeGenerationTemplates({
    items: [validTemplate],
  });
  assert.equal(response.items.length, 1);
  assert.equal(response.items[0].templateId, "PROPERTY_LISTING_INSTAGRAM_V1");
  assert.deepEqual(
    [...response.items[0].factSlots],
    ["PRICE", "AREA", "BEDROOMS", "BATHROOMS"],
  );
  assert.throws(
    () =>
      normalizeGenerationTemplates({
        items: [{ ...validTemplate, prompt: "خداع" }],
      }),
    TypeError,
  );
  assert.throws(
    () =>
      normalizeGenerationTemplates({
        items: [{ ...validTemplate, channel: "MYSPACE" }],
      }),
    TypeError,
  );
  assert.throws(
    () =>
      normalizeGenerationTemplates({
        items: [{ ...validTemplate, templateVersion: 0 }],
      }),
    TypeError,
  );
});

test("EF-403 generated draft normalizer keeps provenance and rejects unknown fields", () => {
  const draft = normalizeGeneratedDraft(validGenerated);
  assert.equal(draft.item.status, "DRAFT");
  assert.equal(draft.item.sourcePropertyId, propertyId);
  assert.equal(draft.item.sourcePropertyVersion, 3);
  assert.equal(draft.templateId, "PROPERTY_LISTING_INSTAGRAM_V1");
  assert.deepEqual([...draft.placeholders], ["PRICE", "AREA"]);
  assert.throws(
    () => normalizeGeneratedDraft({ ...validGenerated, extra: true }),
    TypeError,
  );
  assert.throws(
    () =>
      normalizeGeneratedDraft({
        ...validGenerated,
        placeholders: ["PRICE", "INVENTED"],
      }),
    TypeError,
  );
  // Absent provenance (manual items) is valid; broken provenance values are not.
  normalizeGeneratedDraft({
    ...validGenerated,
    item: Object.fromEntries(
      Object.entries(validGenerated.item).filter(
        ([key]) =>
          ![
            "sourcePropertyId",
            "sourcePropertyVersion",
            "generatedTemplateId",
            "generatedTemplateVersion",
          ].includes(key),
      ),
    ),
  });
  assert.throws(
    () =>
      normalizeGeneratedDraft({
        ...validGenerated,
        item: { ...validGenerated.item, sourcePropertyVersion: 0 },
      }),
    TypeError,
  );
  // Status must be a real lifecycle state; generated drafts are normal DRAFTs.
  assert.throws(
    () =>
      normalizeGeneratedDraft({
        ...validGenerated,
        item: { ...validGenerated.item, status: "AUTO_APPROVED" },
      }),
    TypeError,
  );
});

test("EF-403 placeholder splitting marks every visible [SLOT] for highlighting", () => {
  const segments = splitPlaceholderSegments(
    "المساحة: [AREA] متوفرة — السعر: [PRICE]",
  );
  assert.deepEqual(
    segments.filter((segment) => segment.placeholder).map((s) => s.text),
    ["[AREA]", "[PRICE]"],
  );
  assert.ok(segments[0].text.startsWith("المساحة: "));
  assert.equal(splitPlaceholderSegments("لا عناصر نائبة هنا").length, 1);
  assert.equal(splitPlaceholderSegments("").length, 0);
  // Lowercase or bracket-less tokens are NOT placeholders.
  assert.deepEqual(splitPlaceholderSegments("[price] ض[x]"), [
    { text: "[price] ض[x]", placeholder: false },
  ]);
  assert.throws(() => splitPlaceholderSegments(42 as unknown as string));
});

test("EF-403 Arabic labels and provenance wording are exact", () => {
  const t = createTranslator("ar");
  assert.equal(arMessages[generationSlotLabels.PRICE], "السعر");
  assert.equal(arMessages[generationSlotLabels.AREA], "المساحة");
  assert.match(arMessages[generationPanelIntroKey], /\[PRICE\]/);
  assert.match(arMessages[generationPanelIntroKey], /لا تُخترع/);
  assert.equal(
    generationProvenanceLabel(t, "PROPERTY_LISTING_X_V1", 1, 3),
    "مولّد من القالب PROPERTY_LISTING_X_V1 (إصدار 1) من إصدار العقار 3",
  );
});
