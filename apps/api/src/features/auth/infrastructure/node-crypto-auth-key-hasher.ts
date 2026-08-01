import { createHmac } from "node:crypto";
import type { AuthKeyHasher } from "../domain/auth-key-hasher.js";

const MINIMUM_KEY_BYTES = 32;

function normalizeKey(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

export class NodeCryptoAuthKeyHasher implements AuthKeyHasher {
  constructor(private readonly key: string) {
    if (Buffer.byteLength(key, "utf8") < MINIMUM_KEY_BYTES) {
      throw new Error("Auth key HMAC key must be at least 32 UTF-8 bytes");
    }
  }

  hashAccount(accountIdentifier: string): string {
    return this.hashNormalized(accountIdentifier);
  }

  hashClientSource(clientSource: string): string {
    return this.hashNormalized(clientSource);
  }

  private hashNormalized(value: string): string {
    return createHmac("sha256", this.key)
      .update(normalizeKey(value), "utf8")
      .digest("base64url");
  }
}
