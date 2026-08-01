import assert from "node:assert/strict";
import test from "node:test";
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  RequestMethod,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants.js";
import { AppModule } from "../dist/app.module.js";
import {
  AUTH_SECURITY_AUDIT_SERVICE,
  SESSION_CREDENTIAL_ISSUER,
} from "../dist/features/auth/auth.tokens.js";
import { AuthModule } from "../dist/features/auth/auth.module.js";
import { AuthenticateAccess } from "../dist/features/auth/application/authenticate-access.js";
import { SecurityAuditService } from "../dist/features/auth/application/security-audit.js";
import {
  GenericAuthenticationError,
  InvalidRefreshError,
  InvalidRegistrationInputError,
  InvalidSessionError,
} from "../dist/features/auth/domain/auth-errors.js";
import { AuthController } from "../dist/features/auth/http/auth.controller.js";
import { BrowserSessionGuard } from "../dist/features/auth/http/browser-session.guard.js";
import { RefreshCsrfGuard } from "../dist/features/auth/http/refresh-csrf.guard.js";
import { CsrfGuard } from "../dist/features/auth/http/csrf.guard.js";
import { RequireCanonicalOriginGuard } from "../dist/features/auth/http/origin.guard.js";

const ACCESS_CREDENTIAL =
  "d5501c01-1ac7-4a5b-b560-5721194e0c90.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const REFRESH_CREDENTIAL =
  "d5501c01-1ac7-4a5b-b560-5721194e0c91.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const CSRF_TOKEN = "qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo";
const EXPIRY = new Date("2030-01-01T00:00:01.001Z");
const NOW = new Date("2030-01-01T00:00:00.000Z");
const TEST_BROWSER_ORIGIN = "https://app.estateflow.test";

Object.assign(globalThis.process.env, {
  NODE_ENV: "test",
  ESTATEFLOW_BROWSER_ORIGIN: TEST_BROWSER_ORIGIN,
  ESTATEFLOW_AUTH_HASH_KEY: "a".repeat(32),
  ESTATEFLOW_AUDIT_HASH_KEY: "b".repeat(32),
  ESTATEFLOW_AUTH_FAKE_DELIVERY: "true",
});

function responseRecorder() {
  const cookies = [];
  return {
    cookies,
    append(name, value) {
      assert.equal(name, "Set-Cookie");
      cookies.push(value);
    },
  };
}

function executionContext(request) {
  return { switchToHttp: () => ({ getRequest: () => request }) };
}

function authentication() {
  return {
    userId: "user-id",
    familyId: "family-id",
    accessSessionId: "access-session-id",
    verified: true,
    platformRole: "NONE",
    csrfHash: "server-csrf-hash",
  };
}

function sessionBundle() {
  return {
    accessCredential: ACCESS_CREDENTIAL,
    refreshCredential: REFRESH_CREDENTIAL,
    csrfToken: CSRF_TOKEN,
    accessExpiresAt: EXPIRY,
    refreshAbsoluteExpiresAt: EXPIRY,
  };
}

