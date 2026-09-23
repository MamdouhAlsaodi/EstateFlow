import { CampaignDetailView } from "../../../../../../features/campaigns/campaign-detail-view";
import { OrganizationProvider } from "../../../../../../features/organization-context/organization-context";

export default async function OrganizationCampaignDetailPage({
  params,
}: Readonly<{
  params: Promise<{ organizationId: string; campaignId: string }>;
}>) {
  const { organizationId, campaignId } = await params;
  return (
    <OrganizationProvider organizationId={organizationId}>
      <CampaignDetailView campaignId={campaignId} />
    </OrganizationProvider>
  );
}
