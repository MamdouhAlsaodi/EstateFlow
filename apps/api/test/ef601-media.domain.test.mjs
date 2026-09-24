import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import { TextEncoder } from "node:util";
import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MediaValidationError,
  MediaVariantKind,
  deriveVariantGeometry,
  parseImageDimensions,
  sniffMediaFormat,
  validateDeclaredFileName,
  validateMediaBytes,
} from "../dist/features/media/domain/media.js";
import {
  MediaIntentSigner,
  UploadIntentError,
} from "../dist/features/media/domain/media-intent.js";
import {
  InMemoryFakeStorageAdapter,
  S3CompatibleStorageAdapterNotActivated,
  opaqueStorageKey,
} from "../dist/features/media/domain/storage.port.js";
import {
  validJpeg,
  validPng,
  validWebp,
} from "./support/ef601-media-fixtures.mjs";

const FIXED_SECRET = Buffer.from(
  "ef601-fixed-test-secret-0000000000ff",
  "utf8",
);
const ORG = "11111111-1111-4111-8111-111111111111";
const PROPERTY = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const MEDIA = "44444444-4444-4444-8444-444444444444";

function binding(overrides = {}) {
  return {
    mediaId: MEDIA,
    organizationId: ORG,
    propertyId: PROPERTY,
    userId: USER,
    kind: "IMAGE",
    contentType: "image/png",
    maxBytes: 1000,
    expiresAtEpochSeconds: 4102444800, // 2100-01-01
    ...overrides,
  };
}

// --- magic-byte sniffing ----------------------------------------------------

test("EF-601 sniffing recognizes PNG/JPEG/WEBP/MP4/WEBM and rejects unknown magic", () => {
  assert.equal(sniffMediaFormat(validPng(32, 32)), "PNG");
  assert.equal(sniffMediaFormat(validJpeg(32, 32)), "JPEG");
  assert.equal(sniffMediaFormat(validWebp(32, 32)), "WEBP");
  const mp4 = new Uint8Array(24);
  mp4.set([0x66, 0x74, 0x79, 0x70], 4);
  assert.equal(sniffMediaFormat(mp4), "MP4");
  const webm = Uint8Array.of(0x1a, 0x45, 0xdf, 0xa3, 0, 0);
  assert.equal(sniffMediaFormat(webm), "WEBM");
  const gif = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  assert.equal(sniffMediaFormat(gif), null);
  assert.equal(sniffMediaFormat(new Uint8Array(0)), null);
});

test("EF-601 dimension parsing reads PNG/JPEG/WEBP intrinsic sizes", () => {
  assert.deepEqual(parseImageDimensions("PNG", validPng(1200, 640)), {
    width: 1200,
    height: 640,
  });
  assert.deepEqual(parseImageDimensions("JPEG", validJpeg(800, 600)), {
    width: 800,
    height: 600,
  });
  assert.deepEqual(parseImageDimensions("WEBP", validWebp(640, 480)), {
    width: 640,
    height: 480,
  });
});

// --- confirm-time validation ------------------------------------------------

test("EF-601 valid image passes full validation with dimensions and sha256", () => {
  const bytes = validPng(320, 200);
  const validated = validateMediaBytes({
    bytes,
    kind: "IMAGE",
    declaredContentType: "image/png",
  });
  assert.equal(validated.format, "PNG");
  assert.equal(validated.kind, "IMAGE");
  assert.equal(validated.width, 320);
  assert.equal(validated.height, 200);
  assert.equal(validated.byteSize, bytes.length);
  assert.match(validated.sha256, /^[0-9a-f]{64}$/);
});

test("EF-601 wrong magic (declared PNG, stored JPEG) is a typed MAGIC_MISMATCH", () => {
  assert.throws(
    () =>
      validateMediaBytes({
        bytes: validJpeg(64, 64),
        kind: "IMAGE",
        declaredContentType: "image/png",
      }),
    (error) =>
      error instanceof MediaValidationError && error.code === "MAGIC_MISMATCH",
  );
});

test("EF-601 GIF masquerading as an image is UNKNOWN_FORMAT", () => {
  assert.throws(
    () =>
      validateMediaBytes({
        bytes: Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 2]),
        kind: "IMAGE",
        declaredContentType: "image/png",
      }),
    (error) =>
      error instanceof MediaValidationError && error.code === "UNKNOWN_FORMAT",
  );
});

test("EF-601 polyglot payloads (JPEG+%PDF, PNG+<script) are POLYGLOT_SUSPECTED", () => {
  const jpegPdf = Uint8Array.from([
    ...validJpeg(64, 64).subarray(0, -2),
    ...new TextEncoder().encode("%PDF-1.4 evil"),
  ]);
  assert.throws(
    () =>
      validateMediaBytes({
        bytes: jpegPdf,
        kind: "IMAGE",
        declaredContentType: "image/jpeg",
      }),
    (error) =>
      error instanceof MediaValidationError &&
      error.code === "POLYGLOT_SUSPECTED",
  );
  const pngScript = Uint8Array.from([
    ...validPng(64, 64),
    ...new TextEncoder().encode("<script>alert(1)</script>"),
  ]);
  assert.throws(
    () =>
      validateMediaBytes({
        bytes: pngScript,
        kind: "IMAGE",
        declaredContentType: "image/png",
      }),
    (error) =>
      error instanceof MediaValidationError &&
      error.code === "POLYGLOT_SUSPECTED",
  );
});

