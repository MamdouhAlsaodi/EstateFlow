/**
 * EF-601 — media contract for the Arabic property workspace. Closed-world
 * normalizers: every response field is validated and picked explicitly; the
 * API never sends storage keys or filesystem paths and the normalizers refuse
 * payloads that carry unexpected shapes.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export type MediaKind = "IMAGE" | "VIDEO";
export type MediaStatusView = "PENDING" | "CONFIRMED" | "PROCESSING";
export type MediaVariantName = "THUMB" | "PREVIEW";

export type MediaVariantView = Readonly<{
  variantId: string;
  variant: MediaVariantName;
  width: number;
  height: number;
  byteSize: number;
}>;

export type MediaItem = Readonly<{
  mediaId: string;
  propertyId: string;
  kind: MediaKind;
  status: MediaStatusView;
  format: string | null;
  byteSize: number | null;
  width: number | null;
  height: number | null;
  fileName: string;
  isCover: boolean;
  createdAt: string;
  confirmedAt: string | null;
  processingNote: string | null;
  variants: readonly MediaVariantView[];
}>;

export type MediaList = Readonly<{
  items: readonly MediaItem[];
}>;

export type UploadIntentView = Readonly<{
  mediaId: string;
  storageKey: string;
  token: string;
  contentType: string;
  maxBytes: number;
  expiresAt: string;
}>;

export type PropertySummary = Readonly<{
  id: string;
  organizationId: string;
  title: string;
  propertyType: string;
  addressText: string;
  status: string;
  version: number;
  latitude: number | null;
  longitude: number | null;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireUuid(name: string, value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value))
    throw new TypeError(`Invalid ${name}`);
  return value;
}

function requireInstant(name: string, value: unknown): string {
  if (typeof value !== "string" || !ISO_INSTANT.test(value))
    throw new TypeError(`Invalid ${name}`);
  return value;
}

function optionalDimension(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 10000
  )
    throw new TypeError("Invalid dimension");
  return value;
}

function normalizeVariant(value: unknown): MediaVariantView {
  if (!isRecord(value)) throw new TypeError("Invalid media variant payload");
  if (value.variant !== "THUMB" && value.variant !== "PREVIEW")
    throw new TypeError("Invalid media variant kind");
  return {
    variantId: requireUuid("variant id", value.variantId),
    variant: value.variant,
    width: optionalDimension(value.width) ?? 0,
    height: optionalDimension(value.height) ?? 0,
    byteSize:
      typeof value.byteSize === "number" && Number.isSafeInteger(value.byteSize)
        ? value.byteSize
        : 0,
  };
}

export function normalizeMediaItem(value: unknown): MediaItem {
  if (!isRecord(value)) throw new TypeError("Invalid media payload");
  if (typeof value.status !== "string")
    throw new TypeError("Invalid media status");
  const status = value.status;
  if (status !== "PENDING" && status !== "CONFIRMED" && status !== "PROCESSING")
    throw new TypeError("Invalid media status");
  if (value.kind !== "IMAGE" && value.kind !== "VIDEO")
    throw new TypeError("Invalid media kind");
  const fileName =
    typeof value.fileName === "string" && value.fileName.length <= 120
      ? value.fileName
      : "";
  const variants = Array.isArray(value.variants)
    ? value.variants.map(normalizeVariant)
    : [];
  if (variants.length > 2) throw new TypeError("Invalid media variants");
  return {
    mediaId: requireUuid("media id", value.mediaId),
    propertyId: requireUuid("property id", value.propertyId),
    kind: value.kind,
    status,
    format:
      typeof value.format === "string" && value.format.length <= 8
        ? value.format
        : null,
    byteSize:
      typeof value.byteSize === "number" && Number.isSafeInteger(value.byteSize)
        ? value.byteSize
        : null,
    width: optionalDimension(value.width),
    height: optionalDimension(value.height),
    fileName,
    isCover: value.isCover === true,
    createdAt: requireInstant("media createdAt", value.createdAt),
    confirmedAt:
      value.confirmedAt === null || value.confirmedAt === undefined
        ? null
        : requireInstant("media confirmedAt", value.confirmedAt),
    processingNote:
      typeof value.processingNote === "string" ? value.processingNote : null,
    variants,
  };
}

export function normalizeMediaList(payload: unknown): MediaList {
  if (!isRecord(payload) || !Array.isArray(payload.items))
    throw new TypeError("Invalid media list payload");
  return { items: payload.items.map(normalizeMediaItem) };
}

export function normalizeUploadIntent(payload: unknown): UploadIntentView {
  if (!isRecord(payload)) throw new TypeError("Invalid upload intent payload");
  if (
    typeof payload.storageKey !== "string" ||
    !/^et1_[A-Za-z0-9_-]{8,110}$/.test(payload.storageKey)
  )
    throw new TypeError("Invalid storage key");
  if (typeof payload.token !== "string" || payload.token.length < 8)
    throw new TypeError("Invalid upload token");
  if (
    typeof payload.contentType !== "string" ||
    !/^[a-z]+\/[a-z0-9.+-]+$/.test(payload.contentType)
  )
    throw new TypeError("Invalid upload content type");
  if (
    typeof payload.maxBytes !== "number" ||
    !Number.isSafeInteger(payload.maxBytes) ||
    payload.maxBytes < 1
  )
    throw new TypeError("Invalid upload max bytes");
  return {
    mediaId: requireUuid("media id", payload.mediaId),
    storageKey: payload.storageKey,
    token: payload.token,
    contentType: payload.contentType,
    maxBytes: payload.maxBytes,
    expiresAt: requireInstant("intent expiresAt", payload.expiresAt),
  };
}

export function normalizePropertySummary(payload: unknown): PropertySummary {
  if (!isRecord(payload)) throw new TypeError("Invalid property payload");
  if (typeof payload.title !== "string" || payload.title.length === 0)
    throw new TypeError("Invalid property title");
  const latitude =
    typeof payload.latitude === "number" ? payload.latitude : null;
  const longitude =
    typeof payload.longitude === "number" ? payload.longitude : null;
  return {
    id: requireUuid("property id", payload.id),
    organizationId: requireUuid("organization id", payload.organizationId),
    title: payload.title,
    propertyType:
      typeof payload.propertyType === "string" ? payload.propertyType : "",
    addressText:
      typeof payload.addressText === "string" ? payload.addressText : "",
    status: typeof payload.status === "string" ? payload.status : "",
    version:
      typeof payload.version === "number" &&
      Number.isSafeInteger(payload.version)
        ? payload.version
        : 0,
    latitude,
    longitude,
  };
}

/** Demo direct-upload endpoint of the in-memory storage simulation. */
export function storageObjectUrl(
  organizationId: string,
  propertyId: string,
  storageKey: string,
  token: string,
): string {
  const id = (name: string, value: string): string => {
    if (!UUID.test(value)) throw new TypeError(`Invalid ${name}`);
    return encodeURIComponent(value);
  };
  if (!/^et1_[A-Za-z0-9_-]{4,110}$/.test(storageKey))
    throw new TypeError("Invalid storage key");
  if (typeof token !== "string" || token.length < 8)
    throw new TypeError("Invalid upload token");
  return (
    `/api/organizations/${id("organization id", organizationId)}` +
    `/properties/${id("property id", propertyId)}` +
    `/media/storage-objects/${encodeURIComponent(storageKey)}` +
    `?token=${encodeURIComponent(token)}`
  );
}

