import assert from "node:assert/strict";
import test from "node:test";
import { AuthAbuseControl } from "../dist/features/auth/application/auth-abuse-control.js";
import { createAuthAbusePolicy } from "../dist/features/auth/application/auth-abuse-policy.js";
import {
  AuthRateLimitExceededError,
  GenericAuthenticationError,
  InvalidPasswordResetError,
  InvalidRefreshError,
  InvalidRegistrationInputError,
} from "../dist/features/auth/domain/auth-errors.js";
import { Login } from "../dist/features/auth/application/login.js";
import { RegisterUser } from "../dist/features/auth/application/register-user.js";
import { RequestPasswordRecovery } from "../dist/features/auth/application/request-password-recovery.js";
import { ResetPassword } from "../dist/features/auth/application/reset-password.js";
import { RefreshSession } from "../dist/features/auth/application/refresh-session.js";

const NOW = new Date("2026-07-30T12:00:00.000Z");
const ACCOUNT_KEY_HASH = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const CLIENT_SOURCE_KEY_HASH = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE";
const REQUEST_CORRELATION_ID = "550e8400-e29b-41d4-a716-446655440000";
const TEST_AUDIT_SERVICE = { async allowed() {}, async denied() {} };

class RecordingRepository {
  constructor(decision = { status: "allowed", exceededDimensions: [] }) {
    this.consumeCalls = [];
    this.decision = decision;
  }

  async consumeRateLimit(input) {
    this.consumeCalls.push(input);
    this.events?.push("consume-rate-limit");
    return this.decision;
  }
}

class RecordingKeyHasher {
  constructor() {
    this.accountCalls = [];
  }

  hashAccount(accountIdentifier) {
    this.accountCalls.push(accountIdentifier);
    return ACCOUNT_KEY_HASH;
  }

  hashClientSource() {
    throw new Error(
      "application abuse control must receive a client-source hash",
    );
  }
}

class RecordingClock {
  constructor(now) {
    this.nowValue = now;
    this.calls = 0;
  }

  now() {
    this.calls += 1;
    return new Date(this.nowValue);
  }
}

test("registration rate consumption receives only opaque keys and the exact rolling window", async () => {
  const repository = new RecordingRepository();
  const clock = new RecordingClock(NOW);
  const configuredPolicy = policy();
  const keyHasher = new RecordingKeyHasher();
  const control = new AuthAbuseControl(
    repository,
    keyHasher,
    clock,
    configuredPolicy,
  );

  const now = await control.consumeRegistration("person@example.test", {
    clientSourceKeyHash: CLIENT_SOURCE_KEY_HASH,
    requestCorrelationId: REQUEST_CORRELATION_ID,
  });

  assert.deepEqual(now, NOW);
  assert.equal(clock.calls, 1);
  assert.deepEqual(keyHasher.accountCalls, ["person@example.test"]);
  assert.deepEqual(repository.consumeCalls, [
    {
      endpoint: "REGISTRATION",
      accountKeyHash: ACCOUNT_KEY_HASH,
      clientSourceKeyHash: CLIENT_SOURCE_KEY_HASH,
      accountLimit: 3,
      clientSourceLimit: 20,
      windowStart: new Date("2026-07-30T11:45:00.000Z"),
      now: NOW,
    },
  ]);
  assert.equal(
    JSON.stringify(repository.consumeCalls).includes("person@example.test"),
    false,
  );
});

test("noncanonical client source input does not reach the abuse repository", async () => {
  const repository = new RecordingRepository();
  const control = new AuthAbuseControl(
    repository,
    new RecordingKeyHasher(),
    new RecordingClock(NOW),
    policy(),
  );

  await assert.rejects(
    () =>
      control.consumeRegistration("person@example.test", {
        clientSourceKeyHash: "not-a-canonical-hash",
        requestCorrelationId: REQUEST_CORRELATION_ID,
      }),
    /canonical 43-character base64url HMAC digest/,
  );
  assert.deepEqual(repository.consumeCalls, []);
});

