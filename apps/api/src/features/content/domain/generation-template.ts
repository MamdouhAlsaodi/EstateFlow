/**
 * EF-403 — deterministic listing-to-content templates.
 *
 * The safety model of this feature:
 * - Generation = f(propertyVersion, templateVersion, channel). No LLM, no
 *   randomness, no clock: identical inputs render byte-identical copy.
 * - Template variables are sourced ONLY from the allowlisted property
 *   projection (`projectPropertyForContent`). Facts the allowlist does not
 *   carry (price, area, rooms, …) are never invented or defaulted — they
 *   render as visible `[PRICE]`-style placeholders for a human to fill.
 * - A legal-claim denylist with typed rejection forbids guarantee wording in
 *   generated copy (Arabic and English), including claims smuggled in through
 *   property titles/addresses.
 */

import { CONTENT_CHANNELS, type ContentChannel } from "./content.js";
import type { PropertyContentProjection } from "../../properties/domain/content-projection.js";

export class GenerationValidationError extends Error {
  readonly code = "GENERATION_VALIDATION_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "GenerationValidationError";
  }
}

/** Typed rejection of legal-claim wording found in generated copy. */
export class GenerationPolicyError extends Error {
  readonly code = "GENERATION_POLICY_VIOLATION" as const;
  readonly matchedTerms: readonly string[];
  constructor(matchedTerms: readonly string[]) {
    super(
      `Generated copy contains forbidden legal-claim wording: ${matchedTerms.join(", ")}`,
    );
    this.name = "GenerationPolicyError";
    this.matchedTerms = Object.freeze([...matchedTerms]);
  }
}

/**
 * Template slots. `PROPERTY_TITLE`, `PROPERTY_TYPE`, and `ADDRESS` resolve
 * from the allowlisted projection; the fact slots are NOT part of the EF-403
 * allowlist, so they always render as visible placeholders. Adding a fact to
 * the projection allowlist later is the only way a placeholder disappears.
 */
export type GenerationSlot =
  | "PROPERTY_TITLE"
  | "PROPERTY_TYPE"
  | "ADDRESS"
  | "PRICE"
  | "AREA"
  | "BEDROOMS"
  | "BATHROOMS";

/** Missing-fact slots: never resolvable in EF-403, always placeholders. */
export const GENERATION_FACT_SLOTS: readonly GenerationSlot[] = [
  "PRICE",
  "AREA",
  "BEDROOMS",
  "BATHROOMS",
];

export function placeholderToken(slot: GenerationSlot): string {
  return `[${slot}]`;
}

export const GENERATION_TEMPLATE_VERSION = 1;

export type GenerationTemplate = Readonly<{
  templateId: string;
  channel: ContentChannel;
  templateVersion: number;
  titlePattern: string;
  bodyPattern: string;
}>;

/**
 * One deterministic template per content channel, version 1. Patterns may
 * reference `{SLOT}` tokens; every fact slot renders as its placeholder.
 */
