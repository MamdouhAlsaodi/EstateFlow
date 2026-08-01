import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaService } from "../dist/database/prisma.service.js";
import { PrismaAuthRepository } from "../dist/features/auth/infrastructure/prisma-auth.repository.js";
import { NodeCryptoOneTimeSecretIssuer } from "../dist/features/auth/infrastructure/node-crypto-one-time-secret-issuer.js";

const now = new Date("2026-07-30T12:00:00.000Z");
const absoluteExpiry = new Date("2026-08-06T12:00:00.000Z");
const idleExpiry = new Date("2026-07-31T12:00:00.000Z");
function requestCorrelation() {
  return randomUUID();
}

async function cleanAuthRecords(prisma) {
  await prisma.sessionFamily.deleteMany();
  await prisma.user.deleteMany();
}

async function createRefreshFixture(prisma) {
  const user = await prisma.user.create({
    data: { accountIdentifier: `user-${randomUUID()}@example.test` },
  });
  const family = await prisma.sessionFamily.create({
    data: { userId: user.id },
  });
  const refresh = await prisma.refreshSession.create({
    data: {
      id: randomUUID(),
      familyId: family.id,
      tokenHash: "presented-token-hash",
      csrfHash: "csrf-hash",
      issuedAt: now,
      lastUsedAt: now,
      absoluteExpiresAt: absoluteExpiry,
      idleExpiresAt: idleExpiry,
    },
  });
  return { family, refresh };
}

test("identity and session persistence use only hashes and enforce active-family access", async () => {
  const prisma = new PrismaService();
  const repository = new PrismaAuthRepository(prisma);
  const createdAt = new Date("2026-07-30T10:00:00.000Z");
  const accountIdentifier = `identity-${randomUUID()}@example.test`;
  const passwordHash = "argon2id$stored-password-hash";
  const rehash = "argon2id$rehash-only";
  const accessId = randomUUID();
  const refreshId = randomUUID();

  try {
    await prisma.$connect();
    await cleanAuthRecords(prisma);

    assert.deepEqual(
      await repository.createIdentity({
        accountIdentifier,
        passwordHash,
        now: createdAt,
        requestCorrelationId: requestCorrelation(),
      }),
      {
        status: "created",
        userId: (await repository.findIdentityWithCredential(accountIdentifier))
          .userId,
      },
    );
    assert.deepEqual(
      await repository.createIdentity({
        accountIdentifier,
        passwordHash,
        now: createdAt,
        requestCorrelationId: requestCorrelation(),
      }),
      { status: "exists" },
    );
    const identity =
      await repository.findIdentityWithCredential(accountIdentifier);
    assert.deepEqual(identity, {
      userId: identity.userId,
      accountIdentifier,
      verifiedAt: null,
      passwordHash,
    });

    const familyId = await repository.createSessionFamily({
      userId: identity.userId,
      now: createdAt,
      requestCorrelationId: requestCorrelation(),
      access: {
        id: accessId,
        tokenHash: "access-hash-only",
        csrfHash: "access-csrf-hash-only",
        issuedAt: createdAt,
        expiresAt: new Date("2026-07-30T10:15:00.000Z"),
      },
      refresh: {
        id: refreshId,
        tokenHash: "refresh-hash-only",
        csrfHash: "refresh-csrf-hash-only",
        issuedAt: createdAt,
        absoluteExpiresAt: new Date("2026-08-06T10:00:00.000Z"),
        idleExpiresAt: new Date("2026-07-31T10:00:00.000Z"),
      },
    });
    assert.equal(
      await prisma.accessSession
        .findUniqueOrThrow({ where: { id: accessId } })
        .then((record) => record.tokenHash),
      "access-hash-only",
    );
    assert.equal(
      await prisma.refreshSession
        .findUniqueOrThrow({ where: { id: refreshId } })
        .then((record) => record.tokenHash),
      "refresh-hash-only",
    );
    assert.deepEqual(
      await repository.findActiveAccessById(accessId, createdAt),
      {
        userId: identity.userId,
        familyId,
        accessSessionId: accessId,
        verified: false,
        tokenHash: "access-hash-only",
        csrfHash: "access-csrf-hash-only",
        expiresAt: new Date("2026-07-30T10:15:00.000Z"),
      },
    );

    await repository.updatePasswordHash(identity.userId, rehash, createdAt);
    assert.equal(
      (await repository.findIdentityWithCredential(accountIdentifier))
        .passwordHash,
      rehash,
    );
    await repository.revokeFamily({
      familyId,
      userId: identity.userId,
      reason: "LOGOUT",
      now: createdAt,
      requestCorrelationId: requestCorrelation(),
    });
    assert.equal(
      await repository.findActiveAccessById(accessId, createdAt),
      null,
    );
  } finally {
    await cleanAuthRecords(prisma);
    await prisma.$disconnect();
  }
});

