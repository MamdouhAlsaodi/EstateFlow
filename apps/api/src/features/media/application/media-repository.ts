/**
 * EF-601 — Media repository port. Persistence stays behind this interface so
 * the application layer is testable against an in-memory fake while the
 * Prisma implementation carries the real tenant-scoped SQL.
 */

import type {
  MediaFormat,
  MediaKind,
  MediaStatus,
  MediaVariantKind,
} from "../domain/media.js";

export type MediaVariantRecord = Readonly<{
  id: string;
  organizationId: string;
  mediaAssetId: string;
  variant: MediaVariantKind;
  storageKey: string;
  width: number;
  height: number;
  byteSize: number;
  createdAt: Date;
}>;

export type MediaAssetRecord = Readonly<{
  id: string;
  organizationId: string;
  propertyId: string;
  kind: MediaKind;
  status: MediaStatus;
  declaredContentType: string;
  declaredFileName: string;
  declaredByteSize: number;
  storageKey: string;
  format: MediaFormat | null;
  byteSize: number | null;
  sha256: string | null;
  width: number | null;
  height: number | null;
  processingNote: string | null;
  uploadedBy: string;
  intentExpiresAt: Date;
  confirmedAt: Date | null;
  orphanMarkedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  variants: readonly MediaVariantRecord[];
}>;

export type PendingMediaAsset = Readonly<{
  id: string;
  organizationId: string;
  propertyId: string;
  kind: MediaKind;
  status: MediaStatus;
  declaredContentType: string;
  declaredByteSize: number;
  storageKey: string;
  uploadedBy: string;
  intentExpiresAt: Date;
}>;

export type ConfirmMediaInput = Readonly<{
  organizationId: string;
  mediaId: string;
  format: MediaFormat;
  byteSize: number;
  sha256: string;
  width: number | null;
  height: number | null;
  status: MediaStatus;
  processingNote: string | null;
  confirmedAt: Date;
  variants: readonly {
    id: string;
    variant: MediaVariantKind;
    storageKey: string;
    width: number;
    height: number;
    byteSize: number;
  }[];
}>;

export interface MediaRepository {
  createAsset(input: {
    id: string;
    organizationId: string;
    propertyId: string;
    kind: MediaKind;
    declaredContentType: string;
    declaredFileName: string;
    declaredByteSize: number;
    storageKey: string;
    uploadedBy: string;
    intentExpiresAt: Date;
    createdAt: Date;
  }): Promise<MediaAssetRecord>;

  findAsset(
    organizationId: string,
    mediaId: string,
  ): Promise<MediaAssetRecord | null>;

  listByProperty(
    organizationId: string,
    propertyId: string,
  ): Promise<readonly MediaAssetRecord[]>;

  findProperty(
    organizationId: string,
    propertyId: string,
  ): Promise<{ id: string; coverMediaId: string | null } | null>;

  confirmAsset(input: ConfirmMediaInput): Promise<MediaAssetRecord>;

  deleteAsset(organizationId: string, mediaId: string): Promise<void>;

  setCover(input: {
    organizationId: string;
    propertyId: string;
    mediaId: string | null;
  }): Promise<void>;

  clearCoverForMedia(organizationId: string, mediaId: string): Promise<void>;

  /** Marks expired PENDING uploads as ORPHAN; returns newly marked rows. */
  markOrphanedUploads(input: {
    now: Date;
  }): Promise<
    readonly { id: string; organizationId: string; storageKey: string }[]
  >;

  /** All ORPHAN assets (with variants) eligible for the sweep. */
  listOrphanAssets(): Promise<readonly MediaAssetRecord[]>;

  /** Deletes the given ORPHAN rows; the sweep removes storage first. */
  deleteOrphanAssets(
    organizationIdsAndIds: readonly {
      organizationId: string;
      mediaId: string;
    }[],
  ): Promise<number>;
}
