import {
  OrganizationPermission,
  hasOrganizationPermission,
} from "../domain/organization-access.js";
import {
  OrganizationForbiddenError,
  OrganizationNotFoundError,
} from "../domain/organization-errors.js";
import type { OrganizationActor } from "./create-organization.js";
import type {
  OrganizationMembershipRead,
  OrganizationRepository,
} from "./organization.repository.js";

export type ListOrganizationMembershipsInput = {
  organizationId: string;
};

export class ListOrganizationMemberships {
  constructor(private readonly repository: OrganizationRepository) {}

  async execute(
    actor: OrganizationActor,
    input: ListOrganizationMembershipsInput,
  ): Promise<OrganizationMembershipRead[]> {
    if (!actor.verified) throw new OrganizationForbiddenError();

    const membership = await this.repository.findMembership(
      input.organizationId,
      actor.userId,
    );
    if (!membership) throw new OrganizationNotFoundError();
    if (
      !hasOrganizationPermission(
        membership,
        OrganizationPermission.MANAGE_MEMBERSHIPS,
      )
    ) {
      throw new OrganizationForbiddenError();
    }

    return this.repository.listOrganizationMemberships(input.organizationId);
  }
}
