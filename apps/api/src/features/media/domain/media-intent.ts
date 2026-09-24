/**
 * EF-601 — Signed upload intent. A short-lived, HMAC-signed token binding one
 * pending media asset to its organization, property, uploader, kind, declared
 * content type, and maximum byte size. In the real world the client PUTs the
 * bytes directly to object storage with this grant; the API process never
 * streams the file. Confirmation re-checks the binding before any validation.
 *
 * The signing secret is injected (process-random by default; tests inject a
 * fixed key for determinism). No credentials or environment files are read.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { MediaKind } from "./media.js";

export type UploadIntentBinding = Readonly<{
  mediaId: string;
  organizationId: string;
  propertyId: string;
  userId: string;
  kind: MediaKind;
  contentType: string;
  maxBytes: number;
  expiresAtEpochSeconds: number;
}>;

export type UploadIntentToken = Readonly<{
  token: string;
  expiresAtEpochSeconds: number;
}>;

export type UploadIntentErrorCode =
  "INTENT_INVALID_SIGNATURE" | "INTENT_EXPIRED" | "INTENT_BINDING_MISMATCH";

export class UploadIntentError extends Error {
  readonly code: UploadIntentErrorCode;
  constructor(code: UploadIntentErrorCode, message?: string) {
    super(message ?? code);
    this.name = "UploadIntentError";
    this.code = code;
  }
}

const TOKEN_VERSION = "EF601-MEDIA-INTENT-V1";

export class MediaIntentSigner {
  private readonly secret: Buffer;

  constructor(secret?: Buffer) {
    this.secret = secret ?? randomBytes(32);
  }

  sign(binding: UploadIntentBinding): UploadIntentToken {
    const payload = canonicalBinding(binding);
    const signature = createHmac("sha256", this.secret)
      .update(payload)
      .digest("base64url");
    return {
      token: `${Buffer.from(payload, "utf8").toString("base64url")}.${signature}`,
      expiresAtEpochSeconds: binding.expiresAtEpochSeconds,
    };
  }

  /**
   * Verifies signature + expiry and that every binding field matches the
   * expected values. Any mismatch is a typed rejection, never a fallback.
   */
  verify(token: string, expected: UploadIntentBinding): void {
    const parsed = this.parse(token);
    if (parsed.expiresAtEpochSeconds < expectedNowEpochSeconds())
      throw new UploadIntentError("INTENT_EXPIRED");
    assertBindingMatches(parsed, expected);
  }

  /** Signature + structural check only (used before the DB row is known). */
  verifySignatureOnly(token: string): UploadIntentBinding {
    return this.parse(token);
  }

  private parse(token: string): UploadIntentBinding {
    if (typeof token !== "string" || !token.includes("."))
      throw new UploadIntentError("INTENT_INVALID_SIGNATURE");
    const [payloadPart, signaturePart] = token.split(".");
    let payload: string;
    try {
      payload = Buffer.from(payloadPart, "base64url").toString("utf8");
    } catch {
      throw new UploadIntentError("INTENT_INVALID_SIGNATURE");
    }
    const expectedSignature = createHmac("sha256", this.secret)
      .update(payload)
      .digest("base64url");
    const a = Buffer.from(signaturePart);
    const b = Buffer.from(expectedSignature);
    if (a.length !== b.length || !timingSafeEqual(a, b))
      throw new UploadIntentError("INTENT_INVALID_SIGNATURE");
    const binding = decodeBinding(payload);
    if (!binding) throw new UploadIntentError("INTENT_INVALID_SIGNATURE");
    return binding;
  }
}

function assertBindingMatches(
  actual: UploadIntentBinding,
  expected: UploadIntentBinding,
): void {
  const fields: readonly (keyof UploadIntentBinding)[] = [
    "mediaId",
    "organizationId",
    "propertyId",
    "userId",
    "kind",
    "contentType",
    "maxBytes",
  ];
  for (const field of fields) {
    if (actual[field] !== expected[field])
      throw new UploadIntentError(
        "INTENT_BINDING_MISMATCH",
        `INTENT_BINDING_MISMATCH: ${field}`,
      );
  }
}

function canonicalBinding(binding: UploadIntentBinding): string {
  return JSON.stringify([
    TOKEN_VERSION,
    binding.mediaId,
    binding.organizationId,
    binding.propertyId,
    binding.userId,
    binding.kind,
    binding.contentType,
    binding.maxBytes,
    binding.expiresAtEpochSeconds,
  ]);
}

function decodeBinding(payload: string): UploadIntentBinding | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 9) return null;
  const [
    version,
    mediaId,
    organizationId,
    propertyId,
    userId,
    kind,
    contentType,
    maxBytes,
    expiresAtEpochSeconds,
  ] = parsed as unknown[];
  if (version !== TOKEN_VERSION) return null;
  if (
    typeof mediaId !== "string" ||
    typeof organizationId !== "string" ||
    typeof propertyId !== "string" ||
    typeof userId !== "string" ||
    (kind !== MediaKind.IMAGE && kind !== MediaKind.VIDEO) ||
    typeof contentType !== "string" ||
    typeof maxBytes !== "number" ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    typeof expiresAtEpochSeconds !== "number" ||
    !Number.isSafeInteger(expiresAtEpochSeconds)
  )
    return null;
  return {
    mediaId,
    organizationId,
    propertyId,
    userId,
    kind,
    contentType,
    maxBytes,
    expiresAtEpochSeconds,
  };
}

function expectedNowEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
