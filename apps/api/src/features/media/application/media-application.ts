/**
 * EF-601 — Media application: signed upload intents, confirm-time validation,
 * deterministic image variants, cover selection, deletion, and the orphan
 * mark+sweep policy. Authority: Owner/Manager/Broker manage media; every
 * active member (including Client) may read. All operations are strictly
 * organization-scoped; cross-tenant reads are 404-equivalent typed errors.
 *
 * The application depends only on the StoragePort and MediaRepository ports;
 * file bytes never flow through command payloads — confirm reads them from
 * the storage adapter.
 */

import type {
  MediaFormat,
  MediaKind,
  MediaStatus,
  MediaVariantKind,
} from "../domain/media.js";
import {
  deriveVariantGeometry,
  MediaValidationError,
  MediaVariantKind as VariantKind,
  validateDeclaredFileName,
  validateMediaBytes,
  VARIANT_TARGET_WIDTHS,
} from "../domain/media.js";
import { MediaIntentSigner } from "../domain/media-intent.js";
import { opaqueStorageKey, type StoragePort } from "../domain/storage.port.js";
import type { MediaAssetRecord, MediaRepository } from "./media-repository.js";

export type MediaRole =
  "OWNER" | "MANAGER" | "BROKER" | "CLIENT" | "PLATFORM_ADMIN";

export type MediaActorContext = {
  userId: string;
  verified: boolean;
  platformAdmin?: boolean;
  memberships: readonly {
    organizationId: string;
    role: MediaRole;
    active: boolean;
  }[];
};

export class MediaAccessDeniedError extends Error {
  constructor() {
    super("Media access denied");
    this.name = "MediaAccessDeniedError";
  }
}

export class MediaNotFoundError extends Error {
  constructor() {
    super("Media not found");
    this.name = "MediaNotFoundError";
  }
}

export type MediaStateErrorCode =
  | "MEDIA_ALREADY_CONFIRMED"
  | "UPLOAD_NOT_FOUND"
  | "MEDIA_ALREADY_ORPHAN"
  | "COVER_REQUIRES_CONFIRMED_IMAGE"
  | "PROPERTY_NOT_FOUND";

export class MediaStateError extends Error {
  readonly code: MediaStateErrorCode;
  constructor(code: MediaStateErrorCode) {
    super(code);
    this.name = "MediaStateError";
    this.code = code;
  }
}

const WRITE_ROLES = new Set<MediaRole>(["OWNER", "MANAGER", "BROKER"]);
const READ_ROLES = new Set<MediaRole>(["OWNER", "MANAGER", "BROKER", "CLIENT"]);

/** Default signed-intent time-to-live. */
export const DEFAULT_INTENT_TTL_SECONDS = 900; // 15 minutes

export type MediaIntentView = Readonly<{
  mediaId: string;
  organizationId: string;
  propertyId: string;
  kind: MediaKind;
  contentType: string;
  maxBytes: number;
  storageKey: string;
  token: string;
  expiresAt: string;
}>;

export type MediaVariantView = Readonly<{
  variantId: string;
  variant: MediaVariantKind;
  width: number;
  height: number;
  byteSize: number;
}>;

