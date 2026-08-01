import type {
  MembershipStatus,
  OrganizationRole,
} from "../domain/organization-access.js";

export type Organization = {
  id: string;
  name: string;
};

export type OrganizationMembershipRead = {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  status: MembershipStatus;
};

export type OrganizationMembership = OrganizationMembershipRead & {
  approvedByUserId?: string;
  approvedAt?: Date;
};

export type CreateOrganizationWithOwnerInput = {
  organizationId: string;
  name: string;
  ownerUserId: string;
};

export type CreateMembershipInput = {
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  status: MembershipStatus;
};

export type ApprovePendingBrokerMembershipInput = {
  organizationId: string;
  membershipId: string;
  approvedByUserId: string;
  approvedAt: Date;
};

export interface OrganizationRepository {
  createOrganizationWithOwner(input: CreateOrganizationWithOwnerInput): Promise<
    | {
        status: "created";
        organization: Organization;
        membership: OrganizationMembership;
      }
    | { status: "conflict" }
  >;
  findOrganization(organizationId: string): Promise<Organization | null>;
  findMembership(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMembershipRead | null>;
  listOrganizationMemberships(
    organizationId: string,
  ): Promise<OrganizationMembershipRead[]>;
  isUserVerified(userId: string): Promise<boolean>;
  createMembership(
    input: CreateMembershipInput,
  ): Promise<
    | { status: "created"; membership: OrganizationMembership }
    | { status: "conflict" }
  >;
  approvePendingBrokerMembership(
    input: ApprovePendingBrokerMembershipInput,
  ): Promise<
    | { status: "approved"; membership: OrganizationMembership }
    | { status: "not-found" }
    | { status: "conflict" }
  >;
}
