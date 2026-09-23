import type { PrismaClient } from "@prisma/client";
import {
  projectPropertyForContent,
  type PropertyContentProjection,
} from "../../properties/domain/content-projection.js";
import type {
  PropertyProjectionReader,
  PropertyProjectionOutcome,
} from "../application/generation-application.js";

/**
 * EF-403 — allowlist-enforcing property projection reader. The SELECT itself
 * names exactly the allowlisted columns plus `status` (used only to report an
 * archived property); owner personal data (`ownerReference`), internal ids,
 * and timestamps are never fetched, so they are structurally unreachable for
 * generation. A foreign property id yields not-found (tenant-safe 404).
 */
export class PrismaPropertyProjectionReader implements PropertyProjectionReader {
  constructor(private readonly prisma: PrismaClient) {}

  async findContentProjection(
    organizationId: string,
    propertyId: string,
  ): Promise<PropertyProjectionOutcome> {
    const row = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        title: true,
        propertyType: true,
        addressText: true,
        version: true,
        status: true,
        organizationId: true,
      },
    });
    if (!row || row.organizationId !== organizationId)
      return { kind: "not-found" };
    if (row.status !== "ACTIVE") return { kind: "archived" };
    const projection: PropertyContentProjection = projectPropertyForContent({
      id: row.id,
      title: row.title,
      propertyType: row.propertyType,
      addressText: row.addressText,
      status: row.status as "ACTIVE",
      version: row.version,
    });
    return { kind: "found", projection };
  }
}