export const GENERATION_TEMPLATES: readonly GenerationTemplate[] =
  Object.freeze([
    {
      templateId: "PROPERTY_LISTING_INSTAGRAM_V1",
      channel: "INSTAGRAM",
      templateVersion: 1,
      titlePattern: "{PROPERTY_TYPE} في {ADDRESS}",
      bodyPattern:
        "✨ {PROPERTY_TYPE} في {ADDRESS}\n{PROPERTY_TITLE}\n\nالمساحة: [AREA]\nعدد الغرف: [BEDROOMS]\nالسعر: [PRICE]\n\nللاستفسار وحجز معاينة، راسلونا مباشرة. 📩",
    },
    {
      templateId: "PROPERTY_LISTING_X_V1",
      channel: "X",
      templateVersion: 1,
      titlePattern: "{PROPERTY_TYPE} — {ADDRESS}",
      bodyPattern:
        "{PROPERTY_TITLE}\n{PROPERTY_TYPE} في {ADDRESS}\nالمساحة: [AREA] | الغرف: [BEDROOMS] | السعر: [PRICE]\nللتواصل: رسالة خاصة.",
    },
    {
      templateId: "PROPERTY_LISTING_SNAPCHAT_V1",
      channel: "SNAPCHAT",
      templateVersion: 1,
      titlePattern: "{PROPERTY_TYPE} في {ADDRESS}",
      bodyPattern:
        "📍 {PROPERTY_TITLE} — جولة سريعة\n{PROPERTY_TYPE} في {ADDRESS}\nالمساحة: [AREA] — السعر: [PRICE]\nاسحب لرؤية المزيد 📲",
    },
    {
      templateId: "PROPERTY_LISTING_TIKTOK_V1",
      channel: "TIKTOK",
      templateVersion: 1,
      titlePattern: "جولة داخل {PROPERTY_TITLE}",
      bodyPattern:
        "🎬 جولة داخل {PROPERTY_TITLE}\n{PROPERTY_TYPE} في {ADDRESS}\nالغرف: [BEDROOMS] — الحمامات: [BATHROOMS]\nالمساحة: [AREA] — السعر: [PRICE]\nتابعونا لمزيد من الجولات.",
    },
    {
      templateId: "PROPERTY_LISTING_LINKEDIN_V1",
      channel: "LINKEDIN",
      templateVersion: 1,
      titlePattern: "{PROPERTY_TYPE} في {ADDRESS} — عرض عقاري",
      bodyPattern:
        "نعلن عن توفر {PROPERTY_TYPE} في {ADDRESS}.\nتفاصيل العقار: {PROPERTY_TITLE}.\nالمساحة: [AREA] — عدد الغرف: [BEDROOMS] — السعر: [PRICE].\nللتواصل المهني، استخدم بيانات التواصل في الحساب.",
    },
    {
      templateId: "PROPERTY_LISTING_FACEBOOK_V1",
      channel: "FACEBOOK",
      templateVersion: 1,
      titlePattern: "{PROPERTY_TYPE} متاح في {ADDRESS}",
      bodyPattern:
        "🏠 {PROPERTY_TITLE}\n{PROPERTY_TYPE} في {ADDRESS}\nالمساحة: [AREA] — الغرف: [BEDROOMS] — السعر: [PRICE]\nشارك المنشور مع من يهمه الأمر، وللتواصل علّق أو راسلنا.",
    },
    {
      templateId: "PROPERTY_LISTING_WHATSAPP_V1",
      channel: "WHATSAPP",
      templateVersion: 1,
      titlePattern: "{PROPERTY_TYPE} — {ADDRESS}",
      bodyPattern:
        "مرحباً، لدينا {PROPERTY_TYPE} في {ADDRESS}:\n{PROPERTY_TITLE}\nالمساحة: [AREA]\nالغرف: [BEDROOMS]\nالسعر: [PRICE]\nهل ترغب بتحديد موعد معاينة؟",
    },
    {
      templateId: "PROPERTY_LISTING_EMAIL_V1",
      channel: "EMAIL",
      templateVersion: 1,
      titlePattern: "{PROPERTY_TYPE} في {ADDRESS}",
      bodyPattern:
        "تحية طيبة،\n\nيسعدنا عرض {PROPERTY_TYPE} في {ADDRESS}.\nتفاصيل العقار: {PROPERTY_TITLE}\nالمساحة: [AREA] — الغرف: [BEDROOMS] — الحمامات: [BATHROOMS]\nالسعر: [PRICE]\n\nللرد على هذا البريد، سنكون سعداء بترتيب معاينة.\nمع التقدير.",
    },
    {
      templateId: "PROPERTY_LISTING_WEBSITE_V1",
      channel: "WEBSITE",
      templateVersion: 1,
      titlePattern: "{PROPERTY_TYPE} في {ADDRESS}",
      bodyPattern:
        "{PROPERTY_TITLE}\n\n{PROPERTY_TYPE} في {ADDRESS}.\nالمساحة: [AREA] — عدد الغرف: [BEDROOMS] — الحمامات: [BATHROOMS].\nالسعر: [PRICE].\nالسعر والمساحة أعلاه يحتاجان تأكيداً من فريق التسويق قبل النشر النهائي.",
    },
    {
      templateId: "PROPERTY_LISTING_OTHER_V1",
      channel: "OTHER",
      templateVersion: 1,
      titlePattern: "{PROPERTY_TYPE} في {ADDRESS}",
      bodyPattern:
        "{PROPERTY_TITLE}\n{PROPERTY_TYPE} في {ADDRESS}\nالمساحة: [AREA] — الغرف: [BEDROOMS] — السعر: [PRICE]\nللتواصل، استخدم قنوات المنشورة الرسمية.",
    },
  ]);

function templateFor(
  channel: ContentChannel,
  templateVersion: number,
): GenerationTemplate {
  if (
    typeof channel !== "string" ||
    !CONTENT_CHANNELS.includes(channel as ContentChannel)
  )
    throw new GenerationValidationError("Invalid generation channel");
  if (templateVersion !== GENERATION_TEMPLATE_VERSION)
    throw new GenerationValidationError(
      `Unsupported template version ${String(templateVersion)}`,
    );
  const template = GENERATION_TEMPLATES.find(
    (entry) => entry.channel === channel,
  );
  if (template === undefined)
    throw new GenerationValidationError(
      `No generation template for channel ${channel}`,
    );
  return template;
}

