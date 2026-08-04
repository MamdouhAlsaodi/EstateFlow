import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import { AuthenticateAccess } from "../dist/features/auth/application/authenticate-access.js";
import { FixedClock } from "../dist/features/auth/application/clock.js";
import {
  GenericAuthenticationError,
  InvalidRefreshError,
  InvalidRegistrationInputError,
  InvalidSessionError,
} from "../dist/features/auth/domain/auth-errors.js";
import { GetSession } from "../dist/features/auth/application/get-session.js";
import { Login } from "../dist/features/auth/application/login.js";
import { Logout } from "../dist/features/auth/application/logout.js";
import { RefreshSession } from "../dist/features/auth/application/refresh-session.js";
import { RegisterUser } from "../dist/features/auth/application/register-user.js";

const NOW = new Date("2026-07-30T12:00:00.000Z");
const ACCESS_EXPIRY = "2026-07-30T12:15:00.000Z";
const REFRESH_EXPIRY = "2026-08-06T12:00:00.000Z";
const token = (value) => Buffer.alloc(32, value).toString("base64url");
const credentialHash = (secret) =>
  `credential-hash:${Buffer.from(secret).toString("hex")}`;
const credential = (id, value) => `${id}.${token(value)}`;
const TEST_CONTEXT = {
  clientSourceKeyHash: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE",
  requestCorrelationId: "550e8400-e29b-41d4-a716-446655440000",
};
const TEST_AUDIT_SERVICE = { async allowed() {}, async denied() {} };
const TEST_ABUSE_CONTROL = {
  async consumeRegistration() {
    return NOW;
  },
  async reserveLogin() {
    return NOW;
  },
  async completeLoginSuccess() {},
  async consumeRefresh() {},
};
const TEST_SECRET_ISSUER = {
  issue: () => ({ secret: token(9), hash: "verification-hash" }),
};
const TEST_VERIFICATION_DELIVERY = { async deliver() {} };

class FakePasswordHasher {
  constructor() {
    this.hashCalls = [];
    this.verifyCalls = [];
    this.rehashes = new Set();
  }

  async hash(password) {
    this.hashCalls.push(password);
    return `hash:${password}`;
  }

  async verify(password, passwordHash) {
    this.verifyCalls.push([password, passwordHash]);
    return passwordHash === `hash:${password}`;
  }

  needsRehash(passwordHash) {
    return this.rehashes.has(passwordHash);
  }
}

class FakeCredentialIssuer {
  constructor() {
    this.next = 1;
    this.matchCalls = [];
  }

  issue() {
    const id = `00000000-0000-4000-8000-${String(this.next).padStart(12, "0")}`;
    const secret = token(this.next++);
    return {
      id,
      secret,
      serialized: `${id}.${secret}`,
      hash: this.hash(secret),
    };
  }

  hash(secret) {
    return credentialHash(secret);
  }

  matches(secret, expectedHash) {
    this.matchCalls.push([secret, expectedHash]);
    return this.hash(secret) === expectedHash;
  }
}

class FakeAuthRepository {
  constructor() {
    this.identities = new Map();
    this.createIdentityCalls = [];
    this.updatePasswordHashCalls = [];
    this.createSessionCalls = [];
    this.accessById = new Map();
    this.rotateResult = {
      status: "rotated",
      absoluteExpiresAt: new Date(REFRESH_EXPIRY),
    };
    this.rotateCalls = [];
    this.revocations = [];
  }

  async createIdentity(input) {
    this.createIdentityCalls.push(input);
    if (this.identities.has(input.accountIdentifier))
      return { status: "exists" };
    this.identities.set(input.accountIdentifier, {
      userId: `user-${this.identities.size + 1}`,
      accountIdentifier: input.accountIdentifier,
      verifiedAt: null,
      platformRole: "NONE",
      passwordHash: input.passwordHash,
    });
    return {
      status: "created",
      userId: this.identities.get(input.accountIdentifier).userId,
    };
  }

