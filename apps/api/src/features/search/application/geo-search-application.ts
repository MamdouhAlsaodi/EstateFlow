import {
  decodeCursor,
  validateBoundingBox,
  validatePoint,
  validatePolygon,
  validateRadius,
  type GeoSearchMode,
} from "../domain/geo-search.js";
import { GeoSearchValidationError } from "../domain/geo-search.js";
import type {
  GeoClusterResult,
  GeoSearchCriteria,
  GeoSearchPage,
  GeoSearchRepository,
} from "./geo-search-repository.js";

export type GeoSearchActor = {
  verified: boolean;
  memberships: readonly {
    organizationId: string;
    role: "OWNER" | "MANAGER" | "BROKER" | "CLIENT";
    active: boolean;
  }[];
};

export class GeoSearchAccessDeniedError extends Error {}

const READ_ROLES = new Set(["OWNER", "MANAGER", "BROKER"]);

export class GeoSearchApplication {
  constructor(private readonly repository: GeoSearchRepository) {}

  private requireReader(actor: GeoSearchActor, organizationId: string): void {
    if (
      !actor?.verified ||
      !actor.memberships.some(
        (membership) =>
          membership.organizationId === organizationId &&
          membership.active &&
          READ_ROLES.has(membership.role),
      )
    )
      throw new GeoSearchAccessDeniedError();
  }

  private validateCriteria(criteria: GeoSearchCriteria): GeoSearchCriteria {
    if (!["radius", "polygon", "bbox"].includes(criteria.mode))
      throw new GeoSearchValidationError("Invalid search mode");
    if (criteria.search !== undefined && criteria.search.length > 200)
      throw new GeoSearchValidationError("Invalid search");
    if (
      criteria.propertyType !== undefined &&
      (criteria.propertyType.length === 0 || criteria.propertyType.length > 100)
    )
      throw new GeoSearchValidationError("Invalid propertyType");
    if (criteria.mode === "radius") {
      if (!criteria.center || criteria.radiusKm === undefined)
        throw new GeoSearchValidationError(
          "Radius requires center and radiusKm",
        );
      validateRadius(criteria.center, criteria.radiusKm);
      return { ...criteria, center: validatePoint(criteria.center, "center") };
    }
    if (criteria.mode === "polygon") {
      if (!criteria.polygon)
        throw new GeoSearchValidationError("Polygon is required");
      return { ...criteria, polygon: validatePolygon(criteria.polygon) };
    }
    if (!criteria.bbox) throw new GeoSearchValidationError("Bbox is required");
    return { ...criteria, bbox: validateBoundingBox(criteria.bbox) };
  }

  async search(input: {
    actor: GeoSearchActor;
    organizationId: string;
    criteria: GeoSearchCriteria;
    cursor?: string;
    limit?: number;
  }): Promise<GeoSearchPage> {
    this.requireReader(input.actor, input.organizationId);
    const limit = input.limit ?? 50;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new GeoSearchValidationError("Invalid limit");
    const cursor =
      input.cursor === undefined ? undefined : decodeCursor(input.cursor);
    return this.repository.search(
      input.organizationId,
      this.validateCriteria(input.criteria),
      cursor,
      limit,
    );
  }

  async cluster(input: {
    actor: GeoSearchActor;
    organizationId: string;
    criteria: GeoSearchCriteria;
    cellKm?: number;
  }): Promise<GeoClusterResult> {
    this.requireReader(input.actor, input.organizationId);
    const cellKm = input.cellKm ?? 1;
    if (!Number.isFinite(cellKm) || cellKm < 0.1 || cellKm > 10)
      throw new GeoSearchValidationError("Invalid cellKm");
    return this.repository.cluster(
      input.organizationId,
      this.validateCriteria(input.criteria),
      cellKm,
    );
  }
}

export type { GeoSearchMode };