test("missing or malformed request correlation IDs do not reach abuse persistence", async () => {
  const repository = new RecordingRepository();
  const control = new AuthAbuseControl(
    repository,
    new RecordingKeyHasher(),
    new RecordingClock(NOW),
    policy(),
  );

  for (const requestCorrelationId of [
    undefined,
    "not-a-uuid",
    "550E8400-E29B-41D4-A716-446655440000",
  ]) {
    await assert.rejects(
      () =>
        control.consumeRegistration("person@example.test", {
          clientSourceKeyHash: CLIENT_SOURCE_KEY_HASH,
          requestCorrelationId,
        }),
      /canonical UUID/,
    );
  }
  assert.deepEqual(repository.consumeCalls, []);
});

test("registration rate rejection exposes only the typed application error", async () => {
  const repository = new RecordingRepository({
    status: "rejected",
    exceededDimensions: ["ACCOUNT"],
  });
  const control = new AuthAbuseControl(
    repository,
    new RecordingKeyHasher(),
    new RecordingClock(NOW),
    policy(),
  );

  await assert.rejects(
    () =>
      control.consumeRegistration("person@example.test", {
        clientSourceKeyHash: CLIENT_SOURCE_KEY_HASH,
        requestCorrelationId: REQUEST_CORRELATION_ID,
      }),
    AuthRateLimitExceededError,
  );
});

class ApplicationRepository extends RecordingRepository {
  constructor() {
    super();
    this.createIdentityCalls = [];
    this.passwordRecoveryCalls = [];
    this.reserveCalls = [];
    this.completeCalls = [];
    this.createSessionCalls = [];
    this.events = [];
    this.identities = new Map();
    this.resetSubject = null;
    this.refreshSubject = null;
    this.resetPasswordCalls = [];
    this.refreshSubjectCalls = [];
    this.resetSubjectCalls = [];
    this.rotateCalls = [];
    this.rotateResult = {
      status: "rotated",
      absoluteExpiresAt: new Date("2026-08-06T12:00:00.000Z"),
    };
  }

  async createIdentity(input) {
    this.createIdentityCalls.push(input);
    return { status: "created", userId: "user-1" };
  }

  async createPasswordRecovery(input) {
    this.passwordRecoveryCalls.push(input);
    return input.accountIdentifier === "known@example.test"
      ? { accountIdentifier: input.accountIdentifier }
      : null;
  }

  async findPasswordResetSubject(secretHash, now) {
    this.resetSubjectCalls.push({ secretHash, now });
    this.events.push("find-password-reset-subject");
    return this.resetSubject;
  }

  async resetPassword(input) {
    this.resetPasswordCalls.push(input);
    this.events.push("reset-password");
    return "reset";
  }

  async findRefreshSubject(refreshId, presentedTokenHash) {
    this.refreshSubjectCalls.push({ refreshId, presentedTokenHash });
    this.events.push("find-refresh-subject");
    return this.refreshSubject;
  }

  async rotateRefresh(input) {
    this.rotateCalls.push(input);
    this.events.push("rotate-refresh");
    return this.rotateResult;
  }

  async reserveLoginAttempt(input) {
    this.reserveCalls.push(input);
    if (this.reserveCalls.length > 10) return { status: "locked" };
    return {
      status: "reserved",
      attemptId: `attempt-${this.reserveCalls.length}`,
    };
  }

  async completeLoginSuccess(input) {
    this.completeCalls.push(input);
    this.events.push("complete-login-success");
  }

  async findIdentityWithCredential(accountIdentifier) {
    return this.identities.get(accountIdentifier) ?? null;
  }

  async updatePasswordHash() {}

  async createSessionFamily(input) {
    this.createSessionCalls.push(input);
    this.events.push("create-session-family");
    return "family-1";
  }
}

class PasswordHasher {
  constructor() {
    this.hashCalls = [];
    this.verifyCalls = [];
  }