  async findIdentityWithCredential(accountIdentifier) {
    return this.identities.get(accountIdentifier) ?? null;
  }

  async updatePasswordHash(userId, passwordHash, changedAt) {
    this.updatePasswordHashCalls.push({ userId, passwordHash, changedAt });
  }

  async createSessionFamily(input) {
    this.createSessionCalls.push(input);
    return `family-${this.createSessionCalls.length}`;
  }

  async findActiveAccessById(id) {
    return this.accessById.get(id) ?? null;
  }

  async findRefreshSubject() {
    return null;
  }

  async rotateRefresh(rotation) {
    this.rotateCalls.push(rotation);
    return this.rotateResult;
  }

  async revokeFamily(input) {
    this.revocations.push(input);
  }

  async revokeUserFamilies() {}
}

function subject() {
  const repository = new FakeAuthRepository();
  const passwordHasher = new FakePasswordHasher();
  const credentialIssuer = new FakeCredentialIssuer();
  const clock = new FixedClock(NOW);
  return { repository, passwordHasher, credentialIssuer, clock };
}

function validPassword() {
  return "twelve-char!";
}

async function assertGenericAuthentication(action) {
  await assert.rejects(action, (error) => {
    assert.equal(error instanceof GenericAuthenticationError, true);
    assert.equal(error.message, "Invalid credentials");
    return true;
  });
}

test("registration normalizes valid identifiers, hashes before persistence, and accepts duplicates without disclosure", async () => {
  const { repository, passwordHasher, clock } = subject();
  const register = new RegisterUser(
    repository,
    passwordHasher,
    clock,
    TEST_SECRET_ISSUER,
    TEST_VERIFICATION_DELIVERY,
    TEST_ABUSE_CONTROL,
    TEST_AUDIT_SERVICE,
  );

  assert.deepEqual(
    await register.execute(
      {
        accountIdentifier: "  PERSON＠EXAMPLE.TEST  ",
        password: validPassword(),
      },
      TEST_CONTEXT,
    ),
    { status: "accepted" },
  );
  assert.deepEqual(
    await register.execute(
      {
        accountIdentifier: "person@example.test",
        password: validPassword(),
      },
      TEST_CONTEXT,
    ),
    { status: "accepted" },
  );
  assert.deepEqual(
    repository.createIdentityCalls.map(
      ({ accountIdentifier }) => accountIdentifier,
    ),
    ["person@example.test", "person@example.test"],
  );
  assert.deepEqual(passwordHasher.hashCalls, [
    validPassword(),
    validPassword(),
  ]);
  assert.equal(
    repository.createIdentityCalls[0].passwordHash,
    `hash:${validPassword()}`,
  );
});

test("registration rejects malformed identifiers and passwords outside code-point and UTF-8 limits", async () => {
  const { repository, passwordHasher, clock } = subject();
  const register = new RegisterUser(
    repository,
    passwordHasher,
    clock,
    TEST_SECRET_ISSUER,
    TEST_VERIFICATION_DELIVERY,
    TEST_ABUSE_CONTROL,
    TEST_AUDIT_SERVICE,
  );

  for (const input of [
    { accountIdentifier: "not-an-email", password: validPassword() },
    {
      accountIdentifier: `${"a".repeat(250)}@x.test`,
      password: validPassword(),
    },
    { accountIdentifier: "person@example.test", password: "short" },
    { accountIdentifier: "person@example.test", password: "😀".repeat(257) },
  ]) {
    await assert.rejects(
      () => register.execute(input, TEST_CONTEXT),
      InvalidRegistrationInputError,
    );
  }
  assert.deepEqual(passwordHasher.hashCalls, []);
  assert.deepEqual(repository.createIdentityCalls, []);
});