test("refresh rotation rejects a wrong hash without mutation and handles concurrent replay", async () => {
  const prisma = new PrismaService();
  const repository = new PrismaAuthRepository(prisma);

  try {
    await prisma.$connect();
    await cleanAuthRecords(prisma);
    const { family, refresh } = await createRefreshFixture(prisma);
    const rotation = {
      presentedRefreshId: refresh.id,
      presentedTokenHash: refresh.tokenHash,
      presentedCsrfHash: refresh.csrfHash,
      now,
      nextRefresh: {
        id: randomUUID(),
        tokenHash: "next-token-hash",
        csrfHash: "next-csrf-hash",
        issuedAt: now,
        absoluteExpiresAt: new Date("2026-08-07T12:00:00.000Z"),
        idleExpiresAt: new Date("2026-08-07T12:00:00.000Z"),
      },
      requestCorrelationId: requestCorrelation(),
      nextAccess: {
        id: randomUUID(),
        tokenHash: "access-token-hash",
        csrfHash: "next-csrf-hash",
        issuedAt: now,
        expiresAt: new Date("2026-07-30T12:15:00.000Z"),
      },
    };
    const wrongHashRotation = {
      ...rotation,
      presentedTokenHash: "wrong-token-hash",
      nextRefresh: { ...rotation.nextRefresh, id: randomUUID() },
      nextAccess: { ...rotation.nextAccess, id: randomUUID() },
    };

    assert.equal(
      (await repository.rotateRefresh(wrongHashRotation)).status,
      "rejected",
    );
    const untouchedRefresh = await prisma.refreshSession.findUniqueOrThrow({
      where: { id: refresh.id },
    });
    const untouchedFamily = await prisma.sessionFamily.findUniqueOrThrow({
      where: { id: family.id },
    });
    assert.equal(untouchedRefresh.consumedAt, null);
    assert.equal(untouchedRefresh.replacedById, null);
    assert.equal(untouchedFamily.revokedAt, null);

    const wrongCsrfRotation = {
      ...rotation,
      presentedCsrfHash: "wrong-csrf-hash",
      nextRefresh: { ...rotation.nextRefresh, id: randomUUID() },
      nextAccess: { ...rotation.nextAccess, id: randomUUID() },
    };
    assert.equal(
      (await repository.rotateRefresh(wrongCsrfRotation)).status,
      "rejected",
    );
    const csrfUntouchedRefresh = await prisma.refreshSession.findUniqueOrThrow({
      where: { id: refresh.id },
    });
    const csrfUntouchedFamily = await prisma.sessionFamily.findUniqueOrThrow({
      where: { id: family.id },
    });
    assert.equal(csrfUntouchedRefresh.consumedAt, null);
    assert.equal(csrfUntouchedRefresh.replacedById, null);
    assert.equal(csrfUntouchedFamily.revokedAt, null);

    const concurrentRotation = {
      ...rotation,
      nextRefresh: { ...rotation.nextRefresh, id: randomUUID() },
      nextAccess: { ...rotation.nextAccess, id: randomUUID() },
    };
    const results = await Promise.all([
      repository.rotateRefresh(rotation),
      repository.rotateRefresh(concurrentRotation),
    ]);
    assert.deepEqual(results.map(({ status }) => status).sort(), [
      "replayed",
      "rotated",
    ]);
    assert.equal(
      results
        .find(({ status }) => status === "rotated")
        .absoluteExpiresAt.toISOString(),
      absoluteExpiry.toISOString(),
    );

    const persistedFamily = await prisma.sessionFamily.findUniqueOrThrow({
      where: { id: family.id },
    });
    const replacements = await prisma.refreshSession.findMany({
      where: {
        id: {
          in: [rotation.nextRefresh.id, concurrentRotation.nextRefresh.id],
        },
      },
    });
    assert.equal(persistedFamily.revokedReason, "REFRESH_REPLAY");
    assert.equal(replacements.length, 1);
    assert.equal(
      replacements[0].absoluteExpiresAt.toISOString(),
      absoluteExpiry.toISOString(),
    );
    assert.equal(
      replacements[0].idleExpiresAt.toISOString(),
      idleExpiry.toISOString(),
    );
  } finally {
    await cleanAuthRecords(prisma);
    await prisma.$disconnect();
  }
});