  async hash(password) {
    this.hashCalls.push(password);
    this.events?.push("password-hash");
    return `hash:${password}`;
  }

  async verify(password, passwordHash) {
    this.verifyCalls.push([password, passwordHash]);
    return passwordHash === `hash:${password}`;
  }

  needsRehash() {
    return false;
  }
}

class SecretIssuer {
  constructor() {
    this.issueCalls = 0;
  }

  issue() {
    this.issueCalls += 1;
    return { secret: "secret", hash: "secret-hash" };
  }

  hash() {
    return "secret-hash";
  }
}

class Delivery {
  constructor() {
    this.calls = [];
  }

  async deliver(message) {
    this.calls.push(message);
  }
}

class CredentialIssuer {
  constructor(events) {
    this.next = 1;
    this.events = events;
    this.issueCalls = 0;
  }

  issue() {
    const id = `00000000-0000-4000-8000-${String(this.next).padStart(12, "0")}`;
    this.next += 1;
    this.issueCalls += 1;
    this.events?.push("issue-session");
    return {
      id,
      secret: "opaque-issued-secret",
      serialized: `serialized-${id}`,
      hash: `hash-${id}`,
    };
  }

  hash() {
    return "presented-token-hash";
  }
}

function policy() {
  return createAuthAbusePolicy({
    windowMs: 900_000,
    lockoutThreshold: 10,
    lockoutMs: 900_000,
    registration: { accountLimit: 3, clientSourceLimit: 20 },
    login: { accountLimit: 10, clientSourceLimit: 50 },
    passwordRecovery: { accountLimit: 3, clientSourceLimit: 20 },
    passwordReset: { accountLimit: 5, clientSourceLimit: 20 },
    refresh: { accountLimit: 60, clientSourceLimit: 200 },
  });
}

function context() {
  return {
    clientSourceKeyHash: CLIENT_SOURCE_KEY_HASH,
    requestCorrelationId: REQUEST_CORRELATION_ID,
  };
}

function abuseControl(repository, clock = new RecordingClock(NOW)) {
  return new AuthAbuseControl(
    repository,
    new RecordingKeyHasher(),
    clock,
    policy(),
  );
}

test("policy is immutable and rejects non-safe limit values", () => {
  const configuredPolicy = policy();

  assert.equal(Object.isFrozen(configuredPolicy), true);
  assert.equal(Object.isFrozen(configuredPolicy.login), true);
  assert.equal(Object.isFrozen(configuredPolicy.passwordReset), true);
  assert.equal(Object.isFrozen(configuredPolicy.refresh), true);
  assert.throws(
    () => createAuthAbusePolicy({ ...configuredPolicy, windowMs: 0 }),
    /positive safe integers/,
  );
});

test("registration validates before abuse control and rejects before password or secret work", async () => {
  const repository = new ApplicationRepository();
  repository.decision = { status: "rejected", exceededDimensions: ["ACCOUNT"] };
  const clock = new RecordingClock(NOW);
  const passwordHasher = new PasswordHasher();
  const secretIssuer = new SecretIssuer();
  const registration = new RegisterUser(
    repository,
    passwordHasher,
    clock,
    secretIssuer,
    new Delivery(),
    abuseControl(repository, clock),
    TEST_AUDIT_SERVICE,
  );

  await assert.rejects(
    () =>
      registration.execute(
        {
          accountIdentifier: "person@example.test",
          password: "twelve-char!",
        },
        context(),
      ),
    AuthRateLimitExceededError,
  );
  await assert.rejects(
    () =>
      registration.execute(
        {
          accountIdentifier: "malformed",
          password: "twelve-char!",
        },
        context(),
      ),
    InvalidRegistrationInputError,
  );
  assert.deepEqual(passwordHasher.hashCalls, []);
  assert.equal(secretIssuer.issueCalls, 0);
  assert.deepEqual(repository.createIdentityCalls, []);
  assert.equal(repository.consumeCalls.length, 1);
});

