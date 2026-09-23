import { OrganizationProvider } from "../../../../../features/organization-context/organization-context";
import { AutomationVisibility } from "../../../../../features/automation/automation-visibility";

export default async function OrganizationAutomationPage({
  params,
}: Readonly<{ params: Promise<{ organizationId: string }> }>) {
  const { organizationId } = await params;
  return (
    <OrganizationProvider organizationId={organizationId}>
      <AutomationVisibility />
    </OrganizationProvider>
  );
}
