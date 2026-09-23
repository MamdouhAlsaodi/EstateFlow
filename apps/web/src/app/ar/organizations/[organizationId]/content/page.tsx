import { ContentListView } from "../../../../../features/content/content-list-view";
import { OrganizationProvider } from "../../../../../features/organization-context/organization-context";

export default async function OrganizationContentPage({
  params,
}: Readonly<{ params: Promise<{ organizationId: string }> }>) {
  const { organizationId } = await params;
  return (
    <OrganizationProvider organizationId={organizationId}>
      <ContentListView />
    </OrganizationProvider>
  );
}