test("recovery rate-controls normalized, unknown, and malformed inputs before secret issuance", async () => {
  const repository = new ApplicationRepository();
  const clock = new RecordingClock(NOW);
  const secretIssuer = new SecretIssuer();
  const delivery = new Delivery();
  const recovery = new RequestPasswordRecovery(
    repository,
    secretIssuer,
    delivery,
    clock,
    abuseControl(repository, clock),
    TEST_AUDIT_SERVICE,
  );

  const known = await recovery.execute(
    { accountIdentifier: " KNOWN@EXAMPLE.TEST " },
    context(),
  );
  const unknown = await recovery.execute(
    { accountIdentifier: "unknown@example.test" },
    context(),
  );
  const malformed = await recovery.execute(
    { accountIdentifier: "malformed" },
    context(),
  );

  assert.deepEqual(known, { status: "accepted" });
  assert.deepEqual(unknown, known);
  assert.deepEqual(malformed, known);
  assert.equal(repository.consumeCalls.length, 3);
  assert.equal(secretIssuer.issueCalls, 3);
  assert.equal(delivery.calls.length, 1);
  assert.equal(
    JSON.stringify(repository.consumeCalls).includes("known@example.test"),
    false,
  );
  assert.equal(
    JSON.stringify(repository.consumeCalls).includes("unknown@example.test"),
    false,
  );
  assert.equal(
    JSON.stringify(repository.consumeCalls).includes("malformed"),
    false,
  );

  repository.decision = {
    status: "rejected",
    exceededDimensions: ["CLIENT_SOURCE"],
  };
  await assert.rejects(
    () =>
      recovery.execute({ accountIdentifier: "known@example.test" }, context()),
    AuthRateLimitExceededError,
  );
  assert.equal(secretIssuer.issueCalls, 3);
});

test("login reserves every valid attempt, leaves unknown and wrong reservations, and reconciles before session creation", async () => {
  const repository = new ApplicationRepository();
  const clock = new RecordingClock(NOW);
  const passwordHasher = new PasswordHasher();
  const login = new Login(
    repository,
    passwordHasher,
    new CredentialIssuer(),
    clock,
    abuseControl(repository, clock),
    TEST_AUDIT_SERVICE,
  );

  for (let count = 0; count < 10; count += 1) {
    await assert.rejects(
      () =>
        login.execute(
          {
            accountIdentifier: "unknown@example.test",
            password: "wrong-password",
          },
          context(),
        ),
      GenericAuthenticationError,
    );
  }
  await assert.rejects(
    () =>
      login.execute(
        {
          accountIdentifier: "unknown@example.test",
          password: "wrong-password",
        },
        context(),
      ),
    GenericAuthenticationError,
  );
  assert.equal(repository.reserveCalls.length, 11);
  assert.deepEqual(repository.completeCalls, []);
  assert.deepEqual(repository.reserveCalls[0], {
    endpoint: "LOGIN",
    accountKeyHash: ACCOUNT_KEY_HASH,
    clientSourceKeyHash: CLIENT_SOURCE_KEY_HASH,
    accountLimit: 10,
    clientSourceLimit: 50,
    windowStart: new Date("2026-07-30T11:45:00.000Z"),
    invalidCredentialsWindowStart: new Date("2026-07-30T11:45:00.000Z"),
    lockoutWindowStart: new Date("2026-07-30T11:45:00.000Z"),
    lockoutThreshold: 10,
    now: NOW,
  });

  repository.identities.set("person@example.test", {
    userId: "user-1",
    accountIdentifier: "person@example.test",
    verifiedAt: null,
    passwordHash: "hash:correct-password",
  });
  repository.reserveLoginAttempt = async (input) => {
    repository.reserveCalls.push(input);
    return { status: "reserved", attemptId: "reserved-attempt" };
  };
  await assert.rejects(
    () =>
      login.execute(
        {
          accountIdentifier: "person@example.test",
          password: "wrong-password",
        },
        context(),
      ),
    GenericAuthenticationError,
  );
  assert.deepEqual(repository.completeCalls, []);
  await login.execute(
    {
      accountIdentifier: "person@example.test",
      password: "correct-password",
    },
    context(),
  );

  assert.deepEqual(repository.events, [
    "complete-login-success",
    "create-session-family",
  ]);
  assert.deepEqual(repository.completeCalls, [
    { accountKeyHash: ACCOUNT_KEY_HASH },
  ]);
});

