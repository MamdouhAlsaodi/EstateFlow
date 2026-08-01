import assert from "node:assert/strict";
import test from "node:test";
import {
  OrganizationForbiddenError,
  OrganizationNotFoundError,
  OrganizationConflictError,
} from "../dist/features/organizations/domain/organization-errors.js";
import {
  hasOrganizationPermission,
  OrganizationPermission,
} from "../dist/features/organizations/domain/organization-access.js";
import { CreateOrganization } from "../dist/features/organizations/application/create-organization.js";
import { CreateMembership } from "../dist/features/organizations/application/create-membership.js";
import { ApproveBrokerMembership } from "../dist/features/organizations/application/approve-broker-membership.js";
import { GetOrganization } from "../dist/features/organizations/application/get-organization.js";
import { GetMyMembership } from "../dist/features/organizations/application/get-my-membership.js";
import { ListOrganizationMemberships } from "../dist/features/organizations/application/list-organization-memberships.js";

const NOW = new Date("2026-08-01T12:00:00.000Z");
const verified = (userId, platformRole = "NONE") => ({
  userId,
  verified: true,
  platformRole,
});
const unverified = (userId) => ({
  userId,
  verified: false,
  platformRole: "NONE",
});

class FakeOrganizationRepository {
  constructor() {
    this.memberships = new Map();
    this.organizations = new Map();
    this.verifiedUserIds = new Set();
    this.createOrganizationCalls = [];
    this.createMembershipCalls = [];
    this.approveBrokerMembershipCalls = [];
    this.organizationResult = "created";
    this.membershipResult = "created";
    this.approvalResult = "approved";
  }

  membershipKey(organizationId, userId) {
    return `${organizationId}:${userId}`;
  }

  setMembership(membership) {
    this.memberships.set(
      this.membershipKey(membership.organizationId, membership.userId),
      membership,
    );
  }

  setOrganization(organization) {
    this.organizations.set(organization.id, organization);
  }

  setVerifiedUser(userId) {
    this.verifiedUserIds.add(userId);
  }

  async isUserVerified(userId) {
    return this.verifiedUserIds.has(userId);
  }

  async createOrganizationWithOwner(input) {
    this.createOrganizationCalls.push(input);
    if (this.organizationResult === "conflict") return { status: "conflict" };
    return {
      status: "created",
      organization: { id: input.organizationId, name: input.name },
      membership: {
        id: "membership-owner",
        organizationId: input.organizationId,
        userId: input.ownerUserId,
        role: "OWNER",
        status: "ACTIVE",
      },
    };
  }

  async findOrganization(organizationId) {
    return this.organizations.get(organizationId) ?? null;
  }

  async findMembership(organizationId, userId) {
    return (
      this.memberships.get(this.membershipKey(organizationId, userId)) ?? null
    );
  }

  async listOrganizationMemberships(organizationId) {
    return [...this.memberships.values()].filter(
      (membership) => membership.organizationId === organizationId,
    );
  }

  async createMembership(input) {
    this.createMembershipCalls.push(input);
    if (this.membershipResult === "conflict") return { status: "conflict" };
    return {
      status: "created",
      membership: { id: "membership-created", ...input },
    };
  }

  async approvePendingBrokerMembership(input) {
    this.approveBrokerMembershipCalls.push(input);
    if (this.approvalResult !== "approved")
      return { status: this.approvalResult };
    return {
      status: "approved",
      membership: {
        id: input.membershipId,
        organizationId: input.organizationId,
        userId: "broker-user",
        role: "BROKER",
        status: "ACTIVE",
        approvedByUserId: input.approvedByUserId,
        approvedAt: input.approvedAt,
      },
    };
  }
}

function subject() {
  const repository = new FakeOrganizationRepository();
  return {
    repository,
    createOrganization: new CreateOrganization(repository),
    createMembership: new CreateMembership(repository),
    approveBrokerMembership: new ApproveBrokerMembership(repository, {
      now: () => NOW,
    }),
    getOrganization: new GetOrganization(repository),
    getMyMembership: new GetMyMembership(repository),
    listOrganizationMemberships: new ListOrganizationMemberships(repository),
  };
}

