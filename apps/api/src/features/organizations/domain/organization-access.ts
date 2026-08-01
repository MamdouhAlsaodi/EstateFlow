export const OrganizationRole = {
  OWNER: "OWNER",
  MANAGER: "MANAGER",
  BROKER: "BROKER",
  CLIENT: "CLIENT",
} as const;

export type OrganizationRole =
  (typeof OrganizationRole)[keyof typeof OrganizationRole];

export const MembershipStatus = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  REVOKED: "REVOKED",
} as const;

export type MembershipStatus =
  (typeof MembershipStatus)[keyof typeof MembershipStatus];

export const PlatformRole = {
  NONE: "NONE",
  PLATFORM_ADMIN: "PLATFORM_ADMIN",
} as const;

export type PlatformRole = (typeof PlatformRole)[keyof typeof PlatformRole];

export const OrganizationPermission = {
  READ_ORGANIZATION: "READ_ORGANIZATION",
  MANAGE_MEMBERSHIPS: "MANAGE_MEMBERSHIPS",
} as const;

export type OrganizationPermission =
  (typeof OrganizationPermission)[keyof typeof OrganizationPermission];

export type OrganizationMembershipAccess = {
  role: OrganizationRole;
  status: MembershipStatus;
};

const permissionsByRole: Readonly<
  Record<OrganizationRole, readonly OrganizationPermission[]>
> = {
  OWNER: [
    OrganizationPermission.READ_ORGANIZATION,
    OrganizationPermission.MANAGE_MEMBERSHIPS,
  ],
  MANAGER: [
    OrganizationPermission.READ_ORGANIZATION,
    OrganizationPermission.MANAGE_MEMBERSHIPS,
  ],
  BROKER: [OrganizationPermission.READ_ORGANIZATION],
  CLIENT: [OrganizationPermission.READ_ORGANIZATION],
};

export function hasOrganizationPermission(
  membership: OrganizationMembershipAccess | null,
  permission: OrganizationPermission,
): boolean {
  if (membership?.status !== MembershipStatus.ACTIVE) return false;

  return permissionsByRole[membership.role].includes(permission);
}