test("recovery and reset store hashes only, consume a reset once, update credentials, and revoke all active families", async () => {
  const prisma = new PrismaService();
  const repository = new PrismaAuthRepository(prisma);
  const issuer = new NodeCryptoOneTimeSecretIssuer("a".repeat(32));
  const accountIdentifier = `recovery-${randomUUID()}@example.test`;
  const verification = issuer.issue();
  const passwordReset = issuer.issue();
  const now = new Date("2026-07-30T12:00:00.000Z");
  const expiresAt = new Date("2026-07-30T12:15:00.000Z");

  try {
    await prisma.$connect();
    await cleanAuthRecords(prisma);
    const creation = await repository.createIdentity({
      accountIdentifier,
      passwordHash: "argon2id$original-password-hash",
      verificationSecretHash: verification.hash,
      verificationExpiresAt: expiresAt,
      now,
      requestCorrelationId: requestCorrelation(),
    });
    assert.equal(creation.status, "created");
    if (creation.status !== "created")
      throw new Error("Expected created identity");
    const verificationRecords = await prisma.emailVerification.findMany({
      where: { userId: creation.userId },
    });
    assert.equal(verificationRecords.length, 1);
    assert.equal(verificationRecords[0].secretHash, verification.hash);
    assert.notEqual(verificationRecords[0].secretHash, verification.secret);

    assert.deepEqual(
      await repository.createPasswordRecovery({
        accountIdentifier,
        secretHash: passwordReset.hash,
        now,
        expiresAt,
        requestCorrelationId: requestCorrelation(),
      }),
      { accountIdentifier },
    );
    assert.equal(
      await repository.createPasswordRecovery({
        accountIdentifier: "unknown@example.test",
        secretHash: issuer.issue().hash,
        now,
        expiresAt,
        requestCorrelationId: requestCorrelation(),
      }),
      null,
    );
    const resetRecords = await prisma.passwordReset.findMany({
      where: { userId: creation.userId },
    });
    assert.equal(resetRecords.length, 1);
    assert.equal(resetRecords[0].secretHash, passwordReset.hash);
    assert.notEqual(resetRecords[0].secretHash, passwordReset.secret);

    await prisma.sessionFamily.createMany({
      data: [{ userId: creation.userId }, { userId: creation.userId }],
    });
    const resetInput = {
      secretHash: passwordReset.hash,
      passwordHash: "argon2id$replacement-password-hash",
      now,
      requestCorrelationId: requestCorrelation(),
    };
    const statuses = await Promise.all([
      repository.resetPassword(resetInput),
      repository.resetPassword(resetInput),
    ]);
    assert.deepEqual(statuses.sort(), ["invalid", "reset"]);
    assert.equal(
      (
        await prisma.credential.findUniqueOrThrow({
          where: { userId: creation.userId },
        })
      ).passwordHash,
      "argon2id$replacement-password-hash",
    );
    assert.equal(
      await prisma.passwordReset.count({
        where: { userId: creation.userId, consumedAt: null },
      }),
      0,
    );
    assert.equal(
      await prisma.sessionFamily.count({
        where: { userId: creation.userId, revokedAt: null },
      }),
      0,
    );
    assert.equal(
      await prisma.sessionFamily.count({
        where: { userId: creation.userId, revokedReason: "PASSWORD_RESET" },
      }),
      2,
    );
  } finally {
    await cleanAuthRecords(prisma);
    await prisma.$disconnect();
  }
});

