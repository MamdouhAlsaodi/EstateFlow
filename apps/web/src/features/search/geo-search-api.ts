import type {
  GeoClusterResult,
  GeoSearchInput,
  GeoSearchPage,
} from "./geo-search-contract";

/**
 * EF-630 — stable failure code; the visible message is resolved from the
 * translation catalog by the view (`search.apiLoadFailed`).
 */
export const GEO_SEARCH_LOAD_FAILED = "GEO_SEARCH_LOAD_FAILED";

function queryString(input: GeoSearchInput): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return query.toString();
}

async function get<T>(
  organizationId: string,
  path: string,
  input: GeoSearchInput,
): Promise<T> {
  const response = await fetch(
    `/api/organizations/${encodeURIComponent(organizationId)}/search/properties${path}?${queryString(input)}`,
    { credentials: "include", headers: { accept: "application/json" } },
  );
  if (!response.ok) throw new Error(GEO_SEARCH_LOAD_FAILED);
  return (await response.json()) as T;
}

export function searchProperties(
  organizationId: string,
  input: GeoSearchInput,
): Promise<GeoSearchPage> {
  return get(organizationId, "", input);
}

export function getPropertyClusters(
  organizationId: string,
  input: GeoSearchInput,
): Promise<GeoClusterResult> {
  return get(organizationId, "/clusters", input);
}
