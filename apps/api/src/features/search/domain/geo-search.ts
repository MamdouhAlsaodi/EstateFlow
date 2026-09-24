export const GeoSearchMode = {
  RADIUS: "radius",
  POLYGON: "polygon",
  BBOX: "bbox",
} as const;
export type GeoSearchMode = (typeof GeoSearchMode)[keyof typeof GeoSearchMode];

export type GeoPoint = { latitude: number; longitude: number };
export type GeoBoundingBox = {
  minLatitude: number;
  minLongitude: number;
  maxLatitude: number;
  maxLongitude: number;
};

export class GeoSearchValidationError extends Error {
  constructor(message = "Invalid geo search") {
    super(message);
    this.name = "GeoSearchValidationError";
  }
}

function coordinate(value: unknown, name: string, min: number, max: number) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new GeoSearchValidationError(`Invalid ${name}`);
  return value;
}

export function validatePoint(point: GeoPoint, name = "point"): GeoPoint {
  return {
    latitude: coordinate(point?.latitude, `${name}.latitude`, -90, 90),
    longitude: coordinate(point?.longitude, `${name}.longitude`, -180, 180),
  };
}

export function validateRadius(center: GeoPoint, radiusKm: number): void {
  validatePoint(center, "center");
  if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 500)
    throw new GeoSearchValidationError("Invalid radiusKm");
}

export function validatePolygon(
  ring: readonly GeoPoint[],
): readonly GeoPoint[] {
  if (ring.length < 4 || ring.length > 1000)
    throw new GeoSearchValidationError(
      "Polygon ring must have 4 to 1000 points",
    );
  const points = ring.map((point) => validatePoint(point, "polygon"));
  const first = points[0];
  const last = points.at(-1);
  if (first.latitude !== last?.latitude || first.longitude !== last.longitude)
    throw new GeoSearchValidationError("Polygon ring must be closed");
  return points;
}

export function validateBoundingBox(box: GeoBoundingBox): GeoBoundingBox {
  const result = {
    minLatitude: coordinate(box.minLatitude, "minLatitude", -90, 90),
    minLongitude: coordinate(box.minLongitude, "minLongitude", -180, 180),
    maxLatitude: coordinate(box.maxLatitude, "maxLatitude", -90, 90),
    maxLongitude: coordinate(box.maxLongitude, "maxLongitude", -180, 180),
  };
  if (
    result.minLatitude > result.maxLatitude ||
    result.minLongitude > result.maxLongitude
  )
    throw new GeoSearchValidationError("Invalid bbox bounds");
  return result;
}

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const left = validatePoint(a, "a");
  const right = validatePoint(b, "b");
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(left.latitude)) *
      Math.cos(radians(right.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function encodeCursor(propertyId: string): string {
  return Buffer.from(propertyId, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): string {
  try {
    const value = Buffer.from(cursor, "base64url").toString("utf8");
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    )
      throw new Error();
    return value;
  } catch {
    throw new GeoSearchValidationError("Invalid cursor");
  }
}