test("EF-601 oversized payloads are rejected per kind", () => {
  const huge = new Uint8Array(MAX_IMAGE_BYTES + 1);
  huge.set(validPng(32, 32).subarray(0, 8), 0);
  assert.throws(
    () =>
      validateMediaBytes({
        bytes: huge,
        kind: "IMAGE",
        declaredContentType: "image/png",
      }),
    (error) =>
      error instanceof MediaValidationError && error.code === "OVERSIZE",
  );
  const bigVideo = new Uint8Array(MAX_VIDEO_BYTES + 1);
  bigVideo.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70], 0);
  assert.throws(
    () =>
      validateMediaBytes({
        bytes: bigVideo,
        kind: "VIDEO",
        declaredContentType: "video/mp4",
      }),
    (error) =>
      error instanceof MediaValidationError && error.code === "OVERSIZE",
  );
});

test("EF-601 empty payload and lying dimensions are typed rejections", () => {
  assert.throws(
    () =>
      validateMediaBytes({
        bytes: new Uint8Array(0),
        kind: "IMAGE",
        declaredContentType: "image/png",
      }),
    (error) =>
      error instanceof MediaValidationError && error.code === "EMPTY_PAYLOAD",
  );
  const tiny = validPng(5, 5); // below the 16px sanity floor
  assert.throws(
    () =>
      validateMediaBytes({
        bytes: tiny,
        kind: "IMAGE",
        declaredContentType: "image/png",
      }),
    (error) =>
      error instanceof MediaValidationError &&
      error.code === "DIMENSION_INVALID",
  );
  const giant = validPng(20000, 32); // above the sanity ceiling
  assert.throws(
    () =>
      validateMediaBytes({
        bytes: giant,
        kind: "IMAGE",
        declaredContentType: "image/png",
      }),
    (error) =>
      error instanceof MediaValidationError &&
      error.code === "DIMENSION_INVALID",
  );
});

test("EF-601 video bytes validate to PROCESSING-ready metadata without dimensions", () => {
  const mp4 = new Uint8Array(64);
  mp4.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d], 0);
  const validated = validateMediaBytes({
    bytes: mp4,
    kind: "VIDEO",
    declaredContentType: "video/mp4",
  });
  assert.equal(validated.format, "MP4");
  assert.equal(validated.kind, "VIDEO");
  assert.equal(validated.width, null);
  assert.equal(validated.height, null);
});

// --- filename policy --------------------------------------------------------

test("EF-601 double extensions and mismatched extensions are typed rejections", () => {
  assert.throws(
    () => validateDeclaredFileName("photo.jpg.php", "IMAGE"),
    (error) =>
      error instanceof MediaValidationError &&
      error.code === "FILENAME_DOUBLE_EXTENSION",
  );
  assert.throws(
    () => validateDeclaredFileName("invoice.pdf.jpg", "IMAGE"),
    (error) =>
      error instanceof MediaValidationError &&
      error.code === "FILENAME_DOUBLE_EXTENSION",
  );
  assert.throws(
    () => validateDeclaredFileName("notes.txt", "IMAGE"),
    (error) =>
      error instanceof MediaValidationError &&
      error.code === "FILENAME_EXTENSION_MISMATCH",
  );
  assert.throws(
    () => validateDeclaredFileName("no extension", "IMAGE"),
    (error) =>
      error instanceof MediaValidationError &&
      error.code === "FILENAME_INVALID",
  );
  assert.equal(
    validateDeclaredFileName("villa-photo.webp", "IMAGE"),
    "villa-photo.webp",
  );
  assert.equal(validateDeclaredFileName("tour.mp4", "VIDEO"), "tour.mp4");
});

// --- deterministic variants -------------------------------------------------

test("EF-601 variant geometry is deterministic and never upscales", () => {
  assert.deepEqual(deriveVariantGeometry(MediaVariantKind.THUMB, 3200, 1600), {
    width: 160,
    height: 80,
  });
  assert.deepEqual(
    deriveVariantGeometry(MediaVariantKind.PREVIEW, 3200, 1600),
    { width: 640, height: 320 },
  );
  assert.deepEqual(deriveVariantGeometry(MediaVariantKind.THUMB, 100, 50), {
    width: 100,
    height: 50,
  });
  const a = deriveVariantGeometry(MediaVariantKind.PREVIEW, 1921, 1081);
  const b = deriveVariantGeometry(MediaVariantKind.PREVIEW, 1921, 1081);
  assert.deepEqual(a, b);
});

// --- signed intents ---------------------------------------------------------

