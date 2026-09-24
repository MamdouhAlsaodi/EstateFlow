/**
 * EF-601 — Prisma media repository. Every query is organization-scoped; the
 * composite (organizationId, id) unique constraints make cross-tenant reads
 * structurally impossible. Confirm runs in one transaction (asset update +
 * variant rows); the sweep deletes rows only after storage deletion.
 */

import type { PrismaClient, Prisma } from "@prisma/client";
import type {
  ConfirmMediaInput,
  MediaAssetRecord,
  MediaRepository,
  MediaVariantRecord,
} from "../application/media-repository.js";
import type {
  MediaFormat,
  MediaKind,
  MediaStatus,
  MediaVariantKind,
} from "../domain/media.js";

type MediaAssetRow = Prisma.MediaAssetGetPayload<{
  include: { variants: true };
}>;

function toVariantRecord(
  variant: MediaAssetRow["variants"][number],
): MediaVariantRecord {
  return {
    id: variant.id,
    organizationId: variant.organizationId,
    mediaAssetId: variant.mediaAssetId,
    variant: variant.variant as MediaVariantKind,
    storageKey: variant.storageKey,
    width: variant.width,
    height: variant.height,
    byteSize: variant.byteSize,
    createdAt: variant.createdAt,
  };
}

function toAssetRecord(asset: MediaAssetRow): MediaAssetRecord {
  return {
    id: asset.id,
    organizationId: asset.organizationId,
    propertyId: asset.propertyId,
    kind: asset.kind as MediaKind,
    status: asset.status as MediaStatus,
    declaredContentType: asset.declaredContentType,
    declaredFileName: asset.declaredFileName,
    declaredByteSize: asset.declaredByteSize,
    storageKey: asset.storageKey,
    format: (asset.format as MediaFormat | null) ?? null,
    byteSize: asset.byteSize,
    sha256: asset.sha256,
    width: asset.width,
    height: asset.height,
    processingNote: asset.processingNote,
    uploadedBy: asset.uploadedBy,
    intentExpiresAt: asset.intentExpiresAt,
    confirmedAt: asset.confirmedAt,
    orphanMarkedAt: asset.orphanMarkedAt,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    variants: [...asset.variants]
      .sort((a, b) => a.variant.localeCompare(b.variant))
      .map(toVariantRecord),
  };
}

const ASSET_INCLUDE = { variants: { orderBy: { variant: "asc" as const } } };