test("login rejects malformed input before reservation, hashing, or audit persistence while valid denied attempts audit once", async () => {
  const repository = new ApplicationRepository();
  const clock = new RecordingClock(NOW);
  const passwordHasher = new PasswordHasher();
  const auditEvents = [];
  const auditService = {
    async allowed() {},
    async denied(...event) {
      auditEvents.push(event);
    },
  };
  const login = new Login(
    repository,
    passwordHasher,
    new CredentialIssuer(),
    clock,
    abuseControl(repository, clock),
    auditService,
  );

  for (const credentials of [
    { accountIdentifier: "malformed", password: "valid-password" },
    { accountIdentifier: "person@example.test", password: "" },
    { accountIdentifier: "person@example.test", password: "😀".repeat(65) },
  ]) {
    await assert.rejects(
      () => login.execute(credentials, context()),
      GenericAuthenticationError,
    );
  }
  assert.deepEqual(repository.reserveCalls, []);
  assert.deepEqual(passwordHasher.hashCalls, []);
  assert.deepEqual(passwordHasher.verifyCalls, []);
  assert.deepEqual(auditEvents, []);

  repository.reserveLoginAttempt = async (input) => {
    repository.reserveCalls.push(input);
    return { status: "locked" };
  };
  await assert.rejects(
    () =>
      login.execute(
        {
          accountIdentifier: "person@example.test",
          password: "valid-password",
        },
        context(),
      ),
    GenericAuthenticationError,
  );

  assert.equal(repository.reserveCalls.length, 1);
  assert.deepEqual(auditEvents, [["LOGIN_DENIED", context()]]);
});

test("mandatory abuse and verification dependencies have no optional bypass", async () => {
  const repository = new ApplicationRepository();
  const clock = new RecordingClock(NOW);
  const passwordHasher = new PasswordHasher();
  const control = abuseControl(repository, clock);
  const registration = new RegisterUser(
    repository,
    passwordHasher,
    clock,
    new SecretIssuer(),
    new Delivery(),
    control,
    TEST_AUDIT_SERVICE,
  );

  repository.consumeRateLimit = async () => {
    throw new Error("rate sentinel");
  };
  await assert.rejects(
    () =>
      registration.execute(
        {
          accountIdentifier: "person@example.test",
          password: "twelve-char!",
        },
        context(),
      ),
    /rate sentinel/,
  );
});

test("reset and refresh consumption use subject-or-opaque synthetic account keys with exact policies", async () => {
  const repository = new RecordingRepository();
  const clock = new RecordingClock(NOW);
  const keyHasher = new RecordingKeyHasher();
  const control = new AuthAbuseControl(repository, keyHasher, clock, policy());

  await control.consumePasswordReset(
    "550e8400-e29b-41d4-a716-446655440000",
    "opaque-reset-secret-hash",
    context(),
    NOW,
  );
  await control.consumeRefresh(
    null,
    "00000000-0000-4000-8000-000000000001",
    context(),
    NOW,
  );

  assert.equal(clock.calls, 0);
  assert.deepEqual(keyHasher.accountCalls, [
    "password-reset-subject:550e8400-e29b-41d4-a716-446655440000",
    "refresh-subject:unknown:00000000-0000-4000-8000-000000000001",
  ]);
  assert.deepEqual(repository.consumeCalls, [
    {
      endpoint: "PASSWORD_RESET",
      accountKeyHash: ACCOUNT_KEY_HASH,
      clientSourceKeyHash: CLIENT_SOURCE_KEY_HASH,
      accountLimit: 5,
      clientSourceLimit: 20,
      windowStart: new Date("2026-07-30T11:45:00.000Z"),
      now: NOW,
    },
    {
      endpoint: "REFRESH",
      accountKeyHash: ACCOUNT_KEY_HASH,
      clientSourceKeyHash: CLIENT_SOURCE_KEY_HASH,
      accountLimit: 60,
      clientSourceLimit: 200,
      windowStart: new Date("2026-07-30T11:45:00.000Z"),
      now: NOW,
    },
  ]);
  assert.equal(
    JSON.stringify(repository.consumeCalls).includes(
      "opaque-reset-secret-hash",
    ),
    false,
  );
});