test("EF-601 signed intent roundtrip verifies and tampering is rejected", () => {
  const signer = new MediaIntentSigner(FIXED_SECRET);
  const grant = signer.sign(binding());
  assert.match(grant.token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  signer.verify(grant.token, binding());

  const [payload] = grant.token.split(".");
  const tamperedPayload = `${payload.slice(0, -2)}xy.${grant.token.split(".")[1]}`;
  assert.throws(
    () => signer.verify(tamperedPayload, binding()),
    (error) =>
      error instanceof UploadIntentError &&
      error.code === "INTENT_INVALID_SIGNATURE",
  );
  const forged = `${grant.token.split(".")[0]}.deadbeef`;
  assert.throws(
    () => signer.verify(forged, binding()),
    (error) =>
      error instanceof UploadIntentError &&
      error.code === "INTENT_INVALID_SIGNATURE",
  );
  assert.throws(
    () => signer.verify("garbage", binding()),
    (error) =>
      error instanceof UploadIntentError &&
      error.code === "INTENT_INVALID_SIGNATURE",
  );
});

test("EF-601 expired intents and binding mismatches are typed rejections", () => {
  const signer = new MediaIntentSigner(FIXED_SECRET);
  const expired = signer.sign(
    binding({ expiresAtEpochSeconds: Math.floor(Date.now() / 1000) - 10 }),
  );
  assert.throws(
    () =>
      signer.verify(
        expired.token,
        binding({ expiresAtEpochSeconds: Math.floor(Date.now() / 1000) - 10 }),
      ),
    (error) =>
      error instanceof UploadIntentError && error.code === "INTENT_EXPIRED",
  );

  const grant = signer.sign(binding());
  assert.throws(
    () =>
      signer.verify(
        grant.token,
        binding({ userId: "55555555-5555-4555-8555-555555555555" }),
      ),
    (error) =>
      error instanceof UploadIntentError &&
      error.code === "INTENT_BINDING_MISMATCH",
  );
  assert.throws(
    () =>
      signer.verify(
        grant.token,
        binding({ organizationId: "66666666-6666-4666-8666-666666666666" }),
      ),
    (error) =>
      error instanceof UploadIntentError &&
      error.code === "INTENT_BINDING_MISMATCH",
  );
  assert.throws(
    () => signer.verify(grant.token, binding({ kind: "VIDEO" })),
    (error) =>
      error instanceof UploadIntentError &&
      error.code === "INTENT_BINDING_MISMATCH",
  );
});

test("EF-601 signatures are keyed: another secret cannot validate a grant", () => {
  const signerA = new MediaIntentSigner(FIXED_SECRET);
  const signerB = new MediaIntentSigner(
    Buffer.from("another-secret-0000000000000000000000", "utf8"),
  );
  const grant = signerA.sign(binding());
  assert.throws(
    () => signerB.verify(grant.token, binding()),
    (error) =>
      error instanceof UploadIntentError &&
      error.code === "INTENT_INVALID_SIGNATURE",
  );
});

// --- storage port -----------------------------------------------------------

test("EF-601 storage keys are opaque tokens, never paths", () => {
  const key = opaqueStorageKey(MEDIA, "");
  assert.match(key, /^et1_[A-Za-z0-9_-]+$/);
  assert.ok(!key.includes("/"));
  assert.ok(!key.includes("\\"));
  assert.ok(!key.includes(ORG));
  assert.ok(!key.includes(PROPERTY));
  const thumb = opaqueStorageKey(MEDIA, "thumb");
  assert.notEqual(key, thumb);
});

test("EF-601 in-memory fake adapter is deterministic for identical inputs", async () => {
  const signer = new MediaIntentSigner(FIXED_SECRET);
  const first = new InMemoryFakeStorageAdapter(signer);
  const second = new InMemoryFakeStorageAdapter(signer);
  const grantOne = first.issueUploadIntent(binding());
  const grantTwo = second.issueUploadIntent(binding());
  assert.equal(grantOne.token, grantTwo.token);

  const bytes = validPng(64, 64);
  await first.putDirect(grantOne.token.split(".")[0], bytes, "image/png");
  const readBack = await first.readObject(grantOne.token.split(".")[0]);
  assert.equal(readBack.length, bytes.length);
  assert.equal(await second.readObject(grantOne.token.split(".")[0]), null);
  assert.equal(await first.deleteObjects([grantOne.token.split(".")[0]]), 1);
  assert.equal(await first.deleteObjects(["missing"]), 0);
});

test("EF-601 the S3-compatible adapter exists behind the same port but is not activated", async () => {
  const adapter = new S3CompatibleStorageAdapterNotActivated(
    new MediaIntentSigner(FIXED_SECRET),
  );
  assert.equal(adapter.adapterId, "s3-compatible-not-activated");
  const grant = adapter.issueUploadIntent(binding());
  assert.equal(typeof grant.token, "string");
  await assert.rejects(
    () => adapter.putDirect("k", new Uint8Array(1), "image/png"),
    /not activated/,
  );
  await assert.rejects(() => adapter.readObject("k"), /not activated/);
  await assert.rejects(() => adapter.deleteObjects(["k"]), /not activated/);
});
