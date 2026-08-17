import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type {
  IssuedOneTimeSecret,
  OneTimeSecretIssuer,
} from "../domain/one-time-secret.js";

const MINIMUM_HMAC_KEY_BYTES = 32;

export class NodeCryptoOneTimeSecretIssuer implements OneTimeSecretIssuer {
  constructor(private readonly hashKey: string) {
    if (Buffer.byteLength(hashKey, "utf8") < MINIMUM_HMAC_KEY_BYTES) {
      throw new Error("HMAC key must be at least 32 UTF-8 bytes");
    }
  }

  issue(): IssuedOneTimeSecret {
    const secret = randomBytes(32).toString("base64url");
    return { secret, hash: this.hash(secret) };
  }

  hash(secret: string): string {
    return createHmac("sha256", this.hashKey)
      .update(secret)
      .digest("base64url");
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
