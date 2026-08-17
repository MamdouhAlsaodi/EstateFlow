export const ImageMediaType = {
  JPEG: "JPEG",
  PNG: "PNG",
  WEBP: "WEBP",
} as const;
export type ImageMediaType =
  (typeof ImageMediaType)[keyof typeof ImageMediaType];

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES_PER_LISTING = 10;

export function validateImageCount(existingCount: unknown): void {
  if (
    typeof existingCount !== "number" ||
    !Number.isSafeInteger(existingCount) ||
    existingCount < 0 ||
    existingCount >= MAX_IMAGES_PER_LISTING
  ) {
    throw new Error("Image metadata limit exceeded");
  }
}

export type ImageMetadata = {
  id: string;
  listingId: string;
  mediaType: ImageMediaType;
  byteSize: number;
  position: number;
  createdAt: Date;
  updatedAt: Date;
};

export function validateImageMetadata(input: {
  mediaType: unknown;
  byteSize: unknown;
  position: unknown;
}): { mediaType: ImageMediaType; byteSize: number; position: number } {
  if (
    input.mediaType !== ImageMediaType.JPEG &&
    input.mediaType !== ImageMediaType.PNG &&
    input.mediaType !== ImageMediaType.WEBP
  ) {
    throw new Error("Unsupported image media type");
  }
  const byteSize = input.byteSize;
  if (
    typeof byteSize !== "number" ||
    !Number.isSafeInteger(byteSize) ||
    byteSize < 1 ||
    byteSize > MAX_IMAGE_BYTES
  ) {
    throw new Error("Invalid image size");
  }
  const position = input.position;
  if (
    typeof position !== "number" ||
    !Number.isSafeInteger(position) ||
    position < 0
  )
    throw new Error("Invalid image position");
  return { mediaType: input.mediaType, byteSize, position };
}