export type MediaAssetView = Readonly<{
  mediaId: string;
  organizationId: string;
  propertyId: string;
  kind: MediaKind;
  status: MediaStatus;
  format: MediaFormat | null;
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

export type OrphanMaintenanceResult = Readonly<{
  marked: number;
  swept: number;
  deletedStorageKeys: number;
}>;

export class MediaApplication {
  private readonly storage: StoragePort;
  private readonly repository: MediaRepository;
  private readonly signer: MediaIntentSigner;
  private readonly intentTtlSeconds: number;

  constructor(input: {
    repository: MediaRepository;
    storage: StoragePort;
    signer: MediaIntentSigner;
    intentTtlSeconds?: number;
  }) {
    this.repository = input.repository;
    this.storage = input.storage;
    this.signer = input.signer;
    this.intentTtlSeconds =
      input.intentTtlSeconds ?? DEFAULT_INTENT_TTL_SECONDS;
  }

  private membership(
    actor: MediaActorContext,
    organizationId: string,
  ): { role: MediaRole } {
    if (!actor?.verified) throw new MediaAccessDeniedError();
    const membership = actor.memberships.find(
      (entry) => entry.organizationId === organizationId && entry.active,
    );
    if (!membership) throw new MediaAccessDeniedError();
    return membership;
  }

  private requireWriteRole(
    actor: MediaActorContext,
    organizationId: string,
  ): void {
    const membership = this.membership(actor, organizationId);
    if (!WRITE_ROLES.has(membership.role)) throw new MediaAccessDeniedError();
  }

  private requireReadRole(
    actor: MediaActorContext,
    organizationId: string,
  ): void {
    const membership = this.membership(actor, organizationId);
    if (!READ_ROLES.has(membership.role)) throw new MediaAccessDeniedError();
  }

  /** Issues a short-lived signed upload intent bound to org/user/property. */
  async createUploadIntent(input: {
    actor: MediaActorContext;
    organizationId: string;
    propertyId: string;
    mediaId: string;
    kind: MediaKind;
    contentType: string;
    byteSize: number;
    fileName: string;
    now?: Date;
  }): Promise<MediaIntentView> {
    this.requireWriteRole(input.actor, input.organizationId);
    const property = await this.repository.findProperty(
      input.organizationId,
      input.propertyId,
    );
    if (!property) throw new MediaStateError("PROPERTY_NOT_FOUND");

    const contentType = input.contentType.toLowerCase().trim();
    const kindContentTypes =
      input.kind === "IMAGE"
        ? ["image/jpeg", "image/png", "image/webp"]
        : ["video/mp4", "video/webm", "video/quicktime"];
    if (!kindContentTypes.includes(contentType))
      throw new MediaValidationError("CONTENT_TYPE_UNSUPPORTED");

    if (
      !Number.isSafeInteger(input.byteSize) ||
      input.byteSize < 1 ||
      input.byteSize >
        (input.kind === "IMAGE" ? 5 * 1024 * 1024 : 100 * 1024 * 1024)
    )
      throw new MediaValidationError("OVERSIZE");

    validateDeclaredFileName(input.fileName, input.kind);

    const now = input.now ?? new Date();
    const expiresAt = new Date(now.getTime() + this.intentTtlSeconds * 1000);
    const storageKey = opaqueStorageKey(input.mediaId, "");
    const binding = {
      mediaId: input.mediaId,
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      userId: input.actor.userId,
      kind: input.kind,
      contentType,
      maxBytes: input.byteSize,
      expiresAtEpochSeconds: Math.floor(expiresAt.getTime() / 1000),
    };
    await this.repository.createAsset({
      id: input.mediaId,
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      kind: input.kind,
      declaredContentType: contentType,
      declaredFileName: input.fileName,
      declaredByteSize: input.byteSize,
      storageKey,
      uploadedBy: binding.userId,
      intentExpiresAt: expiresAt,
      createdAt: now,
    });
    const grant = this.storage.issueUploadIntent(binding);
    return {
      mediaId: input.mediaId,
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      kind: input.kind,
      contentType,
      maxBytes: input.byteSize,
      storageKey,
      token: grant.token,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Confirm-time validation: token binding → stored bytes → magic-byte
   * sniffing → size limits → polyglot scan → dimension sanity → deterministic
   * image variants. Videos become PROCESSING placeholders (no transcode).
   */
  async confirmUpload(input: {
    actor: MediaActorContext;
    organizationId: string;
    propertyId: string;
    mediaId: string;
    token: string;
    now?: Date;
  }): Promise<MediaAssetView> {
    this.requireWriteRole(input.actor, input.organizationId);
    const asset = await this.repository.findAsset(
      input.organizationId,
      input.mediaId,
    );
    if (
      !asset ||
      asset.propertyId !== input.propertyId ||
      asset.organizationId !== input.organizationId
    )
      throw new MediaNotFoundError();
    if (asset.status !== "PENDING")
      throw new MediaStateError("MEDIA_ALREADY_CONFIRMED");

    const binding = {
      mediaId: asset.id,
      organizationId: asset.organizationId,
      propertyId: asset.propertyId,
      // The acting user must be the bound uploader: a token signed for
      // another user fails the field-by-field comparison below.
      userId: input.actor.userId,
      kind: asset.kind,
      contentType: asset.declaredContentType,
      maxBytes: asset.declaredByteSize,
      expiresAtEpochSeconds: Math.floor(asset.intentExpiresAt.getTime() / 1000),
    };
    this.signer.verify(input.token, binding);

    const bytes = await this.storage.readObject(asset.storageKey);
    if (bytes === null) throw new MediaStateError("UPLOAD_NOT_FOUND");

    const validated = validateMediaBytes({
      bytes,
      kind: asset.kind,
      declaredContentType: asset.declaredContentType,
    });
    if (validated.byteSize > binding.maxBytes)
      throw new MediaValidationError("OVERSIZE");

    const now = input.now ?? new Date();
    const variants: {
      id: string;
      variant: MediaVariantKind;
      storageKey: string;
      width: number;
      height: number;
      byteSize: number;
    }[] = [];
    if (validated.kind === "IMAGE" && validated.width && validated.height) {
      for (const kind of [VariantKind.THUMB, VariantKind.PREVIEW] as const) {
        const geometry = deriveVariantGeometry(
          kind,
          validated.width,
          validated.height,
        );
        const variantStorageKey = opaqueStorageKey(
          asset.id,
          kind.toLowerCase(),
        );
        // Real adapters re-encode here; the deterministic fake persists a
        // verbatim copy under the variant key so reads are reproducible.
        await this.storage.putDirect(
          variantStorageKey,
          bytes,
          asset.declaredContentType,
        );
        variants.push({
          id: crypto.randomUUID(),
          variant: kind,
          storageKey: variantStorageKey,
          width: geometry.width,
          height: geometry.height,
          byteSize: validated.byteSize,
        });
      }
    }

    const confirmed = await this.repository.confirmAsset({
      organizationId: asset.organizationId,
      mediaId: asset.id,
      format: validated.format,
      byteSize: validated.byteSize,
      sha256: validated.sha256,
      width: validated.width,
      height: validated.height,
      status:
        validated.kind === "IMAGE"
          ? ("CONFIRMED" as MediaStatus)
          : ("PROCESSING" as MediaStatus),
      processingNote:
        validated.kind === "IMAGE" ? null : "VIDEO_TRANSCODE_OUT_OF_SCOPE",
      confirmedAt: now,
      variants,
    });
    return this.toView(confirmed, false);
  }

  async listMedia(input: {
    actor: MediaActorContext;
    organizationId: string;
    propertyId: string;
  }): Promise<readonly MediaAssetView[]> {
    this.requireReadRole(input.actor, input.organizationId);
    const property = await this.repository.findProperty(
      input.organizationId,
      input.propertyId,
    );
    if (!property) throw new MediaStateError("PROPERTY_NOT_FOUND");
    const assets = await this.repository.listByProperty(
      input.organizationId,
      input.propertyId,
    );
    return assets.map((asset) =>
      this.toView(asset, property.coverMediaId === asset.id),
    );
  }

  async mediaBytes(input: {
    actor: MediaActorContext;
    organizationId: string;
    propertyId: string;
    mediaId: string;
    variant?: "ORIGINAL" | "THUMB" | "PREVIEW";
  }): Promise<{ bytes: Uint8Array; contentType: string; byteSize: number }> {
    this.requireReadRole(input.actor, input.organizationId);
    const asset = await this.repository.findAsset(
      input.organizationId,
      input.mediaId,
    );
    if (
      !asset ||
      asset.propertyId !== input.propertyId ||
      (asset.status !== "CONFIRMED" && asset.status !== "PROCESSING")
    )
      throw new MediaNotFoundError();
    const requested = input.variant ?? "ORIGINAL";
    if (requested === "ORIGINAL") {
      const bytes = await this.storage.readObject(asset.storageKey);
      if (bytes === null) throw new MediaNotFoundError();
      return {
        bytes,
        contentType: asset.declaredContentType,
        byteSize: bytes.length,
      };
    }
    const variant = asset.variants.find((v) => v.variant === requested);
    if (!variant) throw new MediaNotFoundError();
    const bytes = await this.storage.readObject(variant.storageKey);
    if (bytes === null) throw new MediaNotFoundError();
    return {
      bytes,
      contentType: asset.declaredContentType,
      byteSize: bytes.length,
    };
  }

  async setCover(input: {
    actor: MediaActorContext;
    organizationId: string;
    propertyId: string;
    mediaId: string;
  }): Promise<MediaAssetView> {
    this.requireWriteRole(input.actor, input.organizationId);
    const asset = await this.repository.findAsset(
      input.organizationId,
      input.mediaId,
    );
    if (
      !asset ||
      asset.propertyId !== input.propertyId ||
      asset.organizationId !== input.organizationId
    )
      throw new MediaNotFoundError();
    if (asset.kind !== "IMAGE" || asset.status !== "CONFIRMED")
      throw new MediaStateError("COVER_REQUIRES_CONFIRMED_IMAGE");
    await this.repository.setCover({
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      mediaId: asset.id,
    });
    return this.toView(asset, true);
  }

  async removeMedia(input: {
    actor: MediaActorContext;
    organizationId: string;
    propertyId: string;
    mediaId: string;
  }): Promise<void> {
    this.requireWriteRole(input.actor, input.organizationId);
    const asset = await this.repository.findAsset(
      input.organizationId,
      input.mediaId,
    );
    if (
      !asset ||
      asset.propertyId !== input.propertyId ||
      asset.organizationId !== input.organizationId
    )
      throw new MediaNotFoundError();
    const keys = [
      asset.storageKey,
      ...asset.variants.map((variant) => variant.storageKey),
    ];
    await this.repository.clearCoverForMedia(input.organizationId, asset.id);
    await this.repository.deleteAsset(input.organizationId, asset.id);
    await this.storage.deleteObjects(keys);
  }

  /**
   * Orphan policy, mark + sweep: PENDING uploads past their intent TTL become
   * ORPHAN, then ORPHAN rows are swept — storage objects first, rows second.
   * CONFIRMED and PROCESSING media is never touched.
   */
  async runOrphanMaintenance(input?: {
    now?: Date;
  }): Promise<OrphanMaintenanceResult> {
    const now = input?.now ?? new Date();
    const marked = await this.repository.markOrphanedUploads({ now });
    const orphans = await this.repository.listOrphanAssets();
    if (orphans.length === 0)
      return { marked: marked.length, swept: 0, deletedStorageKeys: 0 };
    const keys: string[] = [];
    for (const orphan of orphans) {
      keys.push(orphan.storageKey);
      for (const variant of orphan.variants) keys.push(variant.storageKey);
    }
    const deletedStorageKeys = await this.storage.deleteObjects(keys);
    const swept = await this.repository.deleteOrphanAssets(
      orphans.map((orphan) => ({
        organizationId: orphan.organizationId,
        mediaId: orphan.id,
      })),
    );
    return { marked: marked.length, swept, deletedStorageKeys };
  }

  private toView(asset: MediaAssetRecord, isCover: boolean): MediaAssetView {
    return {
      mediaId: asset.id,
      organizationId: asset.organizationId,
      propertyId: asset.propertyId,
      kind: asset.kind,
      status: asset.status,
      format: asset.format,
      byteSize: asset.byteSize,
      width: asset.width,
      height: asset.height,
      fileName: asset.declaredFileName,
      isCover,
      createdAt: asset.createdAt.toISOString(),
      confirmedAt: asset.confirmedAt ? asset.confirmedAt.toISOString() : null,
      processingNote: asset.processingNote,
      variants: asset.variants.map((variant) => ({
        variantId: variant.id,
        variant: variant.variant,
        width: variant.width,
        height: variant.height,
        byteSize: variant.byteSize,
      })),
    };
  }
}

export { VARIANT_TARGET_WIDTHS };
