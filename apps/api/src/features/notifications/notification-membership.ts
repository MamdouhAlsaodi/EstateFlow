export type NotificationMembership = Readonly<{
  organizationId: string;
  role: "OWNER" | "MANAGER" | "BROKER" | "CLIENT";
  status: "ACTIVE" | "PENDING" | "SUSPENDED" | "REVOKED";
}>;

export interface NotificationMembershipReader {
  findMembership(
    organizationId: string,
    userId: string,
  ): Promise<NotificationMembership | null>;
}
