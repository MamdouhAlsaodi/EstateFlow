import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import { FixedClock } from "../dist/features/auth/application/clock.js";
import { RegisterUser } from "../dist/features/auth/application/register-user.js";
import { RequestPasswordRecovery } from "../dist/features/auth/application/request-password-recovery.js";
import { ResetPassword } from "../dist/features/auth/application/reset-password.js";
import { InvalidPasswordResetError } from "../dist/features/auth/domain/auth-errors.js";
import { NodeCryptoOneTimeSecretIssuer } from "../dist/features/auth/infrastructure/node-crypto-one-time-secret-issuer.js";

const NOW = new Date("2026-07-30T12:00:00.000Z");
const FIFTEEN_MINUTES_LATER = new Date("2026-07-30T12:15:00.000Z");
const secret = (byte) => Buffer.alloc(32, byte).toString("base64url");
const TEST_CONTEXT = {
  clientSourceKeyHash: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE",
  requestCorrelationId: "550e8400-e29b-41d4-a716-446655440000",
};
const TEST_AUDIT_SERVICE = { async allowed() {}, async denied() {} };
const TEST_ABUSE_CONTROL = {
  async consumeRegistration() {
    return NOW;
  },
  async consumePasswordRecovery() {
    return NOW;
  },
  async consumePasswordReset() {},
};

class FakePasswordHasher {
  constructor() {
    this.hashCalls = [];
  }

  async hash(password) {
    this.hashCalls.push(password);
    return `password-hash:${password}`;
  }

  async verify() {
    return false;
  }
  needsRehash() {
    return false;
  }
}

class FakeOneTimeSecretIssuer {
  constructor() {
    this.next = 1;
    this.issueCalls = 0;
  }

  issue() {
    this.issueCalls += 1;
    const rawSecret = secret(this.next++);
    return { secret: rawSecret, hash: this.hash(rawSecret) };
  }

  hash(rawSecret) {
    return `one-time-hash:${Buffer.from(rawSecret).toString("hex")}`;
  }

  matches(rawSecret, expectedHash) {
    return this.hash(rawSecret) === expectedHash;
  }
}

class RecordingDelivery {
  constructor() {
    this.deliveries = [];
  }

  async deliver(delivery) {
    this.deliveries.push(delivery);
  }
}

class FakeAuthRepository {
  constructor() {
    this.identities = new Map();
    this.createIdentityCalls = [];
    this.passwordRecoveryCalls = [];
    this.passwordResets = [];
    this.resetPasswordCalls = [];
    this.families = [];
  }

  async createIdentity(input) {
    this.createIdentityCalls.push(input);
    if (this.identities.has(input.accountIdentifier))
      return { status: "exists" };
    const userId = `user-${this.identities.size + 1}`;
    this.identities.set(input.accountIdentifier, {
      userId,
      accountIdentifier: input.accountIdentifier,
      passwordHash: input.passwordHash,
      verifiedAt: null,
    });
    this.emailVerification = {
      userId,
      secretHash: input.verificationSecretHash,
      expiresAt: input.verificationExpiresAt,
    };
    return { status: "created", userId };
  }

  async createPasswordRecovery(input) {
    this.passwordRecoveryCalls.push(input);
    const identity =
      input.accountIdentifier && this.identities.get(input.accountIdentifier);
    if (!identity) return null;
    this.passwordResets.push({
      userId: identity.userId,
      secretHash: input.secretHash,
      expiresAt: input.expiresAt,
      consumedAt: null,
    });
    return { accountIdentifier: identity.accountIdentifier };
  }

  async findPasswordResetSubject(secretHash, now) {
    const passwordReset = this.passwordResets.find(
      (candidate) =>
        candidate.secretHash === secretHash &&
        candidate.consumedAt === null &&
        candidate.expiresAt > now,
    );
    return passwordReset?.userId ?? null;
  }

  async resetPassword(input) {
    this.resetPasswordCalls.push(input);
    const passwordReset = this.passwordResets.find(
      (candidate) =>
        candidate.secretHash === input.secretHash &&
        candidate.consumedAt === null &&
        candidate.expiresAt > input.now,
    );
    if (!passwordReset) return "invalid";
    passwordReset.consumedAt = input.now;
    for (const candidate of this.passwordResets) {
      if (
        candidate.userId === passwordReset.userId &&
        candidate.consumedAt === null
      ) {
        candidate.consumedAt = input.now;
      }
    }
    const identity = [...this.identities.values()].find(
      (candidate) => candidate.userId === passwordReset.userId,
    );
    identity.passwordHash = input.passwordHash;
    identity.passwordChangedAt = input.now;
    for (const family of this.families) {
      if (family.userId === passwordReset.userId && family.revokedAt === null) {
        family.revokedAt = input.now;
        family.revokedReason = "PASSWORD_RESET";
      }
    }
    return "reset";
  }
}