async function cleanAbuseRecords(prisma) {
  await prisma.authRateLimitEvent.deleteMany();
  await prisma.authAttempt.deleteMany();
}

function createKeyHash() {
  return createHash("sha256").update(randomUUID()).digest("base64url");
}

function abuseRateInput(overrides = {}) {
  return {
    endpoint: "LOGIN",
    accountKeyHash: createKeyHash(),
    clientSourceKeyHash: createKeyHash(),
    accountLimit: 10,
    clientSourceLimit: 10,
    windowStart: new Date(Date.now() - 15 * 60 * 1000),
    now: new Date(),
    ...overrides,
  };
}

function abuseReservationInput(overrides = {}) {
  const rate = abuseRateInput(overrides);
  return {
    ...rate,
    invalidCredentialsWindowStart: rate.windowStart,
    lockoutWindowStart: rate.windowStart,
    lockoutThreshold: 10,
    ...overrides,
  };
}

test("rate persistence isolates endpoints and dimensions", async () => {
  const prisma = new PrismaService();
  const repository = new PrismaAuthRepository(prisma);
  const clientSourceKeyHash = createKeyHash();

  try {
    await prisma.$connect();
    await cleanAbuseRecords(prisma);
    const first = abuseRateInput({ clientSourceKeyHash, clientSourceLimit: 1 });
    const sameSourceOtherAccount = abuseRateInput({
      accountKeyHash: createKeyHash(),
      clientSourceKeyHash,
      clientSourceLimit: 1,
    });

    assert.equal((await repository.consumeRateLimit(first)).status, "allowed");
    assert.deepEqual(
      await repository.consumeRateLimit(sameSourceOtherAccount),
      {
        status: "rejected",
        exceededDimensions: ["CLIENT_SOURCE"],
      },
    );
    assert.equal(
      (await repository.consumeRateLimit({ ...first, endpoint: "REFRESH" }))
        .status,
      "allowed",
    );
  } finally {
    await cleanAbuseRecords(prisma);
    await prisma.$disconnect();
  }
});

test("concurrent rate consumption cannot exceed its account limit", async () => {
  const prisma = new PrismaService();
  const repository = new PrismaAuthRepository(prisma);

  try {
    await prisma.$connect();
    await cleanAbuseRecords(prisma);
    const input = abuseRateInput({ accountLimit: 5, clientSourceLimit: 20 });
    const results = await Promise.all(
      Array.from({ length: 8 }, () => repository.consumeRateLimit(input)),
    );

    assert.equal(
      results.filter(({ status }) => status === "allowed").length,
      5,
    );
    assert.equal(
      results.filter(({ status }) => status === "rejected").length,
      3,
    );
  } finally {
    await cleanAbuseRecords(prisma);
    await prisma.$disconnect();
  }
});

