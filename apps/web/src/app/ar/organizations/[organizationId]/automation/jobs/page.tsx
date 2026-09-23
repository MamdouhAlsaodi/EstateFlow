import { OrganizationProvider } from "../../../../../../features/organization-context/organization-context";
import { JobsHistoryView } from "../../../../../../features/automation/jobs-history-view";

export default async function OrganizationAutomationJobsPage({
  params,
}: Readonly<{ params: Promise<{ organizationId: string }> }>) {
  const { organizationId } = await params;
  return (
    <OrganizationProvider organizationId={organizationId}>
      <JobsHistoryView />
    </OrganizationProvider>
  );
}