function subject() {
  const repository = new FakeAuthRepository();
  const passwordHasher = new FakePasswordHasher();
  const oneTimeSecretIssuer = new FakeOneTimeSecretIssuer();
  const verificationDelivery = new RecordingDelivery();
  const passwordRecoveryDelivery = new RecordingDelivery();
  const clock = new FixedClock(NOW);
  return {
    repository,
    passwordHasher,
    oneTimeSecretIssuer,
    verificationDelivery,
    passwordRecoveryDelivery,
    clock,
  };
}

function validPassword() {
  return "twelve-char!";
}

test("one-time issuer emits canonical 32-byte secrets and HMAC hashes without accepting a wrong-length hash", () => {
  const issuer = new NodeCryptoOneTimeSecretIssuer("a".repeat(32));
  const issued = issuer.issue();

  assert.match(issued.secret, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(issued.secret, "base64url").length, 32);
  assert.equal(issued.hash.includes(issued.secret), false);
  assert.equal(issuer.matches(issued.secret, issued.hash), true);
  assert.equal(issuer.matches(issued.secret, "wrong-length"), false);
  assert.throws(
    () => new NodeCryptoOneTimeSecretIssuer("too-short"),
    /32 UTF-8 bytes/,
  );
});

test("registration delivers a 15-minute verification only after first creation and never returns its secret", async () => {
  const dependencies = subject();
  const registerUser = new RegisterUser(
    dependencies.repository,
    dependencies.passwordHasher,
    dependencies.clock,
    dependencies.oneTimeSecretIssuer,
    dependencies.verificationDelivery,
    TEST_ABUSE_CONTROL,
    TEST_AUDIT_SERVICE,
  );

  const firstResponse = await registerUser.execute(
    {
      accountIdentifier: "PERSON@EXAMPLE.TEST",
      password: validPassword(),
    },
    TEST_CONTEXT,
  );
  const duplicateResponse = await registerUser.execute(
    {
      accountIdentifier: "person@example.test",
      password: validPassword(),
    },
    TEST_CONTEXT,
  );

  assert.deepEqual(firstResponse, { status: "accepted" });
  assert.deepEqual(duplicateResponse, { status: "accepted" });
  assert.equal(
    JSON.stringify(firstResponse).includes(
      dependencies.verificationDelivery.deliveries[0].secret,
    ),
    false,
  );
  assert.equal(dependencies.passwordHasher.hashCalls.length, 2);
  assert.equal(dependencies.oneTimeSecretIssuer.issueCalls, 2);
  assert.equal(dependencies.verificationDelivery.deliveries.length, 1);
  assert.equal(
    dependencies.verificationDelivery.deliveries[0].accountIdentifier,
    "person@example.test",
  );
  assert.deepEqual(
    dependencies.verificationDelivery.deliveries[0].expiresAt,
    FIFTEEN_MINUTES_LATER,
  );
  assert.equal(
    dependencies.repository.createIdentityCalls[0].verificationSecretHash,
    dependencies.oneTimeSecretIssuer.hash(
      dependencies.verificationDelivery.deliveries[0].secret,
    ),
  );
  assert.equal(
    JSON.stringify(dependencies.repository.createIdentityCalls).includes(
      dependencies.verificationDelivery.deliveries[0].secret,
    ),
    false,
  );
});

