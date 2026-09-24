import { GeoSearchView } from "../../../../../features/search/geo-search-view";
import { OrganizationProvider } from "../../../../../features/organization-context/organization-context";

export default async function OrganizationGeoSearchPage({
  params,
}: Readonly<{ params: Promise<{ organizationId: string }> }>) {
  const { organizationId } = await params;
  return (
    <OrganizationProvider organizationId={organizationId}>
      <GeoSearchView organizationId={organizationId} />
    </OrganizationProvider>
  );
}
