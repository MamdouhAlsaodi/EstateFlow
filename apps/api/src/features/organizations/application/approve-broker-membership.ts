import { PlatformRole } from "../domain/organization-access.js";
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

export type Clock = {
  now(): Date;
};

export type ApproveBrokerMembershipInput = {
  organizationId: string;
  membershipId: string;
};

export class ApproveBrokerMembership {
  constructor(
    private readonly repository: OrganizationRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    actor: OrganizationActor,
    input: ApproveBrokerMembershipInput,
  ): Promise<OrganizationMembership> {
    if (!actor.verified || actor.platformRole !== PlatformRole.PLATFORM_ADMIN) {
      throw new OrganizationForbiddenError();
    }

    const approval = await this.repository.approvePendingBrokerMembership({
      organizationId: input.organizationId,
      membershipId: input.membershipId,
      approvedByUserId: actor.userId,
      approvedAt: this.clock.now(),
    });
    if (approval.status === "not-found") throw new OrganizationNotFoundError();
    if (approval.status === "conflict") throw new OrganizationConflictError();

    return approval.membership;
  }
}
