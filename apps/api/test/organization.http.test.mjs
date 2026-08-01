import assert from "node:assert/strict";
import test from "node:test";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  RequestMethod,
} from "@nestjs/common";
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants.js";
import {
  OrganizationConflictError,
  OrganizationForbiddenError,
  OrganizationNotFoundError,
} from "../dist/features/organizations/domain/organization-errors.js";
import { OrganizationController } from "../dist/features/organizations/http/organization.controller.js";
import { BrowserSessionGuard } from "../dist/features/auth/http/browser-session.guard.js";
import { CsrfGuard } from "../dist/features/auth/http/csrf.guard.js";
import { RequireCanonicalOriginGuard } from "../dist/features/auth/http/origin.guard.js";

const actor = (platformRole = "NONE") => ({
  userId: "user-1",
  familyId: "family-1",
  accessSessionId: "access-1",
  verified: true,
  platformRole,
  csrfHash: "csrf-hash",
});

function controller(commands = {}) {
  return new OrganizationController(
    commands.createOrganization ?? { execute: async () => ({}) },
    commands.getOrganization ?? { execute: async () => ({}) },
    commands.listMemberships ?? { execute: async () => [] },
    commands.getMyMembership ?? { execute: async () => ({}) },
    commands.createMembership ?? { execute: async () => ({}) },
    commands.approveBrokerMembership ?? { execute: async () => ({}) },
  );
}

test("organization controller exposes exactly the approved six routes", () => {
  assert.equal(Reflect.getMetadata(PATH_METADATA, OrganizationController), "/");
  assert.deepEqual(
    [
      ["createOrganization", "/organizations"],
      ["getOrganization", "/organizations/:organizationId"],
      ["listMemberships", "/organizations/:organizationId/memberships"],
      ["getMyMembership", "/organizations/:organizationId/memberships/me"],
      ["createMembership", "/organizations/:organizationId/memberships"],
      [
        "approveBrokerMembership",
        "/platform/broker-memberships/:membershipId/approve",
      ],
    ].map(([method, path]) => [
      Reflect.getMetadata(
        PATH_METADATA,
        OrganizationController.prototype[method],
      ),
      Reflect.getMetadata(
        METHOD_METADATA,
        OrganizationController.prototype[method],
      ),
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        OrganizationController.prototype[method],
      ),
      path,
    ]),
    [
      ["organizations", RequestMethod.POST, 201, "/organizations"],
      [
        "organizations/:organizationId",
        RequestMethod.GET,
        undefined,
        "/organizations/:organizationId",
      ],
      [
        "organizations/:organizationId/memberships",
        RequestMethod.GET,
        undefined,
        "/organizations/:organizationId/memberships",
      ],
      [
        "organizations/:organizationId/memberships/me",
        RequestMethod.GET,
        undefined,
        "/organizations/:organizationId/memberships/me",
      ],
      [
        "organizations/:organizationId/memberships",
        RequestMethod.POST,
        201,
        "/organizations/:organizationId/memberships",
      ],
      [
        "platform/broker-memberships/:membershipId/approve",
        RequestMethod.POST,
        201,
        "/platform/broker-memberships/:membershipId/approve",
      ],
    ],
  );
});

test("organization routes preserve browser boundary guard order", () => {
  const unsafeGuards = [
    RequireCanonicalOriginGuard,
    BrowserSessionGuard,
    CsrfGuard,
  ];
  assert.deepEqual(
    Reflect.getMetadata(
      GUARDS_METADATA,
      OrganizationController.prototype.createOrganization,
    ),
    unsafeGuards,
  );
  assert.deepEqual(
    Reflect.getMetadata(
      GUARDS_METADATA,
      OrganizationController.prototype.createMembership,
    ),
    unsafeGuards,
  );
  assert.deepEqual(
    Reflect.getMetadata(
      GUARDS_METADATA,
      OrganizationController.prototype.approveBrokerMembership,
    ),
    unsafeGuards,
  );
  for (const method of [
    "getOrganization",
    "listMemberships",
    "getMyMembership",
  ]) {
    assert.deepEqual(
      Reflect.getMetadata(
        GUARDS_METADATA,
        OrganizationController.prototype[method],
      ),
      [BrowserSessionGuard],
    );
  }
});