test("login rejects malformed input without work, hashes a fixed dummy for unknown accounts, and gives wrong credentials the same typed generic failure", async () => {
  const { repository, passwordHasher, credentialIssuer, clock } = subject();
  const login = new Login(
    repository,
    passwordHasher,
    credentialIssuer,
    clock,
    TEST_ABUSE_CONTROL,
    TEST_AUDIT_SERVICE,
  );
  repository.identities.set("person@example.test", {
    userId: "user-1",
    accountIdentifier: "person@example.test",
    verifiedAt: null,
    passwordHash: "hash:correct-password",
  });

  await assertGenericAuthentication(() =>
    login.execute(
      {
        accountIdentifier: "unknown@example.test",
        password: "attacker-supplied-password",
      },
      TEST_CONTEXT,
    ),
  );
  await assertGenericAuthentication(() =>
    login.execute(
      {
        accountIdentifier: "person@example.test",
        password: "wrong-password",
      },
      TEST_CONTEXT,
    ),
  );
  for (const input of [
    { accountIdentifier: "malformed", password: validPassword() },
    { accountIdentifier: "person@example.test", password: "" },
    { accountIdentifier: "person@example.test", password: "😀".repeat(65) },
  ]) {
    await assertGenericAuthentication(() => login.execute(input, TEST_CONTEXT));
  }
  assert.deepEqual(passwordHasher.hashCalls, ["invalid-login-password"]);
  assert.deepEqual(passwordHasher.verifyCalls, [
    ["wrong-password", "hash:correct-password"],
  ]);
  assert.equal(credentialIssuer.next, 1);
  assert.deepEqual(repository.createSessionCalls, []);
});

test("login rehashes only when required and returns raw session material with an unverified session principal", async () => {
  const { repository, passwordHasher, credentialIssuer, clock } = subject();
  const login = new Login(
    repository,
    passwordHasher,
    credentialIssuer,
    clock,
    TEST_ABUSE_CONTROL,
    TEST_AUDIT_SERVICE,
  );
  repository.identities.set("person@example.test", {
    userId: "user-1",
    accountIdentifier: "person@example.test",
    verifiedAt: null,
    platformRole: "NONE",
    passwordHash: "hash:correct-password",
  });
  passwordHasher.rehashes.add("hash:correct-password");

  const result = await login.execute(
    {
      accountIdentifier: "PERSON@EXAMPLE.TEST",
      password: "correct-password",
    },
    TEST_CONTEXT,
  );

  assert.deepEqual(result.principal, {
    userId: "user-1",
    familyId: "family-1",
    accessSessionId: "00000000-0000-4000-8000-000000000001",
    verified: false,
    platformRole: "NONE",
    csrfHash: credentialHash(token(3)),
  });
  assert.equal(
    result.accessCredential,
    credential("00000000-0000-4000-8000-000000000001", 1),
  );
  assert.equal(
    result.refreshCredential,
    credential("00000000-0000-4000-8000-000000000002", 2),
  );
  assert.equal(result.csrfToken, token(3));
  assert.equal(result.accessExpiresAt.toISOString(), ACCESS_EXPIRY);
  assert.equal(result.refreshAbsoluteExpiresAt.toISOString(), REFRESH_EXPIRY);
  assert.deepEqual(repository.updatePasswordHashCalls, [
    {
      userId: "user-1",
      passwordHash: "hash:correct-password",
      changedAt: NOW,
    },
  ]);
  assert.deepEqual(repository.createSessionCalls[0].access, {
    id: result.principal.accessSessionId,
    tokenHash: credentialHash(token(1)),
    csrfHash: result.principal.csrfHash,
    issuedAt: NOW,
    expiresAt: new Date(ACCESS_EXPIRY),
  });
  passwordHasher.rehashes.clear();
  repository.identities.set("second@example.test", {
    userId: "user-2",
    accountIdentifier: "second@example.test",
    verifiedAt: new Date(NOW),
    platformRole: "PLATFORM_ADMIN",
    passwordHash: "hash:second-password",
  });
  const platformAdministratorLogin = await login.execute(
    {
      accountIdentifier: "second@example.test",
      password: "second-password",
    },
    TEST_CONTEXT,
  );
  assert.equal(
    platformAdministratorLogin.principal.platformRole,
    "PLATFORM_ADMIN",
  );
  assert.equal(repository.updatePasswordHashCalls.length, 1);
  assert.equal(
    JSON.stringify(repository.createSessionCalls).includes(
      result.accessCredential,
    ),
    false,
  );
  assert.equal(
    JSON.stringify(repository.createSessionCalls).includes(
      result.refreshCredential,
    ),
    false,
  );
  assert.equal(
    JSON.stringify(repository.createSessionCalls).includes(result.csrfToken),
    false,
  );
});

