import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { Prisma } from "@prisma/client";
import test from "node:test";
import { PrismaAuthRepository } from "../dist/features/auth/infrastructure/prisma-auth.repository.js";
import { NodeCryptoAuthKeyHasher } from "../dist/features/auth/infrastructure/node-crypto-auth-key-hasher.js";

const now = new Date("2026-07-30T12:00:00.000Z");
const HASH_KEY = "test-auth-key-hash-key-must-be-at-least-32-bytes";
const ACCOUNT_KEY_HASH = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const CLIENT_SOURCE_KEY_HASH = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE";

function source(encoded) {
  return Buffer.from(encoded, "base64url").toString("utf8");
}

function knownRequestError(code) {
  return new Prisma.PrismaClientKnownRequestError("constraint", {
    code,
    clientVersion: "test",
  });
}

function createPrismaFake(overrides = {}) {
  const calls = [];
  const rawQueries = [];
  const rateEvents = [...(overrides.rateEvents ?? [])];
  const attempts = [...(overrides.attempts ?? [])];
  const transactionOptions = [];
  let serializationFailures = overrides.serializationFailures ?? 0;
  let nextAttemptId = attempts.length + 1;
  const transaction = {
    $executeRaw: async (query) => {
      rawQueries.push(query);
      calls.push(["$executeRaw", [...query.values]]);
      return 1;
    },
    authRateLimitEvent: {
      count: async ({ where }) => rateEvents.filter((event) => (
        event.endpoint === where.endpoint &&
        event.dimension === where.dimension &&
        event.keyHash === where.keyHash &&
        event.createdAt >= where.createdAt.gte
      )).length,
      createMany: async ({ data }) => {
        calls.push(["authRateLimitEvent.createMany", data]);
        rateEvents.push(...data);
        return { count: data.length };
      },
    },
    authAttempt: {
      findFirst: async ({ where }) => attempts
        .filter((attempt) => (
          attempt.accountKeyHash === where.accountKeyHash &&
          attempt.reason === where.reason &&
          attempt.createdAt >= where.createdAt.gte
        ))
        .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null,
      count: async ({ where }) => attempts.filter((attempt) => (
        attempt.accountKeyHash === where.accountKeyHash &&
        attempt.reason === where.reason &&
        attempt.createdAt >= where.createdAt.gte
      )).length,
      create: async ({ data, select }) => {
        const record = { id: `attempt-${nextAttemptId++}`, ...data };
        attempts.push(record);
        calls.push(["authAttempt.create", { data, select }]);
        return { id: record.id };
      },
      deleteMany: async ({ where }) => {
        const before = attempts.length;
        for (let index = attempts.length - 1; index >= 0; index -= 1) {
          if (attempts[index].accountKeyHash === where.accountKeyHash) attempts.splice(index, 1);
        }
        calls.push(["authAttempt.deleteMany", { where }]);
        return { count: before - attempts.length };
      },
    },
  };
  const prisma = {
    $transaction: async (operation, options) => {
      calls.push(["$transaction"]);
      transactionOptions.push(options);
      if (serializationFailures > 0) {
        serializationFailures -= 1;
        throw knownRequestError("P2034");
      }
      return operation(transaction);
    },
    ...transaction,
  };
  return { attempts, calls, prisma, rateEvents, rawQueries, transactionOptions };
}

function rateInput(overrides = {}) {
  return {
    endpoint: "LOGIN",
    accountKeyHash: ACCOUNT_KEY_HASH,
    clientSourceKeyHash: CLIENT_SOURCE_KEY_HASH,
    accountLimit: 10,
    clientSourceLimit: 10,
    windowStart: new Date("2026-07-30T11:45:00.000Z"),
    now,
    ...overrides,
  };
}

function reservationInput(overrides = {}) {
  return {
    ...rateInput(overrides),
    invalidCredentialsWindowStart: new Date("2026-07-30T11:45:00.000Z"),
    lockoutWindowStart: new Date("2026-07-30T11:45:00.000Z"),
    lockoutThreshold: 10,
    ...overrides,
  };
}

