/**
 * EF-610 — Prisma deal snapshot reader. Assembles the frozen generation
 * inputs for one deal: the deal row, its property, the organization name, the
 * deal broker's active membership, and the deterministic organization
 * principal (first ACTIVE OWNER by createdAt, then userId). Everything is
 * organization-scoped; cross-tenant reads are structurally impossible through
 * the composite (organizationId, id) uniques.
 */

import type { PrismaClient } from "@prisma/client";
import type {
  DealSnapshotOutcome,
  DealSnapshotReader,
} from "../application/contract-repository.js";
import type {
  ContractSignerRole,
  DealSnapshotInputs,
} from "../domain/contract-snapshot.js";

export class PrismaDealSnapshotReader implements DealSnapshotReader {
  constructor(private readonly prisma: PrismaClient) {}

  async findDealSnapshot(
    organizationId: string,
    dealId: string,
    now?: Date,
  ): Promise<DealSnapshotOutcome> {
    const deal = await this.prisma.deal.findFirst({
      where: { organizationId, id: dealId },
      select: {
        id: true,
        organizationId: true,
        leadId: true,
        propertyId: true,
        brokerId: true,
        status: true,
        version: true,
        createdAt: true,
        property: {
          select: {
            id: true,
            title: true,
            propertyType: true,
            addressText: true,
            version: true,
          },
        },
        organization: { select: { name: true } },
      },
    });
    if (!deal) return { kind: "not-found" };

    const [broker, principal] = await Promise.all([
      this.prisma.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId,
            userId: deal.brokerId,
          },
        },
        select: {
          userId: true,
          role: true,
          status: true,
          user: { select: { accountIdentifier: true } },
        },
      }),
      this.prisma.membership.findFirst({
        where: { organizationId, role: "OWNER", status: "ACTIVE" },
        orderBy: [{ createdAt: "asc" }, { userId: "asc" }],
        select: {
          userId: true,
          role: true,
          status: true,
          user: { select: { accountIdentifier: true } },
        },
      }),
    ]);
    if (!broker || broker.status !== "ACTIVE")
      return { kind: "conflict", reason: "broker-inactive" };
    if (!principal) return { kind: "conflict", reason: "broker-inactive" };

    const inputs: DealSnapshotInputs = {
      now: now ?? new Date(),
      deal: {
        id: deal.id,
        organizationId: deal.organizationId,
        leadId: deal.leadId,
        propertyId: deal.propertyId,
        status: deal.status,
        version: deal.version,
        createdAt: deal.createdAt,
      },
      property: {
        id: deal.property.id,
        title: deal.property.title,
        propertyType: deal.property.propertyType,
        addressText: deal.property.addressText,
        version: deal.property.version,
      },
      organizationName: deal.organization.name,
      broker: {
        userId: broker.userId,
        role: broker.role as ContractSignerRole,
        reference: broker.user.accountIdentifier,
      },
      principal: {
        userId: principal.userId,
        role: principal.role as ContractSignerRole,
        reference: principal.user.accountIdentifier,
      },
    };
    return { kind: "found", inputs };
  }
}
