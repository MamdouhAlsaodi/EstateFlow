import { PropertyDetailView } from "../../../../../../features/properties/property-detail-view";
import { OrganizationProvider } from "../../../../../../features/organization-context/organization-context";

export default async function OrganizationPropertyDetailPage({
  params,
}: Readonly<{
  params: Promise<{ organizationId: string; propertyId: string }>;
}>) {
  const { organizationId, propertyId } = await params;
  return (
    <OrganizationProvider organizationId={organizationId}>
      <PropertyDetailView
        organizationId={organizationId}
        propertyId={propertyId}
      />
    </OrganizationProvider>
  );
}