test("normalized inputs produce deterministic 43-character opaque HMAC keys", () => {
  const hasher = new NodeCryptoAuthKeyHasher(HASH_KEY);
  const accountSource = source("ICBQRVJTT07vvKBFWEFNUExFLlRFU1QgIA");
  const clientSource = source("ICAyMDAxOkRCODo6MSAg");
  const accountKey = hasher.hashAccount(accountSource);
  const clientSourceKey = hasher.hashClientSource(clientSource);

  assert.equal(accountKey, hasher.hashAccount(source("cGVyc29uQGV4YW1wbGUudGVzdA")));
  assert.equal(clientSourceKey, hasher.hashClientSource(source("MjAwMTpkYjg6OjE")));
  assert.match(accountKey, /^[A-Za-z0-9_-]{43}$/);
  assert.match(clientSourceKey, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(accountKey, accountSource);
  assert.notEqual(clientSourceKey, clientSource);
  assert.throws(() => new NodeCryptoAuthKeyHasher("too-short"), /at least 32 UTF-8 bytes/);
});

test("rate consumption locks deterministic parameterized keys and persists both dimension outcomes", async () => {
  const { calls, prisma, rateEvents, rawQueries, transactionOptions } = createPrismaFake({
    rateEvents: [{
      endpoint: "LOGIN",
      dimension: "ACCOUNT",
      keyHash: ACCOUNT_KEY_HASH,
      outcome: "ALLOWED",
      createdAt: new Date("2026-07-30T11:59:00.000Z"),
    }],
  });
  const repository = new PrismaAuthRepository(prisma);

  assert.deepEqual(await repository.consumeRateLimit(rateInput({ accountLimit: 1, clientSourceLimit: 2 })), {
    status: "rejected",
    exceededDimensions: ["ACCOUNT"],
  });
  assert.deepEqual(rateEvents.slice(1), [
    { endpoint: "LOGIN", dimension: "ACCOUNT", keyHash: ACCOUNT_KEY_HASH, outcome: "REJECTED", createdAt: now },
    { endpoint: "LOGIN", dimension: "CLIENT_SOURCE", keyHash: CLIENT_SOURCE_KEY_HASH, outcome: "REJECTED", createdAt: now },
  ]);
  assert.deepEqual(rawQueries.map((query) => [...query.values]), [
    [`LOGIN:ACCOUNT:${ACCOUNT_KEY_HASH}`],
    [`LOGIN:CLIENT_SOURCE:${CLIENT_SOURCE_KEY_HASH}`],
  ]);
  assert.equal(rawQueries.every((query) => query.values.length === 1), true);
  assert.equal(rawQueries.every((query) => !query.strings.join("").includes(ACCOUNT_KEY_HASH)), true);
  assert.equal(rawQueries.every((query) => !query.strings.join("").includes(CLIENT_SOURCE_KEY_HASH)), true);
  assert.equal(calls.some(([method]) => method === "authAttempt.create"), false);
  assert.deepEqual(transactionOptions, [{ isolationLevel: "ReadCommitted" }]);
});

test("rate events remain endpoint and dimension isolated while rejected events count", async () => {
  const { prisma, rateEvents } = createPrismaFake();
  const repository = new PrismaAuthRepository(prisma);
  const input = rateInput({ accountLimit: 1, clientSourceLimit: 3 });

  assert.deepEqual(await repository.consumeRateLimit(input), { status: "allowed", exceededDimensions: [] });
  assert.deepEqual(await repository.consumeRateLimit({ ...input, endpoint: "REFRESH" }), { status: "allowed", exceededDimensions: [] });
  assert.deepEqual(await repository.consumeRateLimit(input), { status: "rejected", exceededDimensions: ["ACCOUNT"] });
  assert.deepEqual(await repository.consumeRateLimit(input), { status: "rejected", exceededDimensions: ["ACCOUNT"] });
  assert.deepEqual(await repository.consumeRateLimit(input), {
    status: "rejected",
    exceededDimensions: ["ACCOUNT", "CLIENT_SOURCE"],
  });
  assert.equal(rateEvents.filter((event) => event.endpoint === "LOGIN" && event.dimension === "ACCOUNT").length, 4);
  assert.equal(rateEvents.filter((event) => event.endpoint === "REFRESH" && event.dimension === "ACCOUNT").length, 1);
});

test("locked reservations consume both rate dimensions without extending the fixed marker", async () => {
  const { attempts, prisma, rateEvents } = createPrismaFake();
  const repository = new PrismaAuthRepository(prisma);
  const input = reservationInput({ accountLimit: 20, clientSourceLimit: 20 });

  for (let count = 1; count <= 10; count += 1) {
    assert.deepEqual(await repository.reserveLoginAttempt(input), { status: "reserved", attemptId: `attempt-${count}` });
  }
  const marker = attempts.find((attempt) => attempt.reason === "ACCOUNT_LOCKED");
  assert.equal(attempts.filter((attempt) => attempt.reason === "INVALID_CREDENTIALS").length, 10);
  assert.equal(attempts.filter((attempt) => attempt.reason === "ACCOUNT_LOCKED").length, 1);
  assert.equal(marker.createdAt, now);
  assert.deepEqual(await repository.reserveLoginAttempt(input), { status: "locked" });
  assert.equal(attempts.filter((attempt) => attempt.reason === "ACCOUNT_LOCKED").length, 1);
  assert.equal(attempts.find((attempt) => attempt.reason === "ACCOUNT_LOCKED").createdAt, now);
  assert.equal(rateEvents.filter((event) => (
    event.endpoint === "LOGIN" && event.dimension === "ACCOUNT"
  )).length, 11);
  assert.equal(rateEvents.filter((event) => (
    event.endpoint === "LOGIN" && event.dimension === "CLIENT_SOURCE"
  )).length, 11);
});

test("rate-limited reservations record a rate-limited attempt", async () => {
  const { attempts, prisma } = createPrismaFake({
    rateEvents: [{
      endpoint: "LOGIN",
      dimension: "ACCOUNT",
      keyHash: ACCOUNT_KEY_HASH,
      outcome: "ALLOWED",
      createdAt: new Date("2026-07-30T11:59:00.000Z"),
    }],
  });
  const repository = new PrismaAuthRepository(prisma);

  assert.deepEqual(await repository.reserveLoginAttempt(reservationInput({ accountLimit: 1 })), {
    status: "rate_limited",
    exceededDimensions: ["ACCOUNT"],
  });
  assert.deepEqual(attempts.map((attempt) => attempt.reason), ["RATE_LIMITED"]);
});

test("successful login reconciliation deletes account attempts but keeps rate events", async () => {
  const { attempts, prisma, rateEvents } = createPrismaFake({
    attempts: [{
      accountKeyHash: ACCOUNT_KEY_HASH,
      clientSourceKeyHash: CLIENT_SOURCE_KEY_HASH,
      reason: "INVALID_CREDENTIALS",
      createdAt: now,
    }],
    rateEvents: [{
      endpoint: "LOGIN",
      dimension: "ACCOUNT",
      keyHash: ACCOUNT_KEY_HASH,
      outcome: "ALLOWED",
      createdAt: now,
    }],
  });
  const repository = new PrismaAuthRepository(prisma);

  await repository.completeLoginSuccess({ accountKeyHash: ACCOUNT_KEY_HASH });
  assert.deepEqual(attempts, []);
  assert.equal(rateEvents.length, 1);
});

test("read-committed rate consumption caps P2034 handling at three attempts", async () => {
  const { prisma, transactionOptions } = createPrismaFake({ serializationFailures: 3 });
  const repository = new PrismaAuthRepository(prisma);

  await assert.rejects(
    () => repository.consumeRateLimit(rateInput()),
    (error) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034",
  );
  assert.deepEqual(transactionOptions, [
    { isolationLevel: "ReadCommitted" },
    { isolationLevel: "ReadCommitted" },
    { isolationLevel: "ReadCommitted" },
  ]);
});

test("incoherent rate windows fail before a transaction", async () => {
  const { prisma, transactionOptions } = createPrismaFake();
  const repository = new PrismaAuthRepository(prisma);

  await assert.rejects(
    () => repository.consumeRateLimit(rateInput({ windowStart: new Date("2026-07-30T12:01:00.000Z") })),
    /coherent Date inputs/,
  );
  assert.deepEqual(transactionOptions, []);
});

test("malformed keys and endpoints fail before a transaction", async () => {
  const { prisma, transactionOptions } = createPrismaFake();
  const repository = new PrismaAuthRepository(prisma);

  await assert.rejects(
    () => repository.consumeRateLimit(rateInput({ accountKeyHash: "not-a-canonical-hash" })),
    /canonical 43-character base64url HMAC digest/,
  );
  await assert.rejects(
    () => repository.consumeRateLimit(rateInput({ clientSourceKeyHash: "A".repeat(44) })),
    /canonical 43-character base64url HMAC digest/,
  );
  await assert.rejects(
    () => repository.consumeRateLimit(rateInput({ endpoint: "UNKNOWN" })),
    /supported rate-limit endpoint/,
  );
  assert.deepEqual(transactionOptions, []);
});

test("locked requests consume rate limits before returning a rate limit result", async () => {
  const { attempts, prisma, rateEvents } = createPrismaFake({
    attempts: [{
      accountKeyHash: ACCOUNT_KEY_HASH,
      clientSourceKeyHash: CLIENT_SOURCE_KEY_HASH,
      reason: "ACCOUNT_LOCKED",
      createdAt: now,
    }],
  });
  const repository = new PrismaAuthRepository(prisma);
  const input = reservationInput({ accountLimit: 1, clientSourceLimit: 1 });

  assert.deepEqual(await repository.reserveLoginAttempt(input), { status: "locked" });
  assert.deepEqual(rateEvents.map(({ endpoint, dimension, outcome }) => ({ endpoint, dimension, outcome })), [
    { endpoint: "LOGIN", dimension: "ACCOUNT", outcome: "ALLOWED" },
    { endpoint: "LOGIN", dimension: "CLIENT_SOURCE", outcome: "ALLOWED" },
  ]);
  assert.deepEqual(await repository.reserveLoginAttempt(input), {
    status: "rate_limited",
    exceededDimensions: ["ACCOUNT", "CLIENT_SOURCE"],
  });
  assert.equal(attempts.filter((attempt) => attempt.reason === "ACCOUNT_LOCKED").length, 1);
  assert.equal(attempts.find((attempt) => attempt.reason === "ACCOUNT_LOCKED").createdAt, now);
});
