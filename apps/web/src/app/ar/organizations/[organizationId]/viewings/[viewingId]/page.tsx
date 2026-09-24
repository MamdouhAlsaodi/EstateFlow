import { OrganizationProvider } from "../../../../../../features/organization-context/organization-context";
import { ViewingDetailView } from "../../../../../../features/viewings/viewing-detail-view";

export default async function ViewingDetailPage({
  params,
}: Readonly<{
  params: Promise<{ organizationId: string; viewingId: string }>;
}>) {
  const { organizationId, viewingId } = await params;
  return (
    <OrganizationProvider organizationId={organizationId}>
      <ViewingDetailView viewingId={viewingId} />
    </OrganizationProvider>
  );
}
