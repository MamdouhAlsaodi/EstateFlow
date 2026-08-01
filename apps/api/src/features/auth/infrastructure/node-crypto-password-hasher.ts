import { argon2, randomBytes, timingSafeEqual } from "node:crypto";
import type {
  PasswordHasher,
  PasswordHashPolicy,
} from "../domain/password-hasher.js";

const DEFAULT_POLICY: PasswordHashPolicy = {
  memoryKiB: 19_456,
  iterations: 2,
  parallelism: 1,
  saltBytes: 16,
  tagBytes: 32,
};

const ENVELOPE_PATTERN =
  /^argon2id\$v=(1)\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/;
const MINIMUM_MEMORY_KIB = 8;
const MAXIMUM_MEMORY_KIB = 65_536;
const MINIMUM_ITERATIONS = 1;
const MAXIMUM_ITERATIONS = 10;
const MINIMUM_PARALLELISM = 1;
const MAXIMUM_PARALLELISM = 16;
const MINIMUM_SALT_BYTES = 16;
const MAXIMUM_SALT_BYTES = 64;
const MINIMUM_TAG_BYTES = 16;
const MAXIMUM_TAG_BYTES = 64;

type ParsedPasswordHash = PasswordHashPolicy & {
  salt: Buffer;
  tag: Buffer;
};

function isSafeIntegerInRange(value: number, minimum: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function isSafeStoredEnvelopePolicy(policy: PasswordHashPolicy): boolean {
  return (
    isSafeIntegerInRange(
      policy.parallelism,
      MINIMUM_PARALLELISM,
      MAXIMUM_PARALLELISM,
    ) &&
    isSafeIntegerInRange(
      policy.memoryKiB,
      MINIMUM_MEMORY_KIB,
      MAXIMUM_MEMORY_KIB,
    ) &&
    policy.memoryKiB >= MINIMUM_MEMORY_KIB * policy.parallelism &&
    isSafeIntegerInRange(
      policy.iterations,
      MINIMUM_ITERATIONS,
      MAXIMUM_ITERATIONS,
    ) &&
    isSafeIntegerInRange(
      policy.saltBytes,
      MINIMUM_SALT_BYTES,
      MAXIMUM_SALT_BYTES,
    ) &&
    isSafeIntegerInRange(
      policy.tagBytes,
      MINIMUM_TAG_BYTES,
      MAXIMUM_TAG_BYTES,
    )
  );
}

function isApprovedConstructorPolicy(policy: PasswordHashPolicy): boolean {
  return (
    isSafeStoredEnvelopePolicy(policy) &&
    policy.memoryKiB >= DEFAULT_POLICY.memoryKiB &&
    policy.iterations >= DEFAULT_POLICY.iterations &&
    policy.parallelism >= DEFAULT_POLICY.parallelism &&
    policy.saltBytes >= DEFAULT_POLICY.saltBytes &&
    policy.tagBytes >= DEFAULT_POLICY.tagBytes
  );
}

function deriveArgon2id(
  password: string,
  salt: Buffer,
  policy: PasswordHashPolicy,
): Promise<Buffer> {
  if (!isSafeStoredEnvelopePolicy(policy)) {
    return Promise.reject(new Error("Invalid password hash policy"));
  }
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

function parsePasswordHash(passwordHash: string): ParsedPasswordHash | null {
  const match = ENVELOPE_PATTERN.exec(passwordHash);
  if (!match) return null;
  const salt = Buffer.from(match[5], "base64url");
  const tag = Buffer.from(match[6], "base64url");
  if (
    salt.toString("base64url") !== match[5] ||
    tag.toString("base64url") !== match[6]
  ) {
    return null;
  }
  const policy: PasswordHashPolicy = {
    memoryKiB: Number(match[2]),
    iterations: Number(match[3]),
    parallelism: Number(match[4]),
    saltBytes: salt.length,
    tagBytes: tag.length,
  };
  if (!isSafeStoredEnvelopePolicy(policy)) return null;
  return { ...policy, salt, tag };
}

export class NodeCryptoPasswordHasher implements PasswordHasher {
  private readonly policy: PasswordHashPolicy;

  constructor(policy: Partial<PasswordHashPolicy> = {}) {
    const resolvedPolicy = { ...DEFAULT_POLICY, ...policy };
    if (!isApprovedConstructorPolicy(resolvedPolicy)) {
      throw new Error("Invalid password hash policy");
    }
    this.policy = resolvedPolicy;
  }

  async hash(password: string): Promise<string> {
    const salt = randomBytes(this.policy.saltBytes);
    const tag = await deriveArgon2id(password, salt, this.policy);
    return [
      "argon2id",
      "v=1",
      `m=${this.policy.memoryKiB},t=${this.policy.iterations},p=${this.policy.parallelism}`,
      salt.toString("base64url"),
      tag.toString("base64url"),
    ].join("$");
  }

  async verify(password: string, passwordHash: string): Promise<boolean> {
    const parsedHash = parsePasswordHash(passwordHash);
    if (!parsedHash) return false;
    const derivedTag = await deriveArgon2id(password, parsedHash.salt, parsedHash);
    return (
      derivedTag.length === parsedHash.tag.length &&
      timingSafeEqual(derivedTag, parsedHash.tag)
    );
  }

  needsRehash(passwordHash: string): boolean {
    const parsedHash = parsePasswordHash(passwordHash);
    return (
      !parsedHash ||
      parsedHash.memoryKiB < this.policy.memoryKiB ||
      parsedHash.iterations < this.policy.iterations ||
      parsedHash.parallelism < this.policy.parallelism ||
      parsedHash.saltBytes < this.policy.saltBytes ||
      parsedHash.tagBytes < this.policy.tagBytes
    );
  }
}
