import type {
  GeoBoundingBox,
  GeoPoint,
  GeoSearchMode,
} from "../domain/geo-search.js";

export type GeoSearchCriteria = {
  mode: GeoSearchMode;
  search?: string;
  propertyType?: string;
  center?: GeoPoint;
  radiusKm?: number;
  polygon?: readonly GeoPoint[];
  bbox?: GeoBoundingBox;
};

export type GeoSearchItem = {
  id: string;
  listingId: string;
  title: string;
  propertyType: string;
  addressText: string;
  latitude: number;
  longitude: number;
};

export type GeoSearchPage = {
  items: readonly GeoSearchItem[];
  nextCursor: string | null;
};

export type GeoCluster = {
  latitude: number;
  longitude: number;
  count: number;
};

export type GeoClusterResult = {
  clusters: readonly GeoCluster[];
  totalMembers: number;
};

export interface GeoSearchRepository {
  search(
    organizationId: string,
    criteria: GeoSearchCriteria,
    cursor: string | undefined,
    limit: number,
  ): Promise<GeoSearchPage>;
  cluster(
    organizationId: string,
    criteria: GeoSearchCriteria,
    cellKm: number,
  ): Promise<GeoClusterResult>;
}