test("concurrent reservations create one fixed lock marker and successful reconciliation clears only attempts", async () => {
  const prisma = new PrismaService();
  const repository = new PrismaAuthRepository(prisma);

  try {
    await prisma.$connect();
    await cleanAbuseRecords(prisma);
    const input = abuseReservationInput({
      accountLimit: 20,
      clientSourceLimit: 20,
    });
    const results = await Promise.all(
      Array.from({ length: 10 }, () => repository.reserveLoginAttempt(input)),
    );
    assert.equal(
      results.filter(({ status }) => status === "reserved").length,
      10,
    );
    assert.equal(
      await prisma.authAttempt.count({
        where: {
          accountKeyHash: input.accountKeyHash,
          reason: "INVALID_CREDENTIALS",
        },
      }),
      10,
    );
    const marker = await prisma.authAttempt.findFirstOrThrow({
      where: { accountKeyHash: input.accountKeyHash, reason: "ACCOUNT_LOCKED" },
    });
    assert.deepEqual(
      await repository.reserveLoginAttempt({ ...input, now: new Date() }),
      { status: "locked" },
    );
    assert.equal(
      await prisma.authAttempt.count({
        where: {
          accountKeyHash: input.accountKeyHash,
          reason: "ACCOUNT_LOCKED",
        },
      }),
      1,
    );
    assert.equal(
      (
        await prisma.authAttempt.findFirstOrThrow({ where: { id: marker.id } })
      ).createdAt.toISOString(),
      marker.createdAt.toISOString(),
    );

    const rateEventCount = await prisma.authRateLimitEvent.count({
      where: { keyHash: input.accountKeyHash },
    });
    await repository.completeLoginSuccess({
      accountKeyHash: input.accountKeyHash,
    });
    assert.equal(
      await prisma.authAttempt.count({
        where: { accountKeyHash: input.accountKeyHash },
      }),
      0,
    );
    assert.equal(
      await prisma.authRateLimitEvent.count({
        where: { keyHash: input.accountKeyHash },
      }),
      rateEventCount,
    );
  } finally {
    await cleanAbuseRecords(prisma);
    await prisma.$disconnect();
  }
});

test("subject resolution attributes eligible resets and replayed refreshes while reset and refresh limits remain endpoint-independent", async () => {
  const prisma = new PrismaService();
  const repository = new PrismaAuthRepository(prisma);
  const accountIdentifier = `subject-${randomUUID()}@example.test`;
  const resetSecretHash = "opaque-reset-subject-hash";
  const refreshTokenHash = "opaque-refresh-subject-hash";

  try {
    await prisma.$connect();
    await cleanAuthRecords(prisma);
    await cleanAbuseRecords(prisma);
    const user = await prisma.user.create({ data: { accountIdentifier } });
    const passwordReset = await prisma.passwordReset.create({
      data: {
        userId: user.id,
        secretHash: resetSecretHash,
        createdAt: now,
        expiresAt: new Date("2026-07-30T12:15:00.000Z"),
      },
    });
    const family = await prisma.sessionFamily.create({
      data: { userId: user.id },
    });
    const refresh = await prisma.refreshSession.create({
      data: {
        id: randomUUID(),
        familyId: family.id,
        tokenHash: refreshTokenHash,
        csrfHash: "opaque-csrf-hash",
        issuedAt: now,
        lastUsedAt: now,
        absoluteExpiresAt: absoluteExpiry,
        idleExpiresAt: idleExpiry,
      },
    });

    assert.equal(
      await repository.findPasswordResetSubject(resetSecretHash, now),
      user.id,
    );
    assert.equal(
      await repository.findPasswordResetSubject("wrong-reset-hash", now),
      null,
    );
    await prisma.passwordReset.update({
      where: { id: passwordReset.id },
      data: { consumedAt: now },
    });
    assert.equal(
      await repository.findPasswordResetSubject(resetSecretHash, now),
      null,
    );

    assert.equal(
      await repository.findRefreshSubject(refresh.id, refreshTokenHash),
      user.id,
    );
    assert.equal(
      await repository.findRefreshSubject(refresh.id, "wrong-refresh-hash"),
      null,
    );
    await prisma.refreshSession.update({
      where: { id: refresh.id },
      data: {
        consumedAt: now,
        revokedAt: now,
        idleExpiresAt: now,
        absoluteExpiresAt: now,
      },
    });
    assert.equal(
      await repository.findRefreshSubject(refresh.id, refreshTokenHash),
      user.id,
    );

    const accountKeyHash = createKeyHash();
    const clientSourceKeyHash = createKeyHash();
    const rateInput = abuseRateInput({
      accountKeyHash,
      clientSourceKeyHash,
      accountLimit: 1,
      clientSourceLimit: 1,
    });
    assert.equal(
      (
        await repository.consumeRateLimit({
          ...rateInput,
          endpoint: "PASSWORD_RESET",
        })
      ).status,
      "allowed",
    );
    assert.equal(
      (
        await repository.consumeRateLimit({
          ...rateInput,
          endpoint: "REFRESH",
        })
      ).status,
      "allowed",
    );
  } finally {
    await cleanAbuseRecords(prisma);
    await cleanAuthRecords(prisma);
    await prisma.$disconnect();
  }
});

