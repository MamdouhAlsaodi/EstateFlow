import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { AuthCookieService } from "../dist/features/auth/http/auth-cookie.service.js";
import {
  InvalidAuthCookieError,
  parseAuthCookies,
} from "../dist/features/auth/http/auth-cookie-parser.js";
import { CsrfGuard } from "../dist/features/auth/http/csrf.guard.js";
import { NodeCryptoCredentialIssuer } from "../dist/features/auth/infrastructure/node-crypto-credential-issuer.js";
import { RequireCanonicalOriginGuard } from "../dist/features/auth/http/origin.guard.js";

const CANONICAL_ORIGIN = "https://app.estateflow.test";
const HASH_KEY = "test-hash-key-must-be-at-least-32-bytes";
const ACCESS_CREDENTIAL =
  "d5501c01-1ac7-4a5b-b560-5721194e0c90.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const REFRESH_CREDENTIAL =
  "d5501c01-1ac7-4a5b-b560-5721194e0c91.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const CSRF_TOKEN = "qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo";
const REQUEST_CORRELATION_ID = "550e8400-e29b-41d4-a716-446655440000";

function createCookieResponse() {
  const headers = [];
  return {
    headers,
    append(name, value) {
      assert.equal(name, "Set-Cookie");
      headers.push(value);
    },
  };
}

function createExecutionContext(request) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  };
}

function assertForbidden(action) {
  assert.throws(action, (error) => {
    assert.equal(error instanceof ForbiddenException, true);
    assert.equal(error.getStatus(), 403);
    return true;
  });
}

function createAuthenticatedRequest(headers, csrfHash) {
  return {
    method: "POST",
    headers,
    auth: {
      userId: "user-id",
      familyId: "family-id",
      accessSessionId: "access-session-id",
      verified: true,
      csrfHash,
    },
  };
}

test("session cookies use the approved names, scopes, and lifetimes", () => {
  const response = createCookieResponse();
  const cookies = new AuthCookieService();

  cookies.setSessionCookies(response, {
    accessCredential: ACCESS_CREDENTIAL,
    refreshCredential: REFRESH_CREDENTIAL,
    csrfToken: CSRF_TOKEN,
    remainingRefreshLifetimeSeconds: 3_600,
  });

  assert.deepEqual(response.headers, [
    `__Host-estateflow_access=${ACCESS_CREDENTIAL}; Max-Age=900; Path=/; HttpOnly; Secure; SameSite=Lax`,
    `__Host-estateflow_session=${REFRESH_CREDENTIAL}; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax`,
    `estateflow_csrf=${CSRF_TOKEN}; Max-Age=3600; Path=/; Secure; SameSite=Lax`,
  ]);
});

test("session cookie serialization rejects invalid inputs before appending headers", () => {
  const cookies = new AuthCookieService();
  const invalidSessionCookies = [
    { accessCredential: `invalid; ${ACCESS_CREDENTIAL}` },
    { refreshCredential: `invalid\r\nSet-Cookie: injected` },
    { csrfToken: "not-a-32-byte-base64url-token" },
    { csrfToken: `${CSRF_TOKEN}=` },
    { remainingRefreshLifetimeSeconds: 0 },
    { remainingRefreshLifetimeSeconds: -1 },
    { remainingRefreshLifetimeSeconds: 1.5 },
    { remainingRefreshLifetimeSeconds: Number.NaN },
    { remainingRefreshLifetimeSeconds: 604_801 },
  ];

  for (const invalidCookie of invalidSessionCookies) {
    const response = createCookieResponse();
    assert.throws(
      () =>
        cookies.setSessionCookies(response, {
          accessCredential: ACCESS_CREDENTIAL,
          refreshCredential: REFRESH_CREDENTIAL,
          csrfToken: CSRF_TOKEN,
          remainingRefreshLifetimeSeconds: 3_600,
          ...invalidCookie,
        }),
      (error) => {
        assert.equal(error instanceof Error, true);
        assert.equal(error.message.includes(ACCESS_CREDENTIAL), false);
        assert.equal(error.message.includes(REFRESH_CREDENTIAL), false);
        assert.equal(error.message.includes(CSRF_TOKEN), false);
        return true;
      },
    );
    assert.deepEqual(response.headers, []);
  }
});

