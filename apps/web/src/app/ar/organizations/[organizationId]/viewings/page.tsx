import { OrganizationProvider } from "../../../../../features/organization-context/organization-context";
import { ViewingsListView } from "../../../../../features/viewings/viewings-list-view";

export default async function OrganizationViewingsPage({
  params,
}: Readonly<{ params: Promise<{ organizationId: string }> }>) {
  const { organizationId } = await params;
  return (
    <OrganizationProvider organizationId={organizationId}>
      <ViewingsListView />
    </OrganizationProvider>
  );
}
