import type {
  GeoClusterResult,
  GeoSearchInput,
  GeoSearchPage,
} from "./geo-search-contract";

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
  if (!response.ok) throw new Error("تعذر تحميل نتائج البحث الجغرافي");
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
