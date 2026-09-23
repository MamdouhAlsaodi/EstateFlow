import { ContentDetailView } from "../../../../../../features/content/content-detail-view";
import { OrganizationProvider } from "../../../../../../features/organization-context/organization-context";

export default async function OrganizationContentItemPage({
  params,
}: Readonly<{
  params: Promise<{ organizationId: string; contentId: string }>;
}>) {
  const { organizationId, contentId } = await params;
  return (
    <OrganizationProvider organizationId={organizationId}>
      <ContentDetailView contentItemId={contentId} />
    </OrganizationProvider>
  );
}
