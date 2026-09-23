import { CampaignsListView } from "../../../../../features/campaigns/campaigns-list-view";
import { OrganizationProvider } from "../../../../../features/organization-context/organization-context";

export default async function OrganizationCampaignsPage({
  params,
}: Readonly<{ params: Promise<{ organizationId: string }> }>) {
  const { organizationId } = await params;
  return (
    <OrganizationProvider organizationId={organizationId}>
      <CampaignsListView />
    </OrganizationProvider>
  );
}
