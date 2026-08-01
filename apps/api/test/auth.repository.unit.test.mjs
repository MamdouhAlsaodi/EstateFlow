import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import test from "node:test";
import { PrismaAuthRepository } from "../dist/features/auth/infrastructure/prisma-auth.repository.js";

const now = new Date("2026-07-30T12:00:00.000Z");
const requestCorrelationId = "550e8400-e29b-41d4-a716-446655440000";
const userId = "9a30f920-575f-4bdb-884c-227109705728";
const access = {
  id: "a5501c01-1ac7-4a5b-b560-5721194e0c90",
  tokenHash: "access-token-hash",
  csrfHash: "access-csrf-hash",
  issuedAt: now,
  expiresAt: new Date("2026-07-30T12:15:00.000Z"),
};
const refresh = {
  id: "a5501c01-1ac7-4a5b-b560-5721194e0c91",
  tokenHash: "refresh-token-hash",
  csrfHash: "refresh-csrf-hash",
  issuedAt: now,
  absoluteExpiresAt: new Date("2026-08-06T12:00:00.000Z"),
  idleExpiresAt: new Date("2026-07-31T12:00:00.000Z"),
};

function createPrismaFake(overrides = {}) {
  const calls = [];
  const transaction = {
    user: {
      create: async (args) => {
        calls.push(["user.create", args]);
        return { id: userId };
      },
      findUnique: async (args) => {
        calls.push(["user.findUnique", args]);
        return null;
      },
    },
    credential: {
      update: async (args) => {
        calls.push(["credential.update", args]);
      },
    },
    sessionFamily: {
      create: async (args) => {
        calls.push(["sessionFamily.create", args]);
        return { id: "family-id" };
      },
    },
    accessSession: {
      findFirst: async (args) => {
        calls.push(["accessSession.findFirst", args]);
        return null;
      },
    },
    securityAuditEvent: { create: async () => {} },
    ...overrides.transaction,
  };
  const prisma = {
    $transaction: async (operation) => {
      calls.push(["$transaction"]);
      return operation(transaction);
    },
    ...transaction,
    ...overrides.prisma,
  };
  return { calls, prisma };
}

function knownRequestError(code, target) {
  return new Prisma.PrismaClientKnownRequestError("constraint", {
    code,
    clientVersion: "test",
    meta: { target },
  });
}

test("identity creation writes its registration audit event through the same transaction", async () => {
  const { calls, prisma } = createPrismaFake({
    transaction: {
      securityAuditEvent: {
        create: async (args) => {
          calls.push(["securityAuditEvent.create", args]);
        },
      },
    },
  });
  const repository = new PrismaAuthRepository(prisma);

  const result = await repository.createIdentity({
    accountIdentifier: "person@example.test",
    passwordHash: "argon2id$hashed-password",
    now,
    requestCorrelationId,
  });

  assert.deepEqual(result, { status: "created", userId });
  assert.deepEqual(calls, [
    ["$transaction"],
    [
      "user.create",
      {
        data: {
          accountIdentifier: "person@example.test",
          createdAt: now,
          credential: {
            create: {
              passwordHash: "argon2id$hashed-password",
              passwordChangedAt: now,
            },
          },
        },
        select: { id: true },
      },
    ],
    [
      "securityAuditEvent.create",
      {
        data: {
          subjectId: userId,
          outcome: "ALLOWED",
          reason: "REGISTRATION_ACCEPTED",
          requestCorrelationId,
          createdAt: now,
        },
      },
    ],
  ]);
  assert.equal(JSON.stringify(calls).includes("raw-password"), false);
});

test("identity creation returns exists only for the User account identifier conflict", async () => {
  const expectedConflict = knownRequestError("P2002", ["accountIdentifier"]);
  const { prisma } = createPrismaFake({
    transaction: {
      user: {
        create: async () => {
          throw expectedConflict;
        },
      },
    },
  });
  const repository = new PrismaAuthRepository(prisma);

  assert.deepEqual(
    await repository.createIdentity({
      accountIdentifier: "person@example.test",
      passwordHash: "argon2id$hashed-password",
      now,
      requestCorrelationId,
    }),
    { status: "exists" },
  );

  for (const error of [
    knownRequestError("P2002", ["tokenHash"]),
    knownRequestError("P2003", ["accountIdentifier"]),
    new Error("connection failure"),
  ]) {
    const failingRepository = new PrismaAuthRepository(
      createPrismaFake({
        transaction: {
          user: {
            create: async () => {
              throw error;
            },
          },
        },
      }).prisma,
    );
    await assert.rejects(
      () =>
        failingRepository.createIdentity({
          accountIdentifier: "person@example.test",
          passwordHash: "argon2id$hashed-password",
          now,
          requestCorrelationId,
        }),
      (received) => received === error,
    );
  }
});

