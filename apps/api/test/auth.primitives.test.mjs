import assert from "node:assert/strict";
import { argon2, createHmac } from "node:crypto";
import { Buffer } from "node:buffer";
import test from "node:test";
import {
  FixedClock,
  SystemClock,
} from "../dist/features/auth/application/clock.js";
import {
  NodeCryptoCredentialIssuer,
  parseOpaqueCredential,
} from "../dist/features/auth/infrastructure/node-crypto-credential-issuer.js";
import { calculateRefreshIdleExpiry } from "../dist/features/auth/domain/session-credentials.js";
import { NodeCryptoPasswordHasher } from "../dist/features/auth/infrastructure/node-crypto-password-hasher.js";

const TEST_HASH_KEY = "test-hash-key-must-be-at-least-32-bytes";

function deriveArgon2id(password, salt, policy) {
  return new Promise((resolve, reject) => {
    argon2(
      "argon2id",
      {
        message: Buffer.from(password),
        nonce: salt,
        parallelism: policy.parallelism,
        tagLength: policy.tagBytes,
        memory: policy.memoryKiB,
        passes: policy.iterations,
      },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(Buffer.from(derivedKey));
      },
    );
  });
}

test("opaque credentials contain a UUID and 256-bit CSPRNG secret hashed with HMAC-SHA-256", () => {
  const issuer = new NodeCryptoCredentialIssuer(TEST_HASH_KEY);
  const credential = issuer.issue();
  const parsed = parseOpaqueCredential(credential.serialized);

  assert.match(parsed.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(Buffer.from(parsed.secret, "base64url").length, 32);
  assert.equal(
    credential.hash,
    createHmac("sha256", TEST_HASH_KEY).update(parsed.secret).digest("base64url"),
  );
  assert.equal(issuer.matches(parsed.secret, credential.hash), true);
  assert.equal(issuer.matches("different-secret", credential.hash), false);
  assert.throws(
    () => new NodeCryptoCredentialIssuer("too-short"),
    /at least 32 UTF-8 bytes/,
  );
  assert.throws(() => parseOpaqueCredential("not-a-credential"), /malformed/i);
  assert.throws(() => parseOpaqueCredential(`${parsed.id}.a.b`), /malformed/i);
});

test("Argon2id hashes retain policy parameters and verify without plaintext persistence", async () => {
  const hasher = new NodeCryptoPasswordHasher();
  const passwordHash = await hasher.hash("correct horse battery staple");

  assert.match(passwordHash, /^argon2id\$v=1\$m=19456,t=2,p=1\$/);
  assert.equal(await hasher.verify("correct horse battery staple", passwordHash), true);
  assert.equal(await hasher.verify("wrong password", passwordHash), false);
  assert.equal(hasher.needsRehash(passwordHash), false);
  assert.equal(new NodeCryptoPasswordHasher({ memoryKiB: 19457 }).needsRehash(passwordHash), true);

  assert.equal(
    new NodeCryptoPasswordHasher({ saltBytes: 17 }).needsRehash(passwordHash),
    true,
  );
  await assert.doesNotReject(async () => {
    assert.equal(
      await hasher.verify(
        "correct horse battery staple",
        "argon2id$v=1$m=0,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      ),
      false,
    );
  });
  assert.throws(
    () => new NodeCryptoPasswordHasher({ memoryKiB: 0 }),
    Error,
  );
});

test("Argon2id verification accepts bounded legacy hashes and marks them for rehash", async () => {
  const password = "correct horse battery staple";
  const legacyPolicy = {
    memoryKiB: 19_455,
    iterations: 1,
    parallelism: 1,
    saltBytes: 16,
    tagBytes: 31,
  };
  const salt = Buffer.alloc(legacyPolicy.saltBytes, 1);
  const tag = await deriveArgon2id(password, salt, legacyPolicy);
  const legacyHash = [
    "argon2id",
    "v=1",
    `m=${legacyPolicy.memoryKiB},t=${legacyPolicy.iterations},p=${legacyPolicy.parallelism}`,
    salt.toString("base64url"),
    tag.toString("base64url"),
  ].join("$");
  const hasher = new NodeCryptoPasswordHasher();

  assert.equal(await hasher.verify(password, legacyHash), true);
  assert.equal(hasher.needsRehash(legacyHash), true);
});

test("Argon2id constructor enforces the approved policy floor", () => {
  for (const policy of [
    { memoryKiB: 19_455 },
    { iterations: 1 },
    { parallelism: 0 },
    { saltBytes: 15 },
    { tagBytes: 31 },
  ]) {
    assert.throws(() => new NodeCryptoPasswordHasher(policy), Error);
  }

  assert.doesNotThrow(() =>
    new NodeCryptoPasswordHasher({
      memoryKiB: 19_457,
      iterations: 3,
      parallelism: 2,
      saltBytes: 17,
      tagBytes: 33,
    }),
  );
});

test("refresh idle expiry cannot extend past the original absolute expiry", () => {
  const now = new Date("2026-07-30T12:00:00.000Z");
  const absoluteExpiry = new Date("2026-07-31T00:00:00.000Z");

  assert.equal(
    calculateRefreshIdleExpiry(now, absoluteExpiry).toISOString(),
    absoluteExpiry.toISOString(),
  );
});

test("fixed clocks retain exact expiry boundaries while system clock provides UTC instants", () => {
  const now = new Date("2026-07-30T12:00:00.000Z");
  const clock = new FixedClock(now);

  assert.equal(clock.now().toISOString(), now.toISOString());
  assert.equal(clock.plusMinutes(15).toISOString(), "2026-07-30T12:15:00.000Z");
  assert.equal(clock.plusHours(24).toISOString(), "2026-07-31T12:00:00.000Z");
  assert.equal(SystemClock.now() instanceof Date, true);
});
