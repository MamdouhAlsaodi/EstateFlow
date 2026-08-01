import {
  MembershipStatus,
  OrganizationPermission,
  OrganizationRole,
  hasOrganizationPermission,
} from "../domain/organization-access.js";
import {
  OrganizationConflictError,
  OrganizationForbiddenError,
  OrganizationNotFoundError,
} from "../domain/organization-errors.js";
import type { OrganizationActor } from "./create-organization.js";
import type {
  OrganizationMembership,
  OrganizationRepository,
} from "./organization.repository.js";

export type CreateMembershipInput = {
  organizationId: string;
  userId: string;
  role: typeof OrganizationRole.CLIENT | typeof OrganizationRole.BROKER;
};

export class CreateMembership {
  constructor(private readonly repository: OrganizationRepository) {}

  async execute(
    actor: OrganizationActor,
    input: CreateMembershipInput,
  ): Promise<OrganizationMembership> {
    if (!actor.verified) throw new OrganizationForbiddenError();
    if (
      input.role !== OrganizationRole.CLIENT &&
      input.role !== OrganizationRole.BROKER
    ) {
      throw new OrganizationForbiddenError();
    }

    const actorMembership = await this.repository.findMembership(
      input.organizationId,
      actor.userId,
    );
    if (!actorMembership) throw new OrganizationNotFoundError();
    if (
      !hasOrganizationPermission(
        actorMembership,
        OrganizationPermission.MANAGE_MEMBERSHIPS,
      )
    ) {
      throw new OrganizationForbiddenError();
    }
    if (!(await this.repository.isUserVerified(input.userId))) {
      throw new OrganizationForbiddenError();
    }

    const status =
      input.role === OrganizationRole.CLIENT
        ? MembershipStatus.ACTIVE
        : MembershipStatus.PENDING;
    const creation = await this.repository.createMembership({
      organizationId: input.organizationId,
      userId: input.userId,
      role: input.role,
      status,
    });
    if (creation.status === "conflict") throw new OrganizationConflictError();

    return creation.membership;
  }
}