test("security audit persistence stores allowed and denied events without sensitive fields", async () => {
  const prisma = new PrismaService();
  const repository = new PrismaAuthRepository(prisma);
  const subjectId = randomUUID();
  const requestCorrelationId = randomUUID();
  const createdAt = new Date("2026-07-30T12:00:00.000Z");

  try {
    await prisma.$connect();
    await prisma.securityAuditEvent.deleteMany();
    await repository.createSecurityAuditEvent({
      subjectId,
      outcome: "ALLOWED",
      reason: "LOGIN_ALLOWED",
      requestCorrelationId,
      now: createdAt,
    });
    await repository.createSecurityAuditEvent({
      subjectId: null,
      outcome: "DENIED",
      reason: "LOGIN_DENIED",
      requestCorrelationId,
      now: createdAt,
    });

    const auditEvents = await prisma.securityAuditEvent.findMany({
      orderBy: { createdAt: "asc" },
    });
    assert.deepEqual(
      auditEvents.map(
        ({
          subjectId: persistedSubjectId,
          outcome,
          reason,
          requestCorrelationId: persistedCorrelationId,
          createdAt: persistedAt,
        }) => ({
          subjectId: persistedSubjectId,
          outcome,
          reason,
          requestCorrelationId: persistedCorrelationId,
          createdAt: persistedAt,
        }),
      ),
      [
        {
          subjectId,
          outcome: "ALLOWED",
          reason: "LOGIN_ALLOWED",
          requestCorrelationId,
          createdAt,
        },
        {
          subjectId: null,
          outcome: "DENIED",
          reason: "LOGIN_DENIED",
          requestCorrelationId,
          createdAt,
        },
      ],
    );
    assert.deepEqual(Object.keys(auditEvents[0]).sort(), [
      "createdAt",
      "id",
      "outcome",
      "reason",
      "requestCorrelationId",
      "subjectId",
    ]);
    assert.equal(
      JSON.stringify(auditEvents).includes("person@example.test"),
      false,
    );
    assert.equal(JSON.stringify(auditEvents).includes("raw-password"), false);
    assert.equal(JSON.stringify(auditEvents).includes("raw-token"), false);
  } finally {
    await prisma.securityAuditEvent.deleteMany();
    await prisma.$disconnect();
  }
});

test("transactional audit write failure rolls back the identity mutation without a partial audit row", async () => {
  const prisma = new PrismaService();
  const auditFailure = new Error("forced audit persistence failure");
  const failingPrisma = prisma.$extends({
    query: {
      securityAuditEvent: {
        create() {
          throw auditFailure;
        },
      },
    },
  });
  const repository = new PrismaAuthRepository(failingPrisma);
  const accountIdentifier = `rollback-${randomUUID()}@example.test`;

  try {
    await prisma.$connect();
    await cleanAuthRecords(prisma);
    await prisma.securityAuditEvent.deleteMany();
    await assert.rejects(
      () =>
        repository.createIdentity({
          accountIdentifier,
          passwordHash: "argon2id$rollback-password-hash",
          now,
          requestCorrelationId: requestCorrelation(),
        }),
      (error) => error === auditFailure,
    );
    assert.equal(await prisma.user.count({ where: { accountIdentifier } }), 0);
    assert.equal(await prisma.securityAuditEvent.count(), 0);
  } finally {
    await cleanAuthRecords(prisma);
    await prisma.securityAuditEvent.deleteMany();
    await prisma.$disconnect();
  }
});