/** Public template catalog for the template-list endpoint and the web flow. */
export type GenerationTemplateDescriptor = Readonly<{
  templateId: string;
  channel: ContentChannel;
  templateVersion: number;
  titlePattern: string;
  bodyPattern: string;
  /** Missing-fact slots this template renders as visible placeholders. */
  factSlots: readonly GenerationSlot[];
}>;

export function listGenerationTemplates(): readonly GenerationTemplateDescriptor[] {
  return GENERATION_TEMPLATES.map((template) =>
    Object.freeze({
      templateId: template.templateId,
      channel: template.channel,
      templateVersion: template.templateVersion,
      titlePattern: template.titlePattern,
      bodyPattern: template.bodyPattern,
      factSlots: GENERATION_FACT_SLOTS,
    }),
  );
}

const GENERATION_SLOT_NAMES: readonly string[] = [
  "PROPERTY_TITLE",
  "PROPERTY_TYPE",
  "ADDRESS",
  "PRICE",
  "AREA",
  "BEDROOMS",
  "BATHROOMS",
];

function projectionSlotValues(
  projection: PropertyContentProjection,
): Readonly<Record<string, string>> {
  // Only allowlisted projection fields are readable here — the projection
  // type carries nothing else, so owner PII cannot leak into copy even by
  // accidental template change.
  return {
    PROPERTY_TITLE: projection.title,
    PROPERTY_TYPE: projection.propertyType,
    ADDRESS: projection.addressText,
  };
}

/**
 * Pure deterministic renderer. Missing facts become visible placeholders;
 * nothing is defaulted, rounded, or invented. The rendered copy is then run
 * through the legal-claim denylist before it can become a draft.
 */
export function renderGenerationTemplate(input: {
  channel: ContentChannel;
  templateVersion?: number;
  projection: PropertyContentProjection;
}): Readonly<{
  title: string;
  body: string;
  templateId: string;
  templateVersion: number;
  placeholders: readonly string[];
}> {
  const templateVersion = input.templateVersion ?? GENERATION_TEMPLATE_VERSION;
  const template = templateFor(input.channel, templateVersion);
  const values = projectionSlotValues(input.projection);
  const placeholders: string[] = [];
  const render = (pattern: string): string =>
    pattern.replace(/\{([A-Z_]+)\}/g, (_match, slot: string) => {
      if (!GENERATION_SLOT_NAMES.includes(slot))
        throw new GenerationValidationError(`Invalid template slot ${slot}`);
      const value = values[slot];
      if (value !== undefined) return value;
      if (!placeholders.includes(slot)) placeholders.push(slot);
      return placeholderToken(slot as GenerationSlot);
    });
  const title = render(template.titlePattern);
  const body = render(template.bodyPattern);
  for (const slot of GENERATION_FACT_SLOTS) {
    const token = placeholderToken(slot);
    if (
      (title.includes(token) || body.includes(token)) &&
      !placeholders.includes(slot)
    )
      placeholders.push(slot);
  }
  assertNoLegalClaims(title);
  assertNoLegalClaims(body);
  return Object.freeze({
    title,
    body,
    templateId: template.templateId,
    templateVersion: template.templateVersion,
    placeholders: Object.freeze(placeholders),
  });
}

/**
 * Legal-claim denylist. Normalization (diacritics stripped, alef/ya/ta
 * marbuta unified, latin lowercased) closes trivial evasion like
 * "مُضَمَّنة" or "GUARANTEED". Matching is intentionally blunt: this is a
 * safety guard, and a false positive costs a human edit — a false negative
 * would publish a legal guarantee.
 */
const LEGAL_CLAIM_DENYLIST: readonly string[] = Object.freeze([
  "ضمان",
  "مضمون",
  "مكفول",
  "استرداد الاموال",
  "ضمان استرداد",
  "ملزم قانونيا",
  "التزام قانوني",
  "guarantee",
  "money back",
  "money-back",
  "risk free",
  "risk-free",
]);

export function legalClaimDenylist(): readonly string[] {
  return LEGAL_CLAIM_DENYLIST;
}

export function normalizeForPolicyScan(value: string): string {
  return value
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Typed rejection: throws `GenerationPolicyError` listing matched terms. */
export function assertNoLegalClaims(text: string): void {
  const normalized = normalizeForPolicyScan(text);
  const matched = LEGAL_CLAIM_DENYLIST.filter((term) =>
    normalized.includes(normalizeForPolicyScan(term)),
  );
  if (matched.length > 0) throw new GenerationPolicyError(matched);
}
