const REFRESH_IDLE_WINDOW_MILLISECONDS = 24 * 60 * 60 * 1_000;
const CANONICAL_32_BYTE_BASE64_URL = /^[A-Za-z0-9_-]{43}$/;

export function isCanonicalCsrfToken(token: unknown): token is string {
  return (
    typeof token === "string" &&
    CANONICAL_32_BYTE_BASE64_URL.test(token) &&
    Buffer.from(token, "base64url").toString("base64url") === token
  );
}

export function calculateRefreshIdleExpiry(
  now: Date,
  absoluteExpiry: Date,
): Date {
  const idleExpiry = new Date(now.getTime() + REFRESH_IDLE_WINDOW_MILLISECONDS);
  return idleExpiry < absoluteExpiry ? idleExpiry : new Date(absoluteExpiry);
}

export type OpaqueCredential = {
  id: string;
  secret: string;
  serialized: string;
};

export type IssuedCredential = OpaqueCredential & {
  hash: string;
};

export interface SessionCredentialIssuer {
  issue(): IssuedCredential;
  hash(secret: string): string;
  matches(secret: string, expectedHash: string): boolean;
}