/** Display URL for a confirmed media byte range (original or variant). */
export function mediaBytesUrl(
  organizationId: string,
  propertyId: string,
  mediaId: string,
  variant?: "ORIGINAL" | "THUMB" | "PREVIEW",
): string {
  const id = (name: string, value: string): string => {
    if (!UUID.test(value)) throw new TypeError(`Invalid ${name}`);
    return encodeURIComponent(value);
  };
  const query = variant && variant !== "ORIGINAL" ? `?variant=${variant}` : "";
  return (
    `/api/organizations/${id("organization id", organizationId)}` +
    `/properties/${id("property id", propertyId)}` +
    `/media/${id("media id", mediaId)}/bytes${query}`
  );
}

export const MEDIA_STATUS_LABELS: Readonly<Record<MediaStatusView, string>> = {
  PENDING: "بانتظار التأكيد",
  CONFIRMED: "مؤكدة",
  PROCESSING: "قيد المعالجة",
};

export const MEDIA_KIND_LABELS: Readonly<Record<MediaKind, string>> = {
  IMAGE: "صورة",
  VIDEO: "فيديو",
};

export const MEDIA_VARIANT_LABELS: Readonly<Record<MediaVariantName, string>> =
  {
    THUMB: "مصغّرة",
    PREVIEW: "معاينة",
  };

export function formatBytes(byteSize: number | null): string {
  if (byteSize === null || !Number.isSafeInteger(byteSize) || byteSize < 0)
    return "—";
  if (byteSize < 1024) return `${byteSize} بايت`;
  if (byteSize < 1024 * 1024) return `${(byteSize / 1024).toFixed(1)} ك.ب`;
  return `${(byteSize / (1024 * 1024)).toFixed(1)} م.ب`;
}