test("identity lookup returns credential data and password rehash updates the credential only", async () => {
  const { calls, prisma } = createPrismaFake({
    transaction: {
      user: {
        findUnique: async (args) => {
          calls.push(["user.findUnique", args]);
          return {
            id: userId,
            accountIdentifier: "person@example.test",
            verifiedAt: new Date("2026-07-29T12:00:00.000Z"),
            platformRole: "NONE",
            credential: { passwordHash: "stored-password-hash" },
          };
        },
      },
    },
  });
  const repository = new PrismaAuthRepository(prisma);

  assert.deepEqual(
    await repository.findIdentityWithCredential("person@example.test"),
    {
      userId: userId,
      accountIdentifier: "person@example.test",
      verifiedAt: new Date("2026-07-29T12:00:00.000Z"),
      platformRole: "NONE",
      passwordHash: "stored-password-hash",
    },
  );
  await repository.updatePasswordHash(userId, "rehash-only", now);

  assert.deepEqual(calls, [
    [
      "user.findUnique",
      {
        where: { accountIdentifier: "person@example.test" },
        select: {
          id: true,
          accountIdentifier: true,
          verifiedAt: true,
          platformRole: true,
          credential: { select: { passwordHash: true } },
        },
      },
    ],
    [
      "credential.update",
      {
        where: { userId: userId },
        data: { passwordHash: "rehash-only", passwordChangedAt: now },
      },
    ],
  ]);
});

test("session-family creation atomically persists only opaque ids and hashes", async () => {
  const { calls, prisma } = createPrismaFake();
  const repository = new PrismaAuthRepository(prisma);

  assert.equal(
    await repository.createSessionFamily({
      userId,
      access,
      refresh,
      now,
      requestCorrelationId,
    }),
    "family-id",
  );
  assert.deepEqual(calls, [
    ["$transaction"],
    [
      "sessionFamily.create",
      {
        data: {
          userId: userId,
          accessSessions: { create: access },
          refreshSessions: { create: { ...refresh, lastUsedAt: now } },
        },
        select: { id: true },
      },
    ],
  ]);
});

test("active access lookup requires unrevoked family and access with expiry strictly after now", async () => {
  const { calls, prisma } = createPrismaFake({
    transaction: {
      accessSession: {
        findFirst: async (args) => {
          calls.push(["accessSession.findFirst", args]);
          return {
            id: access.id,
            tokenHash: access.tokenHash,
            csrfHash: access.csrfHash,
            expiresAt: access.expiresAt,
            family: {
              id: "family-id",
              userId: userId,
              user: { verifiedAt: null, platformRole: "PLATFORM_ADMIN" },
            },
          };
        },
      },
    },
  });
  const repository = new PrismaAuthRepository(prisma);

  assert.deepEqual(await repository.findActiveAccessById(access.id, now), {
    userId: userId,
    familyId: "family-id",
    accessSessionId: access.id,
    verified: false,
    platformRole: "PLATFORM_ADMIN",
    tokenHash: access.tokenHash,
    csrfHash: access.csrfHash,
    expiresAt: access.expiresAt,
  });
  assert.deepEqual(calls, [
    [
      "accessSession.findFirst",
      {
        where: {
          id: access.id,
          revokedAt: null,
          expiresAt: { gt: now },
          family: { revokedAt: null },
        },
        select: {
          id: true,
          tokenHash: true,
          csrfHash: true,
          expiresAt: true,
          family: {
            select: {
              id: true,
              userId: true,
              user: { select: { verifiedAt: true, platformRole: true } },
            },
          },
        },
      },
    ],
  ]);
});

