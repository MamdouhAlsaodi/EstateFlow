/**
 * EF-601 — Media domain: kinds, formats, per-kind limits, magic-byte MIME
 * sniffing, image dimension sanity, polyglot/double-extension rejection, and
 * deterministic image-variant geometry.
 *
 * Validation happens at CONFIRM time against the stored bytes read through the
 * StoragePort — never against client-declared headers alone. Every rejection
 * carries a stable machine-readable `code` so the HTTP layer can surface typed
 * errors without leaking server internals (no filesystem paths anywhere).
 */

export const MediaKind = {
  IMAGE: "IMAGE",
  VIDEO: "VIDEO",
} as const;
export type MediaKind = (typeof MediaKind)[keyof typeof MediaKind];

export const MediaStatus = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  PROCESSING: "PROCESSING",
  ORPHAN: "ORPHAN",
} as const;
export type MediaStatus = (typeof MediaStatus)[keyof typeof MediaStatus];

export const MediaFormat = {
  JPEG: "JPEG",
  PNG: "PNG",
  WEBP: "WEBP",
  MP4: "MP4",
  WEBM: "WEBM",
  MOV: "MOV",
} as const;
export type MediaFormat = (typeof MediaFormat)[keyof typeof MediaFormat];

export const MediaVariantKind = {
  THUMB: "THUMB",
  PREVIEW: "PREVIEW",
} as const;
export type MediaVariantKind =
  (typeof MediaVariantKind)[keyof typeof MediaVariantKind];

/** Per-kind byte limits. Images align with the EF-201 metadata limit. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export const IMAGE_CONTENT_TYPES: Readonly<Record<string, MediaFormat>> = {
  "image/jpeg": MediaFormat.JPEG,
  "image/png": MediaFormat.PNG,
  "image/webp": MediaFormat.WEBP,
};

export const VIDEO_CONTENT_TYPES: Readonly<Record<string, MediaFormat>> = {
  "video/mp4": MediaFormat.MP4,
  "video/webm": MediaFormat.WEBM,
  "video/quicktime": MediaFormat.MOV,
};

export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;
export const VIDEO_EXTENSIONS = ["mp4", "webm", "mov"] as const;

/** Dimension sanity window: rejects lying/too-small/too-huge image headers. */
export const MIN_IMAGE_DIMENSION = 16;
export const MAX_IMAGE_DIMENSION = 10000;

/** Deterministic variant target widths (heights keep the aspect ratio). */
export const VARIANT_TARGET_WIDTHS: Readonly<Record<MediaVariantKind, number>> =
  { THUMB: 160, PREVIEW: 640 };

export type MediaValidationErrorName =
  | "EMPTY_PAYLOAD"
  | "OVERSIZE"
  | "UNKNOWN_FORMAT"
  | "MAGIC_MISMATCH"
  | "POLYGLOT_SUSPECTED"
  | "DIMENSION_INVALID"
  | "FILENAME_INVALID"
  | "FILENAME_DOUBLE_EXTENSION"
  | "FILENAME_EXTENSION_MISMATCH"
  | "CONTENT_TYPE_UNSUPPORTED";

export class MediaValidationError extends Error {
  readonly code: MediaValidationErrorName;
  constructor(code: MediaValidationErrorName, message?: string) {
    super(message ?? code);
    this.name = "MediaValidationError";
    this.code = code;
  }
}

