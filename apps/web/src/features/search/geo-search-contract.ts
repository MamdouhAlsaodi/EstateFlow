export type GeoSearchMode = "radius" | "polygon" | "bbox";

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
  items: GeoSearchItem[];
  nextCursor: string | null;
};

export type GeoClusterResult = {
  clusters: { latitude: number; longitude: number; count: number }[];
  totalMembers: number;
};

export type GeoSearchInput = {
  mode: GeoSearchMode;
  search?: string;
  propertyType?: string;
  centerLat?: number;
  centerLng?: number;
  radiusKm?: number;
  polygon?: string;
  bbox?: string;
  cursor?: string;
  limit?: number;
  cellKm?: number;
};