test("refresh rejects a wrong CSRF hash before any session mutation", async () => {
  const calls = [];
  const transaction = {
    refreshSession: {
      findUnique: async (args) => {
        calls.push(["refreshSession.findUnique", args]);
        return {
          familyId: "family-id",
          absoluteExpiresAt: refresh.absoluteExpiresAt,
          tokenHash: "presented-token-hash",
          csrfHash: "stored-csrf-hash",
          family: { userId },
        };
      },
      updateMany: async () => {
        throw new Error("must not consume");
      },
    },
    securityAuditEvent: { create: async () => {} },
  };
  const prisma = {
    $transaction: async (operation) => operation(transaction),
    ...transaction,
  };
  const repository = new PrismaAuthRepository(prisma);

  assert.deepEqual(
    await repository.rotateRefresh({
      presentedRefreshId: refresh.id,
      presentedTokenHash: "presented-token-hash",
      presentedCsrfHash: "wrong-csrf-hash",
      now,
      nextRefresh: refresh,
      nextAccess: access,
      requestCorrelationId,
    }),
    { status: "rejected" },
  );
  assert.deepEqual(calls, [
    [
      "refreshSession.findUnique",
      {
        where: { id: refresh.id },
        select: {
          familyId: true,
          absoluteExpiresAt: true,
          tokenHash: true,
          csrfHash: true,
          family: { select: { userId: true } },
        },
      },
    ],
  ]);
});

test("password recovery persists its secret hash only for an existing identity", async () => {
  const calls = [];
  const transaction = {
    user: {
      findUnique: async (args) => {
        calls.push(["user.findUnique", args]);
        return { id: userId, accountIdentifier: "person@example.test" };
      },
    },
    passwordReset: {
      create: async (args) => {
        calls.push(["passwordReset.create", args]);
      },
    },
    securityAuditEvent: { create: async () => {} },
  };
  const repository = new PrismaAuthRepository({
    $transaction: async (operation) => operation(transaction),
    ...transaction,
  });
  const expiresAt = new Date("2026-07-30T12:15:00.000Z");

  assert.deepEqual(
    await repository.createPasswordRecovery({
      accountIdentifier: "person@example.test",
      secretHash: "opaque-recovery-hash",
      now,
      expiresAt,
      requestCorrelationId,
    }),
    { accountIdentifier: "person@example.test" },
  );
  assert.deepEqual(calls, [
    [
      "user.findUnique",
      {
        where: { accountIdentifier: "person@example.test" },
        select: { id: true, accountIdentifier: true },
      },
    ],
    [
      "passwordReset.create",
      {
        data: {
          userId: userId,
          secretHash: "opaque-recovery-hash",
          createdAt: now,
          expiresAt,
        },
      },
    ],
  ]);
});