function bytesStartWith(
  bytes: Uint8Array,
  offset: number,
  signature: readonly number[],
): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/** Sniffs the stored payload; returns the actual container format or null. */
export function sniffMediaFormat(bytes: Uint8Array): MediaFormat | null {
  if (bytes.length === 0) return null;
  if (bytesStartWith(bytes, 0, [0xff, 0xd8, 0xff])) return MediaFormat.JPEG;
  if (
    bytesStartWith(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  )
    return MediaFormat.PNG;
  if (
    bytesStartWith(bytes, 0, [0x52, 0x49, 0x46, 0x46]) &&
    bytesStartWith(bytes, 8, [0x57, 0x45, 0x42, 0x50])
  )
    return MediaFormat.WEBP;
  if (bytesStartWith(bytes, 4, [0x66, 0x74, 0x79, 0x70]))
    return MediaFormat.MP4;
  if (bytesStartWith(bytes, 0, [0x1a, 0x45, 0xdf, 0xa3]))
    return MediaFormat.WEBM;
  // QuickTime MOV: `ftyp` brands such as qt or moov/mwide headers.
  if (bytesStartWith(bytes, 4, [0x6d, 0x6f, 0x6f, 0x76]))
    return MediaFormat.MOV;
  if (bytesStartWith(bytes, 0, [0x00, 0x00, 0x00, 0x14]))
    return MediaFormat.MOV;
  return null;
}

const FORMAT_CONTENT_TYPES: Readonly<Record<MediaFormat, readonly string[]>> = {
  JPEG: ["image/jpeg", "image/jpg"],
  PNG: ["image/png"],
  WEBP: ["image/webp"],
  MP4: ["video/mp4"],
  WEBM: ["video/webm"],
  MOV: ["video/quicktime", "video/mov"],
};

export function kindForFormat(format: MediaFormat): MediaKind {
  return format === MediaFormat.JPEG ||
    format === MediaFormat.PNG ||
    format === MediaFormat.WEBP
    ? MediaKind.IMAGE
    : MediaKind.VIDEO;
}

function declaredMatchesFormat(
  declaredContentType: string,
  format: MediaFormat,
): boolean {
  return FORMAT_CONTENT_TYPES[format].includes(
    declaredContentType.toLowerCase(),
  );
}

/**
 * Dangerous container/script markers that must never appear inside an image.
 * A JPEG carrying `%PDF-` or a PNG carrying `<script` is a polyglot payload,
 * not a displayable property photo.
 */
const POLYGLOT_MARKERS: readonly Uint8Array[] = [
  Uint8Array.of(0x25, 0x50, 0x44, 0x46, 0x2d), // %PDF-
  Uint8Array.of(0x3c, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74), // <script
  Uint8Array.of(0x3c, 0x3f, 0x70, 0x68, 0x70), // <?php
  Uint8Array.of(0x47, 0x49, 0x46, 0x38), // GIF8
  Uint8Array.of(0x50, 0x4b, 0x03, 0x04), // ZIP local header
  Uint8Array.of(0x4d, 0x54, 0x68, 0x64), // MThd (MIDI)
];

function containsMarker(
  bytes: Uint8Array,
  marker: Uint8Array,
  from: number,
): boolean {
  outer: for (
    let start = from;
    start <= bytes.length - marker.length;
    start++
  ) {
    for (let offset = 0; offset < marker.length; offset++) {
      if (bytes[start + offset] !== marker[offset]) continue outer;
    }
    return true;
  }
  return false;
}

/** Parses intrinsic pixel dimensions for confirmed image formats. */
export function parseImageDimensions(
  format: MediaFormat,
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (format === MediaFormat.PNG && bytes.length >= 24) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (format === MediaFormat.WEBP && bytes.length >= 30) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const chunk = String.fromCharCode(
      bytes[12],
      bytes[13],
      bytes[14],
      bytes[15],
    );
    if (chunk === "VP8 ") {
      const w = view.getUint16(26, true) & 0x3fff;
      const h = view.getUint16(28, true) & 0x3fff;
      return { width: w, height: h };
    }
    if (chunk === "VP8L") {
      const bits =
        bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
      const w = (bits & 0x3fff) + 1;
      const h = ((bits >> 14) & 0x3fff) + 1;
      return { width: w, height: h };
    }
    if (chunk === "VP8X") {
      const w = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const h = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      return { width: w, height: h };
    }
    return null;
  }
  if (format === MediaFormat.JPEG) {
    return parseJpegDimensions(bytes);
  }
  return null;
}

function parseJpegDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    // SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC).
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      const view = new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
      );
      const height = view.getUint16(offset + 5);
      const width = view.getUint16(offset + 7);
      return { width, height };
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

export type ValidatedMedia = Readonly<{
  format: MediaFormat;
  kind: MediaKind;
  byteSize: number;
  sha256: string;
  width: number | null;
  height: number | null;
}>;

/**
 * Full confirm-time validation: size limit per kind, magic-byte sniffing
 * (declared content type must match the actual container), polyglot marker
 * scan for images, and image dimension sanity.
 */