test("clearing a session expires all three cookies with their original scopes", () => {
  const response = createCookieResponse();
  const cookies = new AuthCookieService();

  cookies.clearSessionCookies(response);

  assert.deepEqual(response.headers, [
    "__Host-estateflow_access=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; Secure; SameSite=Lax",
    "__Host-estateflow_session=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; Secure; SameSite=Lax",
    "estateflow_csrf=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; Secure; SameSite=Lax",
  ]);
});

test("cookie parsing accepts one valid credential of each auth cookie name and ignores unrelated cookies", () => {
  const cookies = parseAuthCookies(
    `analytics=ignored; __Host-estateflow_access=${ACCESS_CREDENTIAL}; estateflow_csrf=${CSRF_TOKEN}; __Host-estateflow_session=${REFRESH_CREDENTIAL}`,
  );

  assert.equal(cookies.access?.serialized, ACCESS_CREDENTIAL);
  assert.equal(cookies.refresh?.serialized, REFRESH_CREDENTIAL);
  assert.equal(cookies.csrf, CSRF_TOKEN);
});

test("cookie parsing rejects duplicate auth names without exposing raw values", () => {
  const rawCookie = `__Host-estateflow_access=${ACCESS_CREDENTIAL}; __Host-estateflow_access=${ACCESS_CREDENTIAL}`;

  assert.throws(
    () => parseAuthCookies(rawCookie),
    (error) => {
      assert.equal(error instanceof InvalidAuthCookieError, true);
      assert.equal(error.message.includes(ACCESS_CREDENTIAL), false);
      return true;
    },
  );
});

test("cookie parsing ignores encoded auth-name aliases and malformed unrelated values", () => {
  const cookies = parseAuthCookies(
    `%5F%5FHost-estateflow_access=${ACCESS_CREDENTIAL}; analytics=%ZZ; telemetry=unrelated`,
  );

  assert.deepEqual(cookies, {});
});

test("cookie parsing rejects controls, malformed exact-auth encoding, credentials, and CSRF", () => {
  for (const rawCookie of [
    "__Host-estateflow_access=not-a-credential",
    "__Host-estateflow_session=not-a-credential",
    "estateflow_csrf=not-a-32-byte-base64url-token",
    "estateflow_csrf=%ZZ",
    `estateflow_csrf=${CSRF_TOKEN}%0A`,
    `__Host-estateflow_access=${ACCESS_CREDENTIAL}\u0007`,
  ]) {
    assert.throws(() => parseAuthCookies(rawCookie), InvalidAuthCookieError);
  }
});

test("safe requests do not require an Origin header", () => {
  const guard = new RequireCanonicalOriginGuard(CANONICAL_ORIGIN);
  const request = { method: "GET", headers: {} };

  assert.equal(guard.canActivate(createExecutionContext(request)), true);
});

test("unsafe requests require exactly the configured raw Origin", () => {
  const guard = new RequireCanonicalOriginGuard(CANONICAL_ORIGIN);
  const rejectedOrigins = [
    undefined,
    "https://other.estateflow.test",
    `${CANONICAL_ORIGIN}, https://other.estateflow.test`,
    [CANONICAL_ORIGIN],
  ];

  for (const origin of rejectedOrigins) {
    const request = {
      method: "POST",
      headers: {
        origin,
        forwarded: CANONICAL_ORIGIN,
        "x-forwarded-origin": CANONICAL_ORIGIN,
      },
    };
    assertForbidden(() => guard.canActivate(createExecutionContext(request)));
  }

  assert.equal(
    guard.canActivate(
      createExecutionContext({
        method: "PATCH",
        headers: { origin: CANONICAL_ORIGIN },
      }),
    ),
    true,
  );
});

test("CSRF guard permits an authenticated unsafe request with matching cookie, header, and server hash", () => {
  const credentialIssuer = new NodeCryptoCredentialIssuer(HASH_KEY);
  const guard = new CsrfGuard(credentialIssuer);
  const request = createAuthenticatedRequest(
    {
      cookie: `estateflow_csrf=${CSRF_TOKEN}`,
      "x-csrf-token": CSRF_TOKEN,
    },
    credentialIssuer.hash(CSRF_TOKEN),
  );

  assert.equal(guard.canActivate(createExecutionContext(request)), true);
});

