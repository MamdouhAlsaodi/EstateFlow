const CANONICAL_32_BYTE_BASE64_URL = /^[A-Za-z0-9_-]{43}$/;

export type IssuedOneTimeSecret = {
  secret: string;
  hash: string;
};

export interface OneTimeSecretIssuer {
  issue(): IssuedOneTimeSecret;
  hash(secret: string): string;
  matches(secret: string, expectedHash: string): boolean;
}

export function isCanonicalOneTimeSecret(secret: unknown): secret is string {
  return (
    typeof secret === "string" &&
    CANONICAL_32_BYTE_BASE64_URL.test(secret) &&
    Buffer.from(secret, "base64url").toString("base64url") === secret
  );
}