export function validateMediaBytes(input: {
  bytes: Uint8Array;
  kind: MediaKind;
  declaredContentType: string;
}): ValidatedMedia {
  const { bytes } = input;
  const maxBytes =
    input.kind === MediaKind.IMAGE ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (bytes.length === 0) throw new MediaValidationError("EMPTY_PAYLOAD");
  if (bytes.length > maxBytes) throw new MediaValidationError("OVERSIZE");

  const format = sniffMediaFormat(bytes);
  if (format === null) throw new MediaValidationError("UNKNOWN_FORMAT");
  if (!declaredMatchesFormat(input.declaredContentType, format))
    throw new MediaValidationError("MAGIC_MISMATCH");

  const actualKind = kindForFormat(format);
  if (actualKind !== input.kind)
    throw new MediaValidationError("MAGIC_MISMATCH");

  if (actualKind === MediaKind.IMAGE) {
    for (const marker of POLYGLOT_MARKERS) {
      if (containsMarker(bytes, marker, 0))
        throw new MediaValidationError("POLYGLOT_SUSPECTED");
    }
  }

  let width: number | null = null;
  let height: number | null = null;
  if (actualKind === MediaKind.IMAGE) {
    const dimensions = parseImageDimensions(format, bytes);
    if (
      dimensions === null ||
      !Number.isSafeInteger(dimensions.width) ||
      !Number.isSafeInteger(dimensions.height) ||
      dimensions.width < MIN_IMAGE_DIMENSION ||
      dimensions.height < MIN_IMAGE_DIMENSION ||
      dimensions.width > MAX_IMAGE_DIMENSION ||
      dimensions.height > MAX_IMAGE_DIMENSION
    )
      throw new MediaValidationError("DIMENSION_INVALID");
    width = dimensions.width;
    height = dimensions.height;
  }

  return {
    format,
    kind: actualKind,
    byteSize: bytes.length,
    sha256: sha256Hex(bytes),
    width,
    height,
  };
}

function sha256Hex(bytes: Uint8Array): string {
  // Synchronous SHA-256 over small bounded payloads (<= 100 MiB) using a
  // compact block implementation — confirm validation must stay deterministic
  // and dependency-free.
  const k = SHA256_K;
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const bitLength = bytes.length * 8;
  const paddedLength = (((bytes.length + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 4, bitLength >>> 0);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  const w = new Uint32Array(64);
  for (let block = 0; block < paddedLength; block += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(block + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4,
      f = h5,
      g = h6,
      h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + k[t] + w[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((word) => word.toString(16).padStart(8, "0"))
    .join("");
}

function rotr(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/**
 * Deterministic variant geometry: scale to the variant target width, keep the
 * aspect ratio, never upscale past the original, half-up rounding. The same
 * input always produces the same output.
 */
export function deriveVariantGeometry(
  variant: MediaVariantKind,
  width: number,
  height: number,
): { width: number; height: number } {
  const targetWidth = VARIANT_TARGET_WIDTHS[variant];
  if (width <= targetWidth) return { width, height };
  const scaledHeight = Math.ceil((height * targetWidth) / width);
  return { width: targetWidth, height: Math.max(1, scaledHeight) };
}

/**
 * Declared-filename policy at intent time: a single dot, an allowlisted
 * extension matching the declared kind, and a safe character set. Rejects
 * double-extension tricks like `photo.jpg.php` before any byte is stored.
 */
export function validateDeclaredFileName(
  fileName: string,
  kind: MediaKind,
): string {
  if (
    typeof fileName !== "string" ||
    fileName.length < 1 ||
    fileName.length > 120 ||
    !/^[A-Za-z0-9._-]+$/.test(fileName) ||
    !fileName.includes(".")
  )
    throw new MediaValidationError("FILENAME_INVALID");
  const parts = fileName.split(".");
  if (parts.length !== 2) {
    if (parts.length > 2)
      throw new MediaValidationError("FILENAME_DOUBLE_EXTENSION");
    throw new MediaValidationError("FILENAME_INVALID");
  }
  const extension = parts[1].toLowerCase();
  const allowed = (
    kind === MediaKind.IMAGE ? IMAGE_EXTENSIONS : VIDEO_EXTENSIONS
  ) as readonly string[];
  if (!allowed.includes(extension))
    throw new MediaValidationError("FILENAME_EXTENSION_MISMATCH");
  return fileName;
}
