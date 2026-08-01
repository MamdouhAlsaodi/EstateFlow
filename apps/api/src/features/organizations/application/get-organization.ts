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
  Organization,
  OrganizationRepository,
} from "./organization.repository.js";

export type GetOrganizationInput = {
  organizationId: string;
};

export class GetOrganization {
  constructor(private readonly repository: OrganizationRepository) {}

  async execute(
    actor: OrganizationActor,
    input: GetOrganizationInput,
  ): Promise<Organization> {
    if (!actor.verified) throw new OrganizationForbiddenError();

    const membership = await this.repository.findMembership(
      input.organizationId,
      actor.userId,
    );
    if (!membership) throw new OrganizationNotFoundError();
    if (
      !hasOrganizationPermission(
        membership,
        OrganizationPermission.READ_ORGANIZATION,
      )
    ) {
      throw new OrganizationForbiddenError();
    }

    const organization = await this.repository.findOrganization(
      input.organizationId,
    );
    if (!organization) throw new OrganizationNotFoundError();

    return organization;
  }
}