test("organization controller passes only the authenticated principal and route input to use cases", async () => {
  const calls = [];
  const organizationController = controller({
    createOrganization: {
      execute: async (requestActor, input) => {
        calls.push(["create-organization", requestActor, input]);
        return { id: input.organizationId, name: input.name };
      },
    },
    getOrganization: {
      execute: async (requestActor, input) => {
        calls.push(["get-organization", requestActor, input]);
        return { id: input.organizationId, name: "EstateFlow Realty" };
      },
    },
    listMemberships: {
      execute: async (requestActor, input) => {
        calls.push(["list-memberships", requestActor, input]);
        return [];
      },
    },
    getMyMembership: {
      execute: async (requestActor, input) => {
        calls.push(["get-my-membership", requestActor, input]);
        return { id: "membership-1" };
      },
    },
    createMembership: {
      execute: async (requestActor, input) => {
        calls.push(["create-membership", requestActor, input]);
        return { id: "membership-2", ...input };
      },
    },
    approveBrokerMembership: {
      execute: async (requestActor, input) => {
        calls.push(["approve-broker-membership", requestActor, input]);
        return { id: input.membershipId, ...input };
      },
    },
  });
  const request = { auth: actor("PLATFORM_ADMIN") };

  await organizationController.createOrganization(
    { organizationId: "org-1", name: "EstateFlow Realty" },
    request,
  );
  await organizationController.getOrganization("org-1", request);
  await organizationController.listMemberships("org-1", request);
  await organizationController.getMyMembership("org-1", request);
  await organizationController.createMembership(
    "org-1",
    { userId: "user-2", role: "BROKER" },
    request,
  );
  await organizationController.approveBrokerMembership(
    "membership-2",
    { organizationId: "org-1" },
    request,
  );

  assert.deepEqual(calls, [
    [
      "create-organization",
      request.auth,
      { organizationId: "org-1", name: "EstateFlow Realty" },
    ],
    ["get-organization", request.auth, { organizationId: "org-1" }],
    ["list-memberships", request.auth, { organizationId: "org-1" }],
    ["get-my-membership", request.auth, { organizationId: "org-1" }],
    [
      "create-membership",
      request.auth,
      { organizationId: "org-1", userId: "user-2", role: "BROKER" },
    ],
    [
      "approve-broker-membership",
      request.auth,
      { organizationId: "org-1", membershipId: "membership-2" },
    ],
  ]);
});

test("organization controller maps typed policy errors without invoking another side effect", async () => {
  for (const [error, exception] of [
    [new OrganizationForbiddenError(), ForbiddenException],
    [new OrganizationNotFoundError(), NotFoundException],
    [new OrganizationConflictError(), ConflictException],
  ]) {
    let calls = 0;
    await assert.rejects(
      controller({
        createOrganization: {
          execute: async () => {
            calls += 1;
            throw error;
          },
        },
      }).createOrganization(
        { organizationId: "org-1", name: "EstateFlow Realty" },
        { auth: actor() },
      ),
      exception,
    );
    assert.equal(calls, 1);
  }
});

test("broker approval passes the persisted platform admin principal to the policy use case", async () => {
  let receivedActor;
  const membership = await controller({
    approveBrokerMembership: {
      execute: async (requestActor, input) => {
        receivedActor = requestActor;
        assert.deepEqual(input, {
          organizationId: "org-1",
          membershipId: "membership-1",
        });
        return { id: "membership-1", status: "ACTIVE" };
      },
    },
  }).approveBrokerMembership(
    "membership-1",
    { organizationId: "org-1" },
    { auth: actor("PLATFORM_ADMIN") },
  );

  assert.equal(receivedActor.platformRole, "PLATFORM_ADMIN");
  assert.deepEqual(membership, { id: "membership-1", status: "ACTIVE" });
});
