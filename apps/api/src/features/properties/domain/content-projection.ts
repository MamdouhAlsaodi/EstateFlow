/**
 * EF-403 — allowlisted property projection for content generation.
 *
 * The safety model of listing-to-content generation starts here: an explicit,
 * closed allowlist of the property fields that may ever reach generated
 * marketing copy. Generation is a pure function of (property version,
 * template version, channel) over THIS projection only.
 *
 * Explicitly excluded (must never appear in generated copy or in the
 * projection payload):
 * - `ownerReference` — owner personal data.
 * - `organizationId` — internal tenant identifier.
 * - `status` — internal lifecycle bookkeeping.
 * - `createdAt`/`updatedAt` — internal timestamps.
 * Facts the projection does not carry (price, area, rooms, …) can never be
 * invented downstream: template rendering turns their absence into visible
 * `[PRICE]`-style placeholders.
 */

import type { Property } from "./property.js";

/** Property fields allowlisted for content generation, in stable order. */
export const PROPERTY_CONTENT_ALLOWLIST = [
  "title",
  "propertyType",
  "addressText",
] as const;

export type PropertyContentAllowlistField =
  (typeof PROPERTY_CONTENT_ALLOWLIST)[number];

/**
 * The deterministic, allowlisted view of one property version that template
 * rendering consumes. Identifiers travel with it so the provenance stamp can
 * name the exact source (property id + version).
 */
export type PropertyContentProjection = Readonly<{
  propertyId: string;
  title: string;
  propertyType: string;
  addressText: string;
  /** Property version the projection was taken from — part of the stamp. */
  version: number;
}>;

const MAX_PROJECTION_TEXT = 500;

function projectionText(value: string, field: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`Invalid projected ${field}`);
  }
  // Trim normalization (never invention): the underlying property domain
  // stores values verbatim, so the projection canonicalizes whitespace only.
  const canonical = value.trim();
  if (canonical.length === 0 || canonical.length > MAX_PROJECTION_TEXT) {
    throw new TypeError(`Invalid projected ${field}`);
  }
  return canonical;
}

/**
 * Pure, deterministic projection: copies exactly the allowlisted fields off a
 * property record and nothing else. `ownerReference` and every non-allowlisted
 * field are structurally unreachable for downstream rendering.
 */
export function projectPropertyForContent(
  property: Pick<
    Property,
    "id" | "title" | "propertyType" | "addressText" | "status" | "version"
  >,
): PropertyContentProjection {
  if (property.status !== "ACTIVE") {
    throw new RangeError("Only active properties project into content");
  }
  return Object.freeze({
    propertyId: projectionText(property.id, "property id"),
    title: projectionText(property.title, "title"),
    propertyType: projectionText(property.propertyType, "propertyType"),
    addressText: projectionText(property.addressText, "addressText"),
    version: property.version,
  });
}