test("access authentication maps persisted platform roles into the principal and rejects invalid sessions", async () => {
  const { repository, credentialIssuer, clock } = subject();
  const authenticate = new AuthenticateAccess(
    repository,
    credentialIssuer,
    clock,
  );
  const access = credential("00000000-0000-4000-8000-000000000001", 1);

  for (const platformRole of ["NONE", "PLATFORM_ADMIN"]) {
    repository.accessById.set("00000000-0000-4000-8000-000000000001", {
      userId: "user-1",
      familyId: "family-1",
      accessSessionId: "00000000-0000-4000-8000-000000000001",
      verified: true,
      platformRole,
      tokenHash: credentialHash(token(1)),
      csrfHash: credentialHash(token(3)),
      expiresAt: new Date(ACCESS_EXPIRY),
    });

    assert.deepEqual(await authenticate.execute(access), {
      userId: "user-1",
      familyId: "family-1",
      accessSessionId: "00000000-0000-4000-8000-000000000001",
      verified: true,
      platformRole,
      csrfHash: credentialHash(token(3)),
    });
  }
  for (const candidate of [
    "malformed",
    credential("00000000-0000-4000-8000-000000000002", 2),
    credential("00000000-0000-4000-8000-000000000001", 9),
  ]) {
    await assert.rejects(
      () => authenticate.execute(candidate),
      InvalidSessionError,
    );
  }
  assert.equal(credentialIssuer.matchCalls.length, 3);
});

test("access propagates repository, issuer, and clock operational errors", async () => {
  const access = credential("00000000-0000-4000-8000-000000000001", 1);
  for (const setup of [
    ({ repository }) => {
      repository.findActiveAccessById = async () => {
        throw new Error("repository sentinel");
      };
    },
    ({ credentialIssuer }) => {
      credentialIssuer.matches = () => {
        throw new Error("issuer sentinel");
      };
    },
    ({ clock }) => {
      clock.now = () => {
        throw new Error("clock sentinel");
      };
    },
  ]) {
    const dependencies = subject();
    dependencies.repository.accessById.set(
      "00000000-0000-4000-8000-000000000001",
      {
        userId: "user-1",
        familyId: "family-1",
        accessSessionId: "00000000-0000-4000-8000-000000000001",
        verified: true,
        tokenHash: credentialHash(token(1)),
        csrfHash: credentialHash(token(3)),
      },
    );
    setup(dependencies);
    const authenticate = new AuthenticateAccess(
      dependencies.repository,
      dependencies.credentialIssuer,
      dependencies.clock,
      TEST_ABUSE_CONTROL,
      TEST_AUDIT_SERVICE,
    );
    await assert.rejects(() => authenticate.execute(access), /sentinel/);
  }
});

test("get-session returns the authenticated fields and current CSRF token", async () => {
  const { repository } = subject();
  const principal = {
    userId: "user-1",
    familyId: "family-1",
    accessSessionId: "access-1",
    verified: false,
    csrfHash: "csrf-hash",
  };

  assert.deepEqual(new GetSession().execute(principal, "csrf-token"), {
    id: "user-1",
    verified: false,
    csrfToken: "csrf-token",
  });
  await new Logout(repository, new FixedClock(NOW), TEST_AUDIT_SERVICE).execute(
    principal,
    TEST_CONTEXT,
  );
  assert.deepEqual(repository.revocations, [
    {
      familyId: "family-1",
      userId: "user-1",
      reason: "LOGOUT",
      now: NOW,
      requestCorrelationId: TEST_CONTEXT.requestCorrelationId,
    },
  ]);
});