export class PrismaMediaRepository implements MediaRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createAsset(input: {
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
  }): Promise<MediaAssetRecord> {
    const asset = await this.prisma.mediaAsset.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        propertyId: input.propertyId,
        kind: input.kind,
        status: "PENDING",
        declaredContentType: input.declaredContentType,
        declaredFileName: input.declaredFileName,
        declaredByteSize: input.declaredByteSize,
        storageKey: input.storageKey,
        uploadedBy: input.uploadedBy,
        intentExpiresAt: input.intentExpiresAt,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      },
      include: ASSET_INCLUDE,
    });
    return toAssetRecord(asset);
  }

  async findAsset(
    organizationId: string,
    mediaId: string,
  ): Promise<MediaAssetRecord | null> {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { organizationId_id: { organizationId, id: mediaId } },
      include: ASSET_INCLUDE,
    });
    return asset ? toAssetRecord(asset) : null;
  }

  async listByProperty(
    organizationId: string,
    propertyId: string,
  ): Promise<readonly MediaAssetRecord[]> {
    const assets = await this.prisma.mediaAsset.findMany({
      where: { organizationId, propertyId },
      include: ASSET_INCLUDE,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return assets.map(toAssetRecord);
  }

  async findProperty(
    organizationId: string,
    propertyId: string,
  ): Promise<{ id: string; coverMediaId: string | null } | null> {
    const property = await this.prisma.property.findUnique({
      where: {
        organizationId_id: { organizationId, id: propertyId },
      },
      select: { id: true, coverMediaId: true },
    });
    return property;
  }

  async confirmAsset(input: ConfirmMediaInput): Promise<MediaAssetRecord> {
    return this.prisma.$transaction(async (tx) => {
      await tx.mediaVariant.deleteMany({
        where: {
          organizationId: input.organizationId,
          mediaAssetId: input.mediaId,
        },
      });
      if (input.variants.length > 0) {
        await tx.mediaVariant.createMany({
          data: input.variants.map((variant) => ({
            id: variant.id,
            organizationId: input.organizationId,
            mediaAssetId: input.mediaId,
            variant: variant.variant,
            storageKey: variant.storageKey,
            width: variant.width,
            height: variant.height,
            byteSize: variant.byteSize,
          })),
        });
      }
      const asset = await tx.mediaAsset.update({
        where: {
          organizationId_id: {
            organizationId: input.organizationId,
            id: input.mediaId,
          },
        },
        data: {
          status: input.status,
          format: input.format,
          byteSize: input.byteSize,
          sha256: input.sha256,
          width: input.width,
          height: input.height,
          processingNote: input.processingNote,
          confirmedAt: input.confirmedAt,
        },
        include: ASSET_INCLUDE,
      });
      return toAssetRecord(asset);
    });
  }

  async deleteAsset(organizationId: string, mediaId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.mediaVariant.deleteMany({
        where: { organizationId, mediaAssetId: mediaId },
      });
      await tx.mediaAsset.delete({
        where: { organizationId_id: { organizationId, id: mediaId } },
      });
    });
  }

  async setCover(input: {
    organizationId: string;
    propertyId: string;
    mediaId: string | null;
  }): Promise<void> {
    await this.prisma.property.update({
      where: {
        organizationId_id: {
          organizationId: input.organizationId,
          id: input.propertyId,
        },
      },
      data: { coverMediaId: input.mediaId },
    });
  }

  async clearCoverForMedia(
    organizationId: string,
    mediaId: string,
  ): Promise<void> {
    await this.prisma.property.updateMany({
      where: { organizationId, coverMediaId: mediaId },
      data: { coverMediaId: null },
    });
  }

  async markOrphanedUploads(input: {
    now: Date;
  }): Promise<
    readonly { id: string; organizationId: string; storageKey: string }[]
  > {
    const expired = await this.prisma.mediaAsset.findMany({
      where: {
        status: "PENDING",
        intentExpiresAt: { lt: input.now },
      },
      select: { id: true, organizationId: true, storageKey: true },
    });
    if (expired.length === 0) return [];
    await this.prisma.mediaAsset.updateMany({
      where: {
        status: "PENDING",
        intentExpiresAt: { lt: input.now },
      },
      data: { status: "ORPHAN", orphanMarkedAt: input.now },
    });
    return expired;
  }

  async listOrphanAssets(): Promise<readonly MediaAssetRecord[]> {
    const assets = await this.prisma.mediaAsset.findMany({
      where: { status: "ORPHAN" },
      include: ASSET_INCLUDE,
      orderBy: [{ orphanMarkedAt: "asc" }, { id: "asc" }],
    });
    return assets.map(toAssetRecord);
  }

  async deleteOrphanAssets(
    organizationIdsAndIds: readonly {
      organizationId: string;
      mediaId: string;
    }[],
  ): Promise<number> {
    let deleted = 0;
    for (const entry of organizationIdsAndIds) {
      const count = await this.prisma.mediaAsset.count({
        where: {
          organizationId: entry.organizationId,
          id: entry.mediaId,
          status: "ORPHAN",
        },
      });
      if (count !== 1) continue;
      await this.prisma.$transaction(async (tx) => {
        await tx.mediaVariant.deleteMany({
          where: {
            organizationId: entry.organizationId,
            mediaAssetId: entry.mediaId,
          },
        });
        await tx.mediaAsset.delete({
          where: {
            organizationId_id: {
              organizationId: entry.organizationId,
              id: entry.mediaId,
            },
          },
        });
      });
      deleted += 1;
    }
    return deleted;
  }
}