function controller({
  register,
  login,
  recovery,
  reset,
  refresh,
  logout,
  getSession,
  contextFactory,
} = {}) {
  return new AuthController(
    register ?? { execute: async () => ({ status: "accepted" }) },
    login ?? {
      execute: async () => ({
        ...sessionBundle(),
        principal: authentication(),
      }),
    },
    refresh ?? { execute: async () => sessionBundle() },
    logout ?? { execute: async () => {} },
    getSession ?? {
      execute: (principal) => ({
        id: principal.userId,
        verified: principal.verified,
      }),
    },
    {
      setSessionCookies(response, session) {
        assert.equal(session.remainingRefreshLifetimeSeconds, 2);
        response.append("Set-Cookie", `access=${session.accessCredential}`);
        response.append("Set-Cookie", `refresh=${session.refreshCredential}`);
        response.append("Set-Cookie", `csrf=${session.csrfToken}`);
      },
      clearSessionCookies(response) {
        response.append("Set-Cookie", "access=");
        response.append("Set-Cookie", "refresh=");
        response.append("Set-Cookie", "csrf=");
      },
    },
    { now: () => NOW },
    recovery ?? { execute: async () => ({ status: "accepted" }) },
    reset ?? { execute: async () => ({ status: "reset" }) },
    contextFactory ?? {
      create: () => ({
        clientSourceKeyHash: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE",
        requestCorrelationId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    },
  );
}

test("EF-120 guard enhancers receive their required dependencies from Nest", async () => {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const originGuards = app.get(RequireCanonicalOriginGuard, { each: true });
    const browserSessionGuards = app.get(BrowserSessionGuard, { each: true });
    const csrfGuards = app.get(CsrfGuard, { each: true });
    const authenticateAccess = app.get(AuthenticateAccess);
    const credentialIssuer = app.get(SESSION_CREDENTIAL_ISSUER);
    const auditService = app.get(AUTH_SECURITY_AUDIT_SERVICE);

    assert.equal(auditService instanceof SecurityAuditService, true);

    assert.ok(originGuards.length > 0);
    assert.ok(browserSessionGuards.length > 0);
    assert.ok(csrfGuards.length > 0);

    for (const guard of originGuards) {
      assert.equal(
        guard.canActivate(
          executionContext({
            method: "POST",
            headers: { origin: TEST_BROWSER_ORIGIN },
          }),
        ),
        true,
      );
    }
    for (const guard of browserSessionGuards) {
      assert.equal(guard.authenticateAccess, authenticateAccess);
      assert.equal("auditService" in guard, false);
      assert.equal("requestContextFactory" in guard, false);
    }
    for (const guard of csrfGuards) {
      assert.equal(guard.credentialIssuer, credentialIssuer);
    }
  } finally {
    await app.close();
  }
});

test("auth composition imports AuthModule", () => {
  assert.equal(
    Reflect.getMetadata("imports", AppModule).includes(AuthModule),
    true,
  );
});

test("auth controller exposes only the required routes and response statuses", () => {
  assert.equal(Reflect.getMetadata(PATH_METADATA, AuthController), "auth");
  assert.deepEqual(
    [
      ["register", 202],
      ["login", 204],
      ["passwordRecovery", 202],
      ["passwordReset", 204],
      ["refresh", 204],
      ["logout", 204],
      ["session", undefined],
    ].map(([route, status]) => [
      Reflect.getMetadata(PATH_METADATA, AuthController.prototype[route]),
      Reflect.getMetadata(METHOD_METADATA, AuthController.prototype[route]),
      Reflect.getMetadata(HTTP_CODE_METADATA, AuthController.prototype[route]),
      status,
    ]),
    [
      ["register", RequestMethod.POST, 202, 202],
      ["login", RequestMethod.POST, 204, 204],
      ["password-recovery", RequestMethod.POST, 202, 202],
      ["password-reset", RequestMethod.POST, 204, 204],
      ["refresh", RequestMethod.POST, 204, 204],
      ["logout", RequestMethod.POST, 204, 204],
      ["session", RequestMethod.GET, undefined, undefined],
    ],
  );
});

test("unsafe route guard metadata preserves the required boundary order", () => {
  assert.deepEqual(
    Reflect.getMetadata(GUARDS_METADATA, AuthController.prototype.register),
    [RequireCanonicalOriginGuard],
  );
  assert.deepEqual(
    Reflect.getMetadata(GUARDS_METADATA, AuthController.prototype.login),
    [RequireCanonicalOriginGuard],
  );
  assert.deepEqual(
    Reflect.getMetadata(
      GUARDS_METADATA,
      AuthController.prototype.passwordRecovery,
    ),
    [RequireCanonicalOriginGuard],
  );
  assert.deepEqual(
    Reflect.getMetadata(
      GUARDS_METADATA,
      AuthController.prototype.passwordReset,
    ),
    [RequireCanonicalOriginGuard],
  );
  assert.deepEqual(
    Reflect.getMetadata(GUARDS_METADATA, AuthController.prototype.refresh),
    [RequireCanonicalOriginGuard, RefreshCsrfGuard],
  );
  assert.deepEqual(
    Reflect.getMetadata(GUARDS_METADATA, AuthController.prototype.logout),
    [RequireCanonicalOriginGuard, BrowserSessionGuard, CsrfGuard],
  );
});

test("register returns only a generic accepted result", async () => {
  const command = { execute: async () => ({ status: "accepted" }) };
  const body = await controller({ register: command }).register({
    accountIdentifier: "person@example.test",
    password: "valid-password",
  });

  assert.deepEqual(body, { status: "accepted" });
});

test("registration and login failures map to generic HTTP errors while operational failures propagate", async () => {
  const registrationInputError = new InvalidRegistrationInputError();
  await assert.rejects(
    controller({
      register: {
        execute: async () => {
          throw registrationInputError;
        },
      },
    }).register({}),
    BadRequestException,
  );

  const authenticationError = new GenericAuthenticationError();
  await assert.rejects(
    controller({
      login: {
        execute: async () => {
          throw authenticationError;
        },
      },
    }).login({}, responseRecorder()),
    UnauthorizedException,
  );

  const outage = new Error("database unavailable");
  await assert.rejects(
    controller({
      login: {
        execute: async () => {
          throw outage;
        },
      },
    }).login({}, responseRecorder()),
    (error) => error === outage,
  );
});

test("login emits exactly three cookies and does not return session credentials", async () => {
  const response = responseRecorder();
  const result = await controller().login(
    { accountIdentifier: "person@example.test", password: "valid-password" },
    response,
  );

  assert.equal(result, undefined);
  assert.deepEqual(response.cookies, [
    `access=${ACCESS_CREDENTIAL}`,
    `refresh=${REFRESH_CREDENTIAL}`,
    `csrf=${CSRF_TOKEN}`,
  ]);
});

test("refresh uses only the refresh guard attachment and clears cookies only for invalid refreshes", async () => {
  const refreshCommand = {
    execute: async (input) => {
      assert.deepEqual(input, {
        refreshCredential: REFRESH_CREDENTIAL,
        csrfToken: CSRF_TOKEN,
      });
      return sessionBundle();
    },
  };
  const successResponse = responseRecorder();
  const refreshRequest = {
    refreshAuth: {
      refreshCredential: REFRESH_CREDENTIAL,
      csrfToken: CSRF_TOKEN,
    },
  };

  assert.equal(
    await controller({ refresh: refreshCommand }).refresh(
      refreshRequest,
      successResponse,
    ),
    undefined,
  );
  assert.equal(successResponse.cookies.length, 3);

  const invalidRefresh = new InvalidRefreshError();
  const rejectedResponse = responseRecorder();
  await assert.rejects(
    controller({
      refresh: {
        execute: async () => {
          throw invalidRefresh;
        },
      },
    }).refresh(refreshRequest, rejectedResponse),
    UnauthorizedException,
  );
  assert.deepEqual(rejectedResponse.cookies, ["access=", "refresh=", "csrf="]);

  const outage = new Error("database unavailable");
  const operationalResponse = responseRecorder();
  await assert.rejects(
    controller({
      refresh: {
        execute: async () => {
          throw outage;
        },
      },
    }).refresh(refreshRequest, operationalResponse),
    (error) => error === outage,
  );
  assert.deepEqual(operationalResponse.cookies, []);
});

test("logout revokes the authenticated family before clearing cookies and session exposes only principal fields", async () => {
  const execution = [];
  const response = responseRecorder();
  const auth = authentication();
  const authController = controller({
    logout: {
      execute: async (principal) => {
        execution.push(principal.familyId);
      },
    },
    getSession: {
      execute: (principal) => ({
        id: principal.userId,
        verified: principal.verified,
      }),
    },
  });

  assert.equal(await authController.logout({ auth }, response), undefined);
  assert.deepEqual(execution, ["family-id"]);
  assert.deepEqual(response.cookies, ["access=", "refresh=", "csrf="]);
  assert.deepEqual(authController.session({ auth }), {
    id: "user-id",
    verified: true,
  });
});

test("browser guard authenticates a strict access cookie and returns generic 401s without audit persistence", async () => {
  const calls = [];
  const guard = new BrowserSessionGuard({
    execute: async (credential) => {
      calls.push(credential);
      return authentication();
    },
  });
  const request = {
    headers: { cookie: `__Host-estateflow_access=${ACCESS_CREDENTIAL}` },
  };

  assert.equal(await guard.canActivate(executionContext(request)), true);
  assert.deepEqual(calls, [ACCESS_CREDENTIAL]);
  assert.deepEqual(request.auth, authentication());
  assert.equal("refreshAuth" in request, false);

  await assert.rejects(
    new BrowserSessionGuard({
      execute: async () => {
        throw new InvalidSessionError();
      },
    }).canActivate(
      executionContext({
        headers: { cookie: `__Host-estateflow_access=${ACCESS_CREDENTIAL}` },
      }),
    ),
    UnauthorizedException,
  );
  await assert.rejects(
    guard.canActivate(executionContext({ headers: {} })),
    UnauthorizedException,
  );
  await assert.rejects(
    guard.canActivate(
      executionContext({
        headers: { cookie: "__Host-estateflow_access=malformed" },
      }),
    ),
    UnauthorizedException,
  );
  const outage = new Error("database unavailable");
  await assert.rejects(
    new BrowserSessionGuard({
      execute: async () => {
        throw outage;
      },
    }).canActivate(
      executionContext({
        headers: { cookie: `__Host-estateflow_access=${ACCESS_CREDENTIAL}` },
      }),
    ),
    (error) => error === outage,
  );
  assert.equal("auditService" in guard, false);
  assert.equal("requestContextFactory" in guard, false);
});

test("refresh CSRF guard rejects malformed, duplicate, and mismatched requests before the command", () => {
  const guard = new RefreshCsrfGuard();
  const rejectedRequests = [
    { headers: {} },
    {
      headers: {
        cookie: `__Host-estateflow_session=${REFRESH_CREDENTIAL}; estateflow_csrf=${CSRF_TOKEN}`,
        "x-csrf-token": `${CSRF_TOKEN},${CSRF_TOKEN}`,
      },
    },
    {
      headers: {
        cookie: `__Host-estateflow_session=${REFRESH_CREDENTIAL}; estateflow_csrf=${CSRF_TOKEN}`,
        "x-csrf-token": "different",
      },
    },
    {
      headers: {
        cookie:
          "__Host-estateflow_session=malformed; estateflow_csrf=malformed",
        "x-csrf-token": CSRF_TOKEN,
      },
    },
    {
      headers: {
        cookie: `__Host-estateflow_session=${REFRESH_CREDENTIAL}; estateflow_csrf=${CSRF_TOKEN}; estateflow_csrf=${CSRF_TOKEN}`,
        "x-csrf-token": CSRF_TOKEN,
      },
    },
    {
      headers: {
        cookie: `__Host-estateflow_session=${REFRESH_CREDENTIAL}; estateflow_csrf=${CSRF_TOKEN}`,
        "x-csrf-token": [CSRF_TOKEN],
      },
    },
  ];

  for (const request of rejectedRequests) {
    let commandCalls = 0;
    assert.throws(() => {
      guard.canActivate(executionContext(request));
      commandCalls += 1;
    }, ForbiddenException);
    assert.equal(commandCalls, 0);
  }

  const request = {
    headers: {
      cookie: `__Host-estateflow_session=${REFRESH_CREDENTIAL}; estateflow_csrf=${CSRF_TOKEN}`,
      "x-csrf-token": CSRF_TOKEN,
    },
  };
  assert.equal(guard.canActivate(executionContext(request)), true);
  assert.deepEqual(request.refreshAuth, {
    refreshCredential: REFRESH_CREDENTIAL,
    csrfToken: CSRF_TOKEN,
  });
  assert.equal("auth" in request, false);
});

test("all five auth commands receive the opaque request context", async () => {
  const contexts = [];
  const requestContext = {
    clientSourceKeyHash: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE",
    requestCorrelationId: "550e8400-e29b-41d4-a716-446655440000",
  };
  const factory = {
    create: (request) => {
      contexts.push(request);
      return requestContext;
    },
  };
  const command = {
    execute: async (_input, context) => {
      assert.equal(context, requestContext);
      return { status: "accepted" };
    },
  };
  const sessionCommand = {
    execute: async (_input, context) => {
      assert.equal(context, requestContext);
      return sessionBundle();
    },
  };
  const authController = controller({
    register: command,
    login: {
      execute: async (input, context) => {
        assert.equal(context, requestContext);
        return { ...sessionBundle(), principal: authentication() };
      },
    },
    recovery: command,
    reset: {
      execute: async (_input, context) => {
        assert.equal(context, requestContext);
      },
    },
    refresh: sessionCommand,
    contextFactory: factory,
  });
  const request = { socket: { remoteAddress: "127.0.0.1" } };

  await authController.register(
    { accountIdentifier: "person@example.test", password: "valid-password" },
    request,
  );
  await authController.login(
    { accountIdentifier: "person@example.test", password: "valid-password" },
    responseRecorder(),
    request,
  );
  await authController.passwordRecovery(
    { accountIdentifier: "person@example.test" },
    request,
  );
  await authController.passwordReset(
    { secret: "secret", password: "valid-password" },
    request,
  );
  await authController.refresh(
    {
      ...request,
      refreshAuth: {
        refreshCredential: REFRESH_CREDENTIAL,
        csrfToken: CSRF_TOKEN,
      },
    },
    responseRecorder(),
  );
  assert.equal(contexts.length, 5);
});

test("recovery, reset, and rate-limit failures use generic HTTP responses without credential output", async () => {
  const rateLimited = new (
    await import("../dist/features/auth/domain/auth-errors.js")
  ).AuthRateLimitExceededError();
  const authController = controller({
    recovery: {
      execute: async () => {
        throw rateLimited;
      },
    },
    reset: {
      execute: async () => {
        throw new (
          await import("../dist/features/auth/domain/auth-errors.js")
        ).InvalidPasswordResetError();
      },
    },
    refresh: {
      execute: async () => {
        throw rateLimited;
      },
    },
  });
  await assert.rejects(
    authController.passwordRecovery(
      { accountIdentifier: "person@example.test" },
      {},
    ),
    (error) =>
      error.getStatus() === 429 &&
      !error.message.includes("person@example.test"),
  );
  await assert.rejects(
    authController.passwordReset(
      { secret: "credential", password: "valid-password" },
      {},
    ),
    BadRequestException,
  );
  const response = responseRecorder();
  await assert.rejects(
    authController.refresh(
      {
        refreshAuth: {
          refreshCredential: REFRESH_CREDENTIAL,
          csrfToken: CSRF_TOKEN,
        },
      },
      response,
    ),
    (error) => error.getStatus() === 429,
  );
  assert.deepEqual(response.cookies, []);
});
