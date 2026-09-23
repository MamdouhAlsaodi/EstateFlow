import { OwnerFinanceDashboard } from "../../../../../../features/finance/owner-finance-dashboard";
import { OrganizationProvider } from "../../../../../../features/organization-context/organization-context";

export default async function OrganizationOwnerReportPage({
  params,
}: Readonly<{ params: Promise<{ organizationId: string }> }>) {
  const { organizationId } = await params;
  return (
    <OrganizationProvider organizationId={organizationId}>
      <OwnerFinanceDashboard />
    </OrganizationProvider>
  );
}
