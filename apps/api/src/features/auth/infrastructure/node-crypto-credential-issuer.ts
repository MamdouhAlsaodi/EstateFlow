import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type {
  IssuedCredential,
  OpaqueCredential,
  SessionCredentialIssuer,
} from "../domain/session-credentials.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MINIMUM_HMAC_KEY_BYTES = 32;

export function parseOpaqueCredential(serialized: string): OpaqueCredential {
  const parts = serialized.split(".");
  if (
    parts.length !== 2 ||
    !UUID_PATTERN.test(parts[0]) ||
    !BASE64_URL_PATTERN.test(parts[1]) ||
    Buffer.from(parts[1], "base64url").length !== 32
  ) {
    throw new Error("Malformed opaque credential");
  }
  return { id: parts[0], secret: parts[1], serialized };
}

export class NodeCryptoCredentialIssuer implements SessionCredentialIssuer {
  constructor(private readonly hashKey: string) {
    if (Buffer.byteLength(hashKey, "utf8") < MINIMUM_HMAC_KEY_BYTES) {
      throw new Error("HMAC key must be at least 32 UTF-8 bytes");
    }
  }

  issue(): IssuedCredential {
    const id = randomUUID();
    const secret = randomBytes(32).toString("base64url");
    const serialized = `${id}.${secret}`;
    return { id, secret, serialized, hash: this.hash(secret) };
  }

  hash(secret: string): string {
    return createHmac("sha256", this.hashKey).update(secret).digest("base64url");
  }

  matches(secret: string, expectedHash: string): boolean {
    const actualHash = Buffer.from(this.hash(secret), "base64url");
    const storedHash = Buffer.from(expectedHash, "base64url");
    return (
      actualHash.length === storedHash.length &&
      timingSafeEqual(actualHash, storedHash)
    );
  }
}