test("password reset resolves an opaque subject and rate-controls before password hashing", async () => {
  const repository = new ApplicationRepository();
  const clock = new RecordingClock(NOW);
  const passwordHasher = new PasswordHasher();
  passwordHasher.events = repository.events;
  repository.resetSubject = "550e8400-e29b-41d4-a716-446655440000";
  const reset = new ResetPassword(
    repository,
    passwordHasher,
    new SecretIssuer(),
    clock,
    abuseControl(repository, clock),
    TEST_AUDIT_SERVICE,
  );

  assert.deepEqual(
    await reset.execute(
      {
        secret: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        password: "twelve-char!",
      },
      context(),
    ),
    { status: "reset" },
  );

  assert.equal(clock.calls, 1);
  assert.deepEqual(repository.resetSubjectCalls, [
    { secretHash: "secret-hash", now: NOW },
  ]);
  assert.deepEqual(repository.events, [
    "find-password-reset-subject",
    "consume-rate-limit",
    "password-hash",
    "reset-password",
  ]);
  assert.deepEqual(passwordHasher.hashCalls, ["twelve-char!"]);
  assert.equal(
    JSON.stringify(repository.resetSubjectCalls).includes("AAAAAAAA"),
    false,
  );
});

test("password reset maps unknown credentials to its generic error after synthetic rate consumption and stops on rejection", async () => {
  const repository = new ApplicationRepository();
  const clock = new RecordingClock(NOW);
  const passwordHasher = new PasswordHasher();
  passwordHasher.events = repository.events;
  repository.resetPassword = async () => {
    repository.events.push("reset-password");
    return "invalid";
  };
  const keyHasher = new RecordingKeyHasher();
  const control = new AuthAbuseControl(repository, keyHasher, clock, policy());
  const reset = new ResetPassword(
    repository,
    passwordHasher,
    new SecretIssuer(),
    clock,
    control,
    TEST_AUDIT_SERVICE,
  );
  const resetRequest = {
    secret: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE",
    password: "twelve-char!",
  };

  await assert.rejects(
    () => reset.execute(resetRequest, context()),
    InvalidPasswordResetError,
  );
  assert.deepEqual(keyHasher.accountCalls, [
    "password-reset-subject:unknown:secret-hash",
  ]);
  assert.deepEqual(passwordHasher.hashCalls, ["twelve-char!"]);

  repository.decision = { status: "rejected", exceededDimensions: ["ACCOUNT"] };
  await assert.rejects(
    () => reset.execute(resetRequest, context()),
    AuthRateLimitExceededError,
  );
  assert.equal(passwordHasher.hashCalls.length, 1);
  assert.equal(
    repository.events.filter((event) => event === "reset-password").length,
    1,
  );
});

