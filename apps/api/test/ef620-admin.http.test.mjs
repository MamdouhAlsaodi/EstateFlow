import assert from "node:assert/strict";
import test from "node:test";
import {
  ForbiddenException,
  ParseUUIDPipe,
  RequestMethod,
} from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from "@nestjs/common/constants.js";
import { AppModule } from "../dist/app.module.js";
import { BrowserSessionGuard } from "../dist/features/auth/http/browser-session.guard.js";
import { CsrfGuard } from "../dist/features/auth/http/csrf.guard.js";
import { RequireCanonicalOriginGuard } from "../dist/features/auth/http/origin.guard.js";
import { AdminModule } from "../dist/features/admin/admin.module.js";
import { AdminController } from "../dist/features/admin/http/admin.controller.js";
import { PlatformAdminGuard } from "../dist/features/admin/http/platform-admin.guard.js";

const readGuards = [BrowserSessionGuard, PlatformAdminGuard];
const unsafeGuards = [
  RequireCanonicalOriginGuard,
  BrowserSessionGuard,
  CsrfGuard,
  PlatformAdminGuard,
];
const orgId = "22222222-2222-4222-8222-222222222222";
const membershipId = "33333333-3333-4333-8333-333333333333";
const listingId = "44444444-4444-4444-8444-444444444444";

const route = (method) => [
  Reflect.getMetadata(PATH_METADATA, AdminController.prototype[method]),
  Reflect.getMetadata(METHOD_METADATA, AdminController.prototype[method]),
];

test("AppModule keeps the admin module with its controller", () => {
  assert.ok(
    Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule).includes(
      AdminModule,
    ),
  );
  assert.ok(
    Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AdminModule).includes(
      AdminController,
    ),
  );
});

test("EF-620 admin controller is excluded from the closed-world OpenAPI document", () => {
  // EF-601/EF-610 precedent for internal-only surfaces: the exclusion keeps
  // the generated client inventory (and openapi.test.mjs) untouched.
  assert.deepEqual(
    Reflect.getMetadata("swagger/apiExcludeController", AdminController),
    [true],
  );
});

test("EF-620 exposes exactly the platform-admin routes with correct verbs", () => {
  assert.deepEqual(
    [
      "stepUp",
      "pendingBrokers",
      "approveBroker",
      "suspendBroker",
      "reinstateBroker",
      "moderationQueue",
      "approveListing",
      "rejectListing",
      "takedownListing",
      "auditSearch",
      "failedJobs",
    ].map(route),
    [
      ["admin/auth/step-up", RequestMethod.POST],
      ["admin/brokers/pending", RequestMethod.GET],
      [
        "admin/organizations/:organizationId/brokers/:membershipId/approve",
        RequestMethod.POST,
      ],
      [
        "admin/organizations/:organizationId/brokers/:membershipId/suspend",
        RequestMethod.POST,
      ],
      [
        "admin/organizations/:organizationId/brokers/:membershipId/reinstate",
        RequestMethod.POST,
      ],
      ["admin/listings/moderation-queue", RequestMethod.GET],
      [
        "admin/organizations/:organizationId/listings/:listingId/moderation/approve",
        RequestMethod.POST,
      ],
      [
        "admin/organizations/:organizationId/listings/:listingId/moderation/reject",
        RequestMethod.POST,
      ],
      [
        "admin/organizations/:organizationId/listings/:listingId/moderation/takedown",
        RequestMethod.POST,
      ],
      ["admin/audit/events", RequestMethod.GET],
      ["admin/automation/failed-jobs", RequestMethod.GET],
    ],
  );
});

test("EF-620 every admin route carries the PlatformAdminGuard; mutations add CSRF", () => {
  const readMethods = [
    "pendingBrokers",
    "moderationQueue",
    "auditSearch",
    "failedJobs",
  ];
  const unsafeMethods = [
    "stepUp",
    "approveBroker",
    "suspendBroker",
    "reinstateBroker",
    "approveListing",
    "rejectListing",
    "takedownListing",
  ];
  for (const method of readMethods) {
    assert.deepEqual(
      Reflect.getMetadata(GUARDS_METADATA, AdminController.prototype[method]),
      readGuards,
      method,
    );
  }
  for (const method of unsafeMethods) {
    assert.deepEqual(
      Reflect.getMetadata(GUARDS_METADATA, AdminController.prototype[method]),
      unsafeGuards,
      method,
    );
  }
});

test("EF-620 admin route ids use ParseUUIDPipe", () => {
  for (const method of [
    "approveBroker",
    "suspendBroker",
    "reinstateBroker",
    "approveListing",
    "rejectListing",
    "takedownListing",
  ]) {
    const argumentsMetadata = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      AdminController,
      method,
    );
    assert.ok(argumentsMetadata, method);
    assert.ok(
      Object.values(argumentsMetadata).some(({ pipes }) =>
        pipes.some((pipe) => pipe instanceof ParseUUIDPipe),
      ),
      method,
    );
  }
});

test("EF-620 PlatformAdminGuard denies missing, unverified, and non-admin principals", () => {
  const guard = new PlatformAdminGuard();
  const context = (auth) => ({
    switchToHttp: () => ({ getRequest: () => ({ auth }) }),
  });
  assert.throws(
    () => guard.canActivate(context(undefined)),
    ForbiddenException,
  );
  assert.throws(
    () =>
      guard.canActivate(
        context({ verified: false, platformRole: "PLATFORM_ADMIN" }),
      ),
    ForbiddenException,
  );
  assert.throws(
    () => guard.canActivate(context({ verified: true, platformRole: "NONE" })),
    ForbiddenException,
  );
  assert.equal(
    guard.canActivate(
      context({ verified: true, platformRole: "PLATFORM_ADMIN" }),
    ),
    true,
  );
});

test("EF-620 controller maps admin domain errors to one HTTP status each", async () => {
  const {
    AdminConflictError,
    AdminForbiddenError,
    AdminNotFoundError,
    AdminStepUpRequiredError,
    AdminValidationError,
    AdminStepUpDeniedError,
  } = await import("../dist/features/admin/domain/admin-errors.js");
  const currentError = { error: null };
  const stub = {
    async listPendingBrokers() {
      throw currentError.error;
    },
  };
  const controller = new AdminController(stub);
  const expectStatus = async (error, status) => {
    currentError.error = error;
    try {
      await controller.pendingBrokers({}, {});
      assert.fail(`expected ${error.name}`);
    } catch (caught) {
      assert.equal(typeof caught.getStatus, "function", error.name);
      assert.equal(caught.getStatus(), status, error.name);
    }
  };
  await expectStatus(new AdminForbiddenError(), 403);
  await expectStatus(new AdminStepUpRequiredError(), 403);
  await expectStatus(new AdminNotFoundError(), 404);
  await expectStatus(new AdminConflictError(), 409);
  await expectStatus(new AdminValidationError(), 400);
  await expectStatus(new AdminStepUpDeniedError(), 429);
  void membershipId;
  void listingId;
  void orgId;
});
