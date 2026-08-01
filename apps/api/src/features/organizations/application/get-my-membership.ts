import {
  OrganizationForbiddenError,
  OrganizationNotFoundError,
} from "../domain/organization-errors.js";
import type { OrganizationActor } from "./create-organization.js";
import type {
  OrganizationMembershipRead,
  OrganizationRepository,
} from "./organization.repository.js";

export type GetMyMembershipInput = {
  organizationId: string;
};

export class GetMyMembership {
  constructor(private readonly repository: OrganizationRepository) {}

  async execute(
    actor: OrganizationActor,
    input: GetMyMembershipInput,
  ): Promise<OrganizationMembershipRead> {
    if (!actor.verified) throw new OrganizationForbiddenError();

    const membership = await this.repository.findMembership(
      input.organizationId,
      actor.userId,
    );
    if (!membership) throw new OrganizationNotFoundError();

    return membership;
  }
}