async function assertForbidden(action) {
  await assert.rejects(action, OrganizationForbiddenError);
}

test("organization permissions are deny-by-default, require an active membership, and exclude platform role", () => {
  assert.equal(
    hasOrganizationPermission(
      { role: "OWNER", status: "ACTIVE" },
      OrganizationPermission.MANAGE_MEMBERSHIPS,
    ),
    true,
  );
  assert.equal(
    hasOrganizationPermission(
      { role: "MANAGER", status: "ACTIVE" },
      OrganizationPermission.MANAGE_MEMBERSHIPS,
    ),
    true,
  );
  for (const membership of [
    { role: "CLIENT", status: "ACTIVE" },
    { role: "BROKER", status: "ACTIVE" },
    { role: "OWNER", status: "PENDING" },
    { role: "MANAGER", status: "SUSPENDED" },
    { role: "MANAGER", status: "REVOKED" },
    null,
  ]) {
    assert.equal(
      hasOrganizationPermission(
        membership,
        OrganizationPermission.MANAGE_MEMBERSHIPS,
      ),
      false,
    );
  }
});

test("CreateOrganization uses one atomic owner operation and rejects unverified and conflicting requests", async () => {
  const { repository, createOrganization } = subject();

  await assertForbidden(() =>
    createOrganization.execute(unverified("user-1"), {
      organizationId: "org-1",
      name: "EstateFlow Realty",
    }),
  );
  assert.deepEqual(repository.createOrganizationCalls, []);

  const created = await createOrganization.execute(verified("user-1"), {
    organizationId: "org-1",
    name: "EstateFlow Realty",
  });
  assert.equal(created.membership.role, "OWNER");
  assert.equal(created.membership.status, "ACTIVE");
  assert.deepEqual(repository.createOrganizationCalls, [
    {
      organizationId: "org-1",
      name: "EstateFlow Realty",
      ownerUserId: "user-1",
    },
  ]);

  repository.organizationResult = "conflict";
  await assert.rejects(
    () =>
      createOrganization.execute(verified("user-2"), {
        organizationId: "org-1",
        name: "Duplicate",
      }),
    OrganizationConflictError,
  );
});

test("CreateMembership permits only verified active Owner or Manager to create active Client or pending Broker in their organization", async () => {
  const { repository, createMembership } = subject();
  repository.setMembership({
    id: "owner-membership",
    organizationId: "org-1",
    userId: "owner-1",
    role: "OWNER",
    status: "ACTIVE",
  });
  repository.setMembership({
    id: "manager-membership",
    organizationId: "org-1",
    userId: "manager-1",
    role: "MANAGER",
    status: "ACTIVE",
  });
  repository.setVerifiedUser("client-1");
  repository.setVerifiedUser("broker-1");

  const client = await createMembership.execute(verified("owner-1"), {
    organizationId: "org-1",
    userId: "client-1",
    role: "CLIENT",
  });
  const broker = await createMembership.execute(verified("manager-1"), {
    organizationId: "org-1",
    userId: "broker-1",
    role: "BROKER",
  });

  assert.equal(client.status, "ACTIVE");
  assert.equal(broker.status, "PENDING");
  assert.deepEqual(repository.createMembershipCalls, [
    {
      organizationId: "org-1",
      userId: "client-1",
      role: "CLIENT",
      status: "ACTIVE",
    },
    {
      organizationId: "org-1",
      userId: "broker-1",
      role: "BROKER",
      status: "PENDING",
    },
  ]);
});