test("refresh resolves a subject and rate-controls before replacement session issuance", async () => {
  const repository = new ApplicationRepository();
  const clock = new RecordingClock(NOW);
  const credentialIssuer = new CredentialIssuer(repository.events);
  repository.refreshSubject = "550e8400-e29b-41d4-a716-446655440000";
  const refresh = new RefreshSession(
    repository,
    credentialIssuer,
    clock,
    abuseControl(repository, clock),
    TEST_AUDIT_SERVICE,
  );
  const presentedRefresh =
    "00000000-0000-4000-8000-000000000001.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

  await refresh.execute(
    {
      refreshCredential: presentedRefresh,
      csrfToken: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE",
    },
    context(),
  );

  assert.equal(clock.calls, 1);
  assert.deepEqual(repository.refreshSubjectCalls, [
    {
      refreshId: "00000000-0000-4000-8000-000000000001",
      presentedTokenHash: "presented-token-hash",
    },
  ]);
  assert.deepEqual(repository.events, [
    "find-refresh-subject",
    "consume-rate-limit",
    "issue-session",
    "issue-session",
    "issue-session",
    "rotate-refresh",
  ]);
  assert.equal(
    JSON.stringify(repository.refreshSubjectCalls).includes("AAAAAAAA"),
    false,
  );
});

test("refresh uses an opaque synthetic subject for unknown credentials, rejects before issuance, and preserves generic invalid failures", async () => {
  const repository = new ApplicationRepository();
  const clock = new RecordingClock(NOW);
  const credentialIssuer = new CredentialIssuer(repository.events);
  const keyHasher = new RecordingKeyHasher();
  const control = new AuthAbuseControl(repository, keyHasher, clock, policy());
  const refresh = new RefreshSession(
    repository,
    credentialIssuer,
    clock,
    control,
    TEST_AUDIT_SERVICE,
  );
  const refreshRequest = {
    refreshCredential:
      "00000000-0000-4000-8000-000000000001.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    csrfToken: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE",
  };

  repository.rotateResult = { status: "rejected" };
  await assert.rejects(
    () => refresh.execute(refreshRequest, context()),
    InvalidRefreshError,
  );
  assert.deepEqual(keyHasher.accountCalls, [
    "refresh-subject:unknown:00000000-0000-4000-8000-000000000001",
  ]);
  assert.equal(credentialIssuer.issueCalls, 3);

  repository.decision = {
    status: "rejected",
    exceededDimensions: ["CLIENT_SOURCE"],
  };
  await assert.rejects(
    () => refresh.execute(refreshRequest, context()),
    AuthRateLimitExceededError,
  );
  assert.equal(credentialIssuer.issueCalls, 3);
  assert.equal(repository.rotateCalls.length, 1);
});

test("reset and refresh subject-resolution and rate-control operational faults propagate without mutation or issuance", async () => {
  const resetRepository = new ApplicationRepository();
  const resetClock = new RecordingClock(NOW);
  const passwordHasher = new PasswordHasher();
  const reset = new ResetPassword(
    resetRepository,
    passwordHasher,
    new SecretIssuer(),
    resetClock,
    abuseControl(resetRepository, resetClock),
    TEST_AUDIT_SERVICE,
  );
  resetRepository.findPasswordResetSubject = async () => {
    throw new Error("reset subject sentinel");
  };

  await assert.rejects(
    () =>
      reset.execute(
        {
          secret: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
          password: "twelve-char!",
        },
        context(),
      ),
    /reset subject sentinel/,
  );
  assert.deepEqual(passwordHasher.hashCalls, []);
  assert.deepEqual(resetRepository.resetPasswordCalls, []);

  const refreshRepository = new ApplicationRepository();
  const refreshClock = new RecordingClock(NOW);
  const credentialIssuer = new CredentialIssuer(refreshRepository.events);
  const refresh = new RefreshSession(
    refreshRepository,
    credentialIssuer,
    refreshClock,
    abuseControl(refreshRepository, refreshClock),
    TEST_AUDIT_SERVICE,
  );
  refreshRepository.findRefreshSubject = async () => {
    throw new Error("refresh subject sentinel");
  };

  await assert.rejects(
    () =>
      refresh.execute(
        {
          refreshCredential:
            "00000000-0000-4000-8000-000000000001.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
          csrfToken: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE",
        },
        context(),
      ),
    /refresh subject sentinel/,
  );
  assert.equal(credentialIssuer.issueCalls, 0);
  assert.deepEqual(refreshRepository.rotateCalls, []);
});
