import { ContentPublishingView } from "../../../../../../features/content/content-publishing-view";
import { OrganizationProvider } from "../../../../../../features/organization-context/organization-context";

export default async function OrganizationContentPublishingPage({
  params,
}: Readonly<{ params: Promise<{ organizationId: string }> }>) {
  const { organizationId } = await params;
  return (
    <OrganizationProvider organizationId={organizationId}>
      <ContentPublishingView />
    </OrganizationProvider>
  );
}