test("CreateMembership rejects an unverified target and does not persist a membership", async () => {
  const { repository, createMembership } = subject();
  repository.setMembership({
    id: "owner-membership",
    organizationId: "org-1",
    userId: "owner-1",
    role: "OWNER",
    status: "ACTIVE",
  });

  await assertForbidden(() =>
    createMembership.execute(verified("owner-1"), {
      organizationId: "org-1",
      userId: "unverified-target",
      role: "CLIENT",
    }),
  );

  assert.deepEqual(repository.createMembershipCalls, []);
});

test("CreateMembership rejects unverified, absent, inactive, and non-managing callers and never permits Owner or Manager targets", async () => {
  const { repository, createMembership } = subject();
  const input = { organizationId: "org-1", userId: "target-1", role: "CLIENT" };
  repository.setMembership({
    id: "client-membership",
    organizationId: "org-1",
    userId: "client-actor",
    role: "CLIENT",
    status: "ACTIVE",
  });
  repository.setMembership({
    id: "broker-membership",
    organizationId: "org-1",
    userId: "broker-actor",
    role: "BROKER",
    status: "ACTIVE",
  });
  repository.setMembership({
    id: "inactive-membership",
    organizationId: "org-1",
    userId: "inactive-actor",
    role: "MANAGER",
    status: "SUSPENDED",
  });

  await assertForbidden(() =>
    createMembership.execute(unverified("owner-1"), input),
  );
  await assert.rejects(
    () => createMembership.execute(verified("absent-actor"), input),
    OrganizationNotFoundError,
  );
  for (const actorId of ["client-actor", "broker-actor", "inactive-actor"]) {
    await assertForbidden(() =>
      createMembership.execute(verified(actorId), input),
    );
  }
  repository.setMembership({
    id: "owner-membership",
    organizationId: "org-1",
    userId: "owner-actor",
    role: "OWNER",
    status: "ACTIVE",
  });
  for (const role of ["OWNER", "MANAGER"]) {
    await assertForbidden(() =>
      createMembership.execute(verified("owner-actor"), { ...input, role }),
    );
  }
  assert.deepEqual(repository.createMembershipCalls, []);
});

test("CreateMembership maps repository conflicts to a typed conflict without persistence detail", async () => {
  const { repository, createMembership } = subject();
  repository.setMembership({
    id: "owner-membership",
    organizationId: "org-1",
    userId: "owner-1",
    role: "OWNER",
    status: "ACTIVE",
  });
  repository.setVerifiedUser("client-1");
  repository.membershipResult = "conflict";

  await assert.rejects(
    () =>
      createMembership.execute(verified("owner-1"), {
        organizationId: "org-1",
        userId: "client-1",
        role: "CLIENT",
      }),
    OrganizationConflictError,
  );
});

test("GetOrganization returns the minimal summary only to an active member with read permission", async () => {
  const { repository, getOrganization } = subject();
  repository.setOrganization({ id: "org-1", name: "EstateFlow Realty" });
  repository.setMembership({
    id: "broker-membership",
    organizationId: "org-1",
    userId: "broker-1",
    role: "BROKER",
    status: "ACTIVE",
  });

  const organization = await getOrganization.execute(verified("broker-1"), {
    organizationId: "org-1",
  });

  assert.deepEqual(organization, { id: "org-1", name: "EstateFlow Realty" });
});

test("GetOrganization hides absent organizations and non-members while rejecting a pending member", async () => {
  const { repository, getOrganization } = subject();
  repository.setOrganization({ id: "org-1", name: "EstateFlow Realty" });
  repository.setMembership({
    id: "pending-broker-membership",
    organizationId: "org-1",
    userId: "pending-broker-1",
    role: "BROKER",
    status: "PENDING",
  });

  await assert.rejects(
    () =>
      getOrganization.execute(verified("missing-member-1"), {
        organizationId: "org-1",
      }),
    OrganizationNotFoundError,
  );
  await assert.rejects(
    () =>
      getOrganization.execute(verified("missing-member-1"), {
        organizationId: "missing-org-1",
      }),
    OrganizationNotFoundError,
  );
  await assertForbidden(() =>
    getOrganization.execute(verified("pending-broker-1"), {
      organizationId: "org-1",
    }),
  );
});

