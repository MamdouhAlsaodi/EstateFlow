import {
  OrganizationForbiddenError,
  OrganizationConflictError,
} from "../domain/organization-errors.js";
import type {
  Organization,
  OrganizationMembership,
  OrganizationRepository,
} from "./organization.repository.js";

export type OrganizationActor = {
  userId: string;
  verified: boolean;
  platformRole: "NONE" | "PLATFORM_ADMIN";
};

export type CreateOrganizationInput = {
  organizationId: string;
  name: string;
};

export type CreateOrganizationResult = {
  organization: Organization;
  membership: OrganizationMembership;
};

export class CreateOrganization {
  constructor(private readonly repository: OrganizationRepository) {}

  async execute(
    actor: OrganizationActor,
    input: CreateOrganizationInput,
  ): Promise<CreateOrganizationResult> {
    if (!actor.verified) throw new OrganizationForbiddenError();

    const creation = await this.repository.createOrganizationWithOwner({
      organizationId: input.organizationId,
      name: input.name,
      ownerUserId: actor.userId,
    });
    if (creation.status === "conflict") throw new OrganizationConflictError();

    return creation;
  }
}
