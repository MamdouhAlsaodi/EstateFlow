import { Prisma, PrismaClient } from "@prisma/client";
import type {
  ApprovePendingBrokerMembershipInput,
  CreateMembershipInput,
  CreateOrganizationWithOwnerInput,
  OrganizationMembership,
  OrganizationMembershipRead,
  OrganizationRepository,
} from "../application/organization.repository.js";

const MEMBERSHIP_SELECTION = {
  id: true,
  organizationId: true,
  userId: true,
  role: true,
  status: true,
  approvedByUserId: true,
  approvedAt: true,
} satisfies Prisma.MembershipSelect;

const MEMBERSHIP_READ_SELECTION = {
  id: true,
  organizationId: true,
  userId: true,
  role: true,
  status: true,
} satisfies Prisma.MembershipSelect;

type MembershipRecord = Prisma.MembershipGetPayload<{
  select: typeof MEMBERSHIP_SELECTION;
}>;

type MembershipReadRecord = Prisma.MembershipGetPayload<{
  select: typeof MEMBERSHIP_READ_SELECTION;
}>;

function isExpectedUniqueConflict(error: unknown, targets: string[]): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }
  const target = error.meta?.target;
  return (
    (Array.isArray(target) &&
      target.length === targets.length &&
      targets.every((field) => target.includes(field))) ||
    (typeof target === "string" && targets.includes(target))
  );
}

function isOrganizationConflict(error: unknown): boolean {
  return isExpectedUniqueConflict(error, ["id"]);
}

function isMembershipConflict(error: unknown): boolean {
  return (
    isExpectedUniqueConflict(error, ["organizationId", "userId"]) ||
    isExpectedUniqueConflict(error, ["Membership_one_active_owner_idx"])
  );
}

function toMembership(record: MembershipRecord): OrganizationMembership {
  return {
    ...toMembershipRead(record),
    ...(record.approvedByUserId
      ? { approvedByUserId: record.approvedByUserId }
      : {}),
    ...(record.approvedAt ? { approvedAt: record.approvedAt } : {}),
  };
}

function toMembershipRead(
  record: MembershipReadRecord,
): OrganizationMembershipRead {
  return {
    id: record.id,
    organizationId: record.organizationId,
    userId: record.userId,
    role: record.role,
    status: record.status,
  };
}

export class PrismaOrganizationRepository implements OrganizationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async isUserVerified(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { verifiedAt: true },
    });
    return user?.verifiedAt != null;
  }

  async findOrganization(organizationId: string) {
    return this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true },
    });
  }

  async findMembership(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMembershipRead | null> {
    const membership = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: MEMBERSHIP_READ_SELECTION,
    });
    return membership ? toMembershipRead(membership) : null;
  }

  async listOrganizationMemberships(
    organizationId: string,
  ): Promise<OrganizationMembershipRead[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { organizationId },
      select: MEMBERSHIP_READ_SELECTION,
    });
    return memberships.map(toMembershipRead);
  }

  async createOrganizationWithOwner(input: CreateOrganizationWithOwnerInput) {
    try {
      const createdOrganization = await this.prisma.$transaction(
        async (transaction) => {
          const organization = await transaction.organization.create({
            data: { id: input.organizationId, name: input.name },
            select: { id: true, name: true },
          });
          const membership = await transaction.membership.create({
            data: {
              organizationId: organization.id,
              userId: input.ownerUserId,
              role: "OWNER",
              status: "ACTIVE",
            },
            select: MEMBERSHIP_SELECTION,
          });
          return { organization, membership: toMembership(membership) };
        },
      );
      return { status: "created" as const, ...createdOrganization };
    } catch (error) {
      if (isOrganizationConflict(error) || isMembershipConflict(error)) {
        return { status: "conflict" as const };
      }
      throw error;
    }
  }

  async createMembership(input: CreateMembershipInput) {
    try {
      const membership = await this.prisma.membership.create({
        data: input,
        select: MEMBERSHIP_SELECTION,
      });
      return {
        status: "created" as const,
        membership: toMembership(membership),
      };
    } catch (error) {
      if (isMembershipConflict(error)) return { status: "conflict" as const };
      throw error;
    }
  }

  async approvePendingBrokerMembership(
    input: ApprovePendingBrokerMembershipInput,
  ) {
    const approval = await this.prisma.membership.updateMany({
      where: {
        id: input.membershipId,
        organizationId: input.organizationId,
        role: "BROKER",
        status: "PENDING",
      },
      data: {
        status: "ACTIVE",
        approvedByUserId: input.approvedByUserId,
        approvedAt: input.approvedAt,
      },
    });
    if (approval.count === 1) {
      const membership = await this.prisma.membership.findUniqueOrThrow({
        where: { id: input.membershipId },
        select: MEMBERSHIP_SELECTION,
      });
      return {
        status: "approved" as const,
        membership: toMembership(membership),
      };
    }

    const membership = await this.prisma.membership.findUnique({
      where: { id: input.membershipId },
      select: { organizationId: true },
    });
    return membership?.organizationId === input.organizationId
      ? { status: "conflict" as const }
      : { status: "not-found" as const };
  }
}