test("GetMyMembership returns a pending actor membership without organization data and hides absence", async () => {
  const { repository, getMyMembership } = subject();
  repository.setMembership({
    id: "pending-broker-membership",
    organizationId: "org-1",
    userId: "pending-broker-1",
    role: "BROKER",
    status: "PENDING",
  });

  const membership = await getMyMembership.execute(
    verified("pending-broker-1"),
    {
      organizationId: "org-1",
    },
  );

  assert.deepEqual(membership, {
    id: "pending-broker-membership",
    organizationId: "org-1",
    userId: "pending-broker-1",
    role: "BROKER",
    status: "PENDING",
  });
  await assert.rejects(
    () =>
      getMyMembership.execute(verified("missing-member-1"), {
        organizationId: "org-1",
      }),
    OrganizationNotFoundError,
  );
});

test("ListOrganizationMemberships permits only active Owner or Manager and returns minimal records", async () => {
  const { repository, listOrganizationMemberships } = subject();
  repository.setMembership({
    id: "manager-membership",
    organizationId: "org-1",
    userId: "manager-1",
    role: "MANAGER",
    status: "ACTIVE",
  });
  repository.setMembership({
    id: "pending-broker-membership",
    organizationId: "org-1",
    userId: "broker-1",
    role: "BROKER",
    status: "PENDING",
  });

  const memberships = await listOrganizationMemberships.execute(
    verified("manager-1"),
    { organizationId: "org-1" },
  );

  assert.deepEqual(memberships, [
    {
      id: "manager-membership",
      organizationId: "org-1",
      userId: "manager-1",
      role: "MANAGER",
      status: "ACTIVE",
    },
    {
      id: "pending-broker-membership",
      organizationId: "org-1",
      userId: "broker-1",
      role: "BROKER",
      status: "PENDING",
    },
  ]);
});

test("ListOrganizationMemberships hides non-members and rejects active Broker and Client actors", async () => {
  const { repository, listOrganizationMemberships } = subject();
  for (const [role, userId] of [
    ["BROKER", "broker-1"],
    ["CLIENT", "client-1"],
  ]) {
    repository.setMembership({
      id: `${role.toLowerCase()}-membership`,
      organizationId: "org-1",
      userId,
      role,
      status: "ACTIVE",
    });
    await assertForbidden(() =>
      listOrganizationMemberships.execute(verified(userId), {
        organizationId: "org-1",
      }),
    );
  }
  await assert.rejects(
    () =>
      listOrganizationMemberships.execute(verified("missing-member-1"), {
        organizationId: "org-1",
      }),
    OrganizationNotFoundError,
  );
});

test("ApproveBrokerMembership is limited to verified PlatformAdmin and atomically records approver and time", async () => {
  const { repository, approveBrokerMembership } = subject();
  const input = { organizationId: "org-1", membershipId: "membership-broker" };

  await assertForbidden(() =>
    approveBrokerMembership.execute(verified("user-1"), input),
  );
  await assertForbidden(() =>
    approveBrokerMembership.execute(
      unverified("admin-1", "PLATFORM_ADMIN"),
      input,
    ),
  );

  const approved = await approveBrokerMembership.execute(
    verified("admin-1", "PLATFORM_ADMIN"),
    input,
  );
  assert.equal(approved.status, "ACTIVE");
  assert.deepEqual(repository.approveBrokerMembershipCalls, [
    {
      organizationId: "org-1",
      membershipId: "membership-broker",
      approvedByUserId: "admin-1",
      approvedAt: NOW,
    },
  ]);

  for (const result of ["not-found", "conflict"]) {
    repository.approvalResult = result;
    await assert.rejects(
      () =>
        approveBrokerMembership.execute(
          verified("admin-1", "PLATFORM_ADMIN"),
          input,
        ),
      result === "not-found"
        ? OrganizationNotFoundError
        : OrganizationConflictError,
    );
  }
});