test("password recovery has one generic response, persists a hash only for known identities, and delivers only there", async () => {
  const dependencies = subject();
  const registerUser = new RegisterUser(
    dependencies.repository,
    dependencies.passwordHasher,
    dependencies.clock,
    dependencies.oneTimeSecretIssuer,
    dependencies.verificationDelivery,
    TEST_ABUSE_CONTROL,
    TEST_AUDIT_SERVICE,
  );
  await registerUser.execute(
    { accountIdentifier: "person@example.test", password: validPassword() },
    TEST_CONTEXT,
  );
  const recovery = new RequestPasswordRecovery(
    dependencies.repository,
    dependencies.oneTimeSecretIssuer,
    dependencies.passwordRecoveryDelivery,
    dependencies.clock,
    TEST_ABUSE_CONTROL,
    TEST_AUDIT_SERVICE,
  );

  const known = await recovery.execute(
    { accountIdentifier: " PERSON@EXAMPLE.TEST " },
    TEST_CONTEXT,
  );
  const unknown = await recovery.execute(
    { accountIdentifier: "unknown@example.test" },
    TEST_CONTEXT,
  );
  const malformed = await recovery.execute(
    { accountIdentifier: "malformed" },
    TEST_CONTEXT,
  );

  assert.deepEqual(known, { status: "accepted" });
  assert.deepEqual(unknown, known);
  assert.deepEqual(malformed, known);
  assert.equal(dependencies.oneTimeSecretIssuer.issueCalls, 4);
  assert.equal(dependencies.repository.passwordRecoveryCalls.length, 3);
  assert.equal(dependencies.passwordRecoveryDelivery.deliveries.length, 1);
  assert.deepEqual(
    dependencies.passwordRecoveryDelivery.deliveries[0].expiresAt,
    FIFTEEN_MINUTES_LATER,
  );
  const persistedReset = dependencies.repository.passwordResets[0];
  assert.equal(
    persistedReset.secretHash,
    dependencies.oneTimeSecretIssuer.hash(
      dependencies.passwordRecoveryDelivery.deliveries[0].secret,
    ),
  );
  assert.equal(
    JSON.stringify(persistedReset).includes(
      dependencies.passwordRecoveryDelivery.deliveries[0].secret,
    ),
    false,
  );
});

test("password reset maps malformed and invalid secrets to one error while a valid reset updates credentials and revokes every active family", async () => {
  const dependencies = subject();
  const registerUser = new RegisterUser(
    dependencies.repository,
    dependencies.passwordHasher,
    dependencies.clock,
    dependencies.oneTimeSecretIssuer,
    dependencies.verificationDelivery,
    TEST_ABUSE_CONTROL,
    TEST_AUDIT_SERVICE,
  );
  await registerUser.execute(
    { accountIdentifier: "person@example.test", password: validPassword() },
    TEST_CONTEXT,
  );
  const recovery = new RequestPasswordRecovery(
    dependencies.repository,
    dependencies.oneTimeSecretIssuer,
    dependencies.passwordRecoveryDelivery,
    dependencies.clock,
    TEST_ABUSE_CONTROL,
    TEST_AUDIT_SERVICE,
  );
  await recovery.execute(
    { accountIdentifier: "person@example.test" },
    TEST_CONTEXT,
  );
  const reset = new ResetPassword(
    dependencies.repository,
    dependencies.passwordHasher,
    dependencies.oneTimeSecretIssuer,
    dependencies.clock,
    TEST_ABUSE_CONTROL,
    TEST_AUDIT_SERVICE,
  );
  const rawSecret = dependencies.passwordRecoveryDelivery.deliveries[0].secret;
  await recovery.execute(
    { accountIdentifier: "person@example.test" },
    TEST_CONTEXT,
  );
  const expiredSecret =
    dependencies.passwordRecoveryDelivery.deliveries[1].secret;
  dependencies.repository.passwordResets[1].expiresAt = NOW;
  dependencies.repository.families.push(
    { userId: "user-1", revokedAt: null },
    { userId: "user-1", revokedAt: null },
  );

  for (const input of [
    { secret: "malformed", password: validPassword() },
    { secret: secret(99), password: validPassword() },
    { secret: expiredSecret, password: validPassword() },
  ]) {
    await assert.rejects(
      () => reset.execute(input, TEST_CONTEXT),
      InvalidPasswordResetError,
    );
  }
  assert.deepEqual(
    await reset.execute(
      { secret: rawSecret, password: "new-password!" },
      TEST_CONTEXT,
    ),
    { status: "reset" },
  );
  await assert.rejects(
    () =>
      reset.execute(
        { secret: rawSecret, password: validPassword() },
        TEST_CONTEXT,
      ),
    InvalidPasswordResetError,
  );
  assert.equal(
    dependencies.repository.identities.get("person@example.test").passwordHash,
    "password-hash:new-password!",
  );
  assert.deepEqual(
    dependencies.repository.families.map(({ revokedReason }) => revokedReason),
    ["PASSWORD_RESET", "PASSWORD_RESET"],
  );
  assert.equal(dependencies.repository.resetPasswordCalls.length, 4);
});

test("password reset leaves repository operational failures visible", async () => {
  const dependencies = subject();
  dependencies.repository.resetPassword = async () => {
    throw new Error("repository sentinel");
  };
  const reset = new ResetPassword(
    dependencies.repository,
    dependencies.passwordHasher,
    dependencies.oneTimeSecretIssuer,
    dependencies.clock,
    TEST_ABUSE_CONTROL,
    TEST_AUDIT_SERVICE,
  );

  await assert.rejects(
    () =>
      reset.execute(
        { secret: secret(1), password: validPassword() },
        TEST_CONTEXT,
      ),
    /repository sentinel/,
  );
});