test("refresh verifies parsed credential and canonical CSRF, passes both hashes to the repository, and preserves absolute expiry", async () => {
  const { repository, credentialIssuer, clock } = subject();
  const refresh = new RefreshSession(
    repository,
    credentialIssuer,
    clock,
    TEST_ABUSE_CONTROL,
    TEST_AUDIT_SERVICE,
  );
  const presentedRefresh = credential(
    "00000000-0000-4000-8000-000000000001",
    1,
  );

  const result = await refresh.execute(
    {
      refreshCredential: presentedRefresh,
      csrfToken: token(7),
    },
    TEST_CONTEXT,
  );

  assert.equal(repository.rotateCalls.length, 1);
  assert.deepEqual(
    repository.rotateCalls[0].presentedRefreshId,
    "00000000-0000-4000-8000-000000000001",
  );
  assert.equal(
    repository.rotateCalls[0].presentedTokenHash,
    credentialHash(token(1)),
  );
  assert.equal(
    repository.rotateCalls[0].presentedCsrfHash,
    credentialHash(token(7)),
  );
  assert.equal(result.refreshAbsoluteExpiresAt.toISOString(), REFRESH_EXPIRY);
  assert.equal(result.accessExpiresAt.toISOString(), ACCESS_EXPIRY);
  assert.equal(result.csrfToken, token(3));
  assert.equal(
    JSON.stringify(repository.rotateCalls).includes(result.csrfToken),
    false,
  );
});

test("refresh propagates repository, issuer, and clock operational errors", async () => {
  const validInput = {
    refreshCredential: credential("00000000-0000-4000-8000-000000000001", 1),
    csrfToken: token(7),
  };
  for (const setup of [
    ({ repository }) => {
      repository.rotateRefresh = async () => {
        throw new Error("repository sentinel");
      };
    },
    ({ credentialIssuer }) => {
      credentialIssuer.issue = () => {
        throw new Error("issuer sentinel");
      };
    },
    ({ clock }) => {
      clock.now = () => {
        throw new Error("clock sentinel");
      };
    },
  ]) {
    const dependencies = subject();
    setup(dependencies);
    const refresh = new RefreshSession(
      dependencies.repository,
      dependencies.credentialIssuer,
      dependencies.clock,
      TEST_ABUSE_CONTROL,
      TEST_AUDIT_SERVICE,
    );
    await assert.rejects(
      () => refresh.execute(validInput, TEST_CONTEXT),
      /sentinel/,
    );
  }
});

test("refresh presents generic invalid-refresh failures for malformed, rejected, and replayed input", async () => {
  const { repository, credentialIssuer, clock } = subject();
  const refresh = new RefreshSession(
    repository,
    credentialIssuer,
    clock,
    TEST_ABUSE_CONTROL,
    TEST_AUDIT_SERVICE,
  );
  const validInput = {
    refreshCredential: credential("00000000-0000-4000-8000-000000000001", 1),
    csrfToken: token(7),
  };

  for (const input of [
    { ...validInput, refreshCredential: "malformed" },
    { ...validInput, csrfToken: "not-canonical" },
  ]) {
    await assert.rejects(
      () => refresh.execute(input, TEST_CONTEXT),
      InvalidRefreshError,
    );
  }
  repository.rotateResult = { status: "rejected" };
  await assert.rejects(
    () => refresh.execute(validInput, TEST_CONTEXT),
    InvalidRefreshError,
  );
  repository.rotateResult = { status: "replayed" };
  await assert.rejects(
    () => refresh.execute(validInput, TEST_CONTEXT),
    InvalidRefreshError,
  );
});