test("password reset conditionally consumes, updates, revokes every family, and retries serialization conflicts", async () => {
  const calls = [];
  let remainingConflicts = 1;
  const transaction = {
    passwordReset: {
      findFirst: async (args) => {
        calls.push(["passwordReset.findFirst", args]);
        return { id: "reset-id", userId: userId };
      },
      updateMany: async (args) => {
        calls.push(["passwordReset.updateMany", args]);
        return { count: args.where.id === "reset-id" ? 1 : 2 };
      },
    },
    credential: {
      update: async (args) => {
        calls.push(["credential.update", args]);
      },
    },
    sessionFamily: {
      updateMany: async (args) => {
        calls.push(["sessionFamily.updateMany", args]);
      },
    },
    securityAuditEvent: { create: async () => {} },
  };
  const prisma = {
    $transaction: async (operation, options) => {
      calls.push(["$transaction", options]);
      if (remainingConflicts > 0) {
        remainingConflicts -= 1;
        throw knownRequestError("P2034");
      }
      return operation(transaction);
    },
    ...transaction,
  };
  const repository = new PrismaAuthRepository(prisma);

  assert.equal(
    await repository.resetPassword({
      secretHash: "opaque-reset-hash",
      passwordHash: "replacement-password-hash",
      now,
      requestCorrelationId,
    }),
    "reset",
  );
  assert.deepEqual(calls, [
    ["$transaction", { isolationLevel: "Serializable" }],
    ["$transaction", { isolationLevel: "Serializable" }],
    [
      "passwordReset.findFirst",
      {
        where: {
          secretHash: "opaque-reset-hash",
          consumedAt: null,
          expiresAt: { gt: now },
        },
        select: { id: true, userId: true },
      },
    ],
    [
      "passwordReset.updateMany",
      {
        where: { id: "reset-id", consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      },
    ],
    [
      "credential.update",
      {
        where: { userId: userId },
        data: {
          passwordHash: "replacement-password-hash",
          passwordChangedAt: now,
        },
      },
    ],
    [
      "passwordReset.updateMany",
      {
        where: { userId: userId, id: { not: "reset-id" }, consumedAt: null },
        data: { consumedAt: now },
      },
    ],
    [
      "sessionFamily.updateMany",
      {
        where: { userId: userId, revokedAt: null },
        data: { revokedAt: now, revokedReason: "PASSWORD_RESET" },
      },
    ],
  ]);
});

test("reset subject lookup selects only an unconsumed, unexpired user id by secret hash", async () => {
  const calls = [];
  const repository = new PrismaAuthRepository({
    passwordReset: {
      findFirst: async (args) => {
        calls.push(args);
        return { userId: userId };
      },
    },
  });

  assert.equal(
    await repository.findPasswordResetSubject("opaque-reset-hash", now),
    userId,
  );
  assert.deepEqual(calls, [
    {
      where: {
        secretHash: "opaque-reset-hash",
        consumedAt: null,
        expiresAt: { gt: now },
      },
      select: { userId: true },
    },
  ]);
  assert.equal(JSON.stringify(calls).includes("raw-reset-secret"), false);
});

test("refresh subject lookup attributes matching opaque credentials including replayable rows without returning secrets", async () => {
  const calls = [];
  const repository = new PrismaAuthRepository({
    refreshSession: {
      findUnique: async (args) => {
        calls.push(args);
        return {
          tokenHash: "presented-token-hash",
          family: { userId: userId },
        };
      },
    },
  });

  assert.equal(
    await repository.findRefreshSubject(refresh.id, "presented-token-hash"),
    userId,
  );
  assert.equal(
    await repository.findRefreshSubject(refresh.id, "xresented-token-hash"),
    null,
  );
  assert.deepEqual(calls, [
    {
      where: { id: refresh.id },
      select: {
        tokenHash: true,
        family: { select: { userId: true } },
      },
    },
    {
      where: { id: refresh.id },
      select: {
        tokenHash: true,
        family: { select: { userId: true } },
      },
    },
  ]);
  assert.equal(JSON.stringify(calls).includes("raw-refresh-secret"), false);
});

test("security audit persistence writes exactly the safe fields and rejects invalid untyped input", async () => {
  const calls = [];
  const outage = new Error("database unavailable");
  const repository = new PrismaAuthRepository({
    securityAuditEvent: {
      create: async (args) => {
        calls.push(args);
        if (args.data.reason === "LOGIN_DENIED") throw outage;
      },
    },
  });
  const auditEvent = {
    subjectId: "9a30f920-575f-4bdb-884c-227109705728",
    outcome: "ALLOWED",
    reason: "LOGIN_ALLOWED",
    requestCorrelationId: "550e8400-e29b-41d4-a716-446655440000",
    now,
  };

  await repository.createSecurityAuditEvent(auditEvent);
  assert.deepEqual(calls, [
    {
      data: {
        subjectId: auditEvent.subjectId,
        outcome: auditEvent.outcome,
        reason: auditEvent.reason,
        requestCorrelationId: auditEvent.requestCorrelationId,
        createdAt: now,
      },
    },
  ]);
  await assert.rejects(
    () =>
      repository.createSecurityAuditEvent({
        ...auditEvent,
        reason: "ARBITRARY_REASON",
      }),
    /allowed audit reason/,
  );
  await assert.rejects(
    () =>
      repository.createSecurityAuditEvent({
        ...auditEvent,
        outcome: "ARBITRARY_OUTCOME",
      }),
    /supported outcome/,
  );
  await assert.rejects(
    () =>
      repository.createSecurityAuditEvent({
        ...auditEvent,
        subjectId: "not-a-uuid",
      }),
    /canonical UUID/,
  );
  await assert.rejects(
    () =>
      repository.createSecurityAuditEvent({
        ...auditEvent,
        outcome: "DENIED",
        reason: "LOGIN_DENIED",
      }),
    (error) => error === outage,
  );
  assert.equal(calls.length, 2);
});