test("CSRF guard rejects invalid unsafe requests before a mutation callback", () => {
  const credentialIssuer = new NodeCryptoCredentialIssuer(HASH_KEY);
  const guard = new CsrfGuard(credentialIssuer);
  const rejectedRequests = [
    createAuthenticatedRequest(
      { cookie: `estateflow_csrf=${CSRF_TOKEN}` },
      credentialIssuer.hash(CSRF_TOKEN),
    ),
    createAuthenticatedRequest(
      { cookie: `estateflow_csrf=${CSRF_TOKEN}`, "x-csrf-token": "different" },
      credentialIssuer.hash(CSRF_TOKEN),
    ),
    createAuthenticatedRequest(
      { cookie: `estateflow_csrf=${CSRF_TOKEN}`, "x-csrf-token": CSRF_TOKEN },
      credentialIssuer.hash("stale-token"),
    ),
    createAuthenticatedRequest(
      { cookie: `estateflow_csrf=${CSRF_TOKEN}`, "x-csrf-token": [CSRF_TOKEN] },
      credentialIssuer.hash(CSRF_TOKEN),
    ),
    createAuthenticatedRequest(
      {
        cookie: `estateflow_csrf=${CSRF_TOKEN}; estateflow_csrf=${CSRF_TOKEN}`,
        "x-csrf-token": CSRF_TOKEN,
      },
      credentialIssuer.hash(CSRF_TOKEN),
    ),
  ];

  for (const request of rejectedRequests) {
    let mutationCalls = 0;
    assertForbidden(() => {
      guard.canActivate(createExecutionContext(request));
      mutationCalls += 1;
    });
    assert.equal(mutationCalls, 0);
  }
});

test("CSRF guard does not require a token for safe requests", () => {
  const credentialIssuer = new NodeCryptoCredentialIssuer(HASH_KEY);
  const guard = new CsrfGuard(credentialIssuer);
  const request = { method: "GET", headers: {} };

  assert.equal(guard.canActivate(createExecutionContext(request)), true);
});

// EF-120-III: only the direct socket source may contribute to abuse control.
test("request context hashes the bounded direct socket source and ignores forwarding headers", async () => {
  const hashedSources = [];
  const { AuthRequestContextFactory } =
    await import("../dist/features/auth/http/auth-request-context.factory.js");
  const factory = new AuthRequestContextFactory({
    hashClientSource(source) {
      hashedSources.push(source);
      return "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE";
    },
  });

  const context = factory.create({
    requestId: REQUEST_CORRELATION_ID,
    socket: { remoteAddress: " 2001:db8::1 " },
    headers: {
      "x-forwarded-for": "198.51.100.50",
      forwarded: "for=198.51.100.51",
      "x-real-ip": "198.51.100.52",
      "x-request-id": "9a30f920-575f-4bdb-884c-227109705728",
    },
  });

  assert.deepEqual(context, {
    clientSourceKeyHash: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE",
    requestCorrelationId: REQUEST_CORRELATION_ID,
  });
  assert.deepEqual(hashedSources, ["2001:db8::1"]);
});

test("request context fails closed when middleware did not provide a canonical request ID", async () => {
  const { AuthRequestContextFactory } =
    await import("../dist/features/auth/http/auth-request-context.factory.js");
  const factory = new AuthRequestContextFactory({
    hashClientSource: () => "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE",
  });

  for (const requestId of [
    undefined,
    "not-a-uuid",
    "550E8400-E29B-41D4-A716-446655440000",
  ]) {
    assert.throws(
      () =>
        factory.create({ requestId, socket: { remoteAddress: "127.0.0.1" } }),
      /canonical request ID/,
    );
  }
});

test("request context replaces missing and oversized direct sources with its fixed internal sentinel", async () => {
  const hashedSources = [];
  const { AuthRequestContextFactory } =
    await import("../dist/features/auth/http/auth-request-context.factory.js");
  const factory = new AuthRequestContextFactory({
    hashClientSource(source) {
      hashedSources.push(source);
      return "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE";
    },
  });

  factory.create({ requestId: REQUEST_CORRELATION_ID, socket: {} });
  factory.create({
    requestId: REQUEST_CORRELATION_ID,
    socket: { remoteAddress: "x".repeat(257) },
  });

  assert.deepEqual(hashedSources, [
    "missing-direct-client-source",
    "missing-direct-client-source",
  ]);
});
