import { CommissionCommandWorkspace } from "../../../../../../features/finance/commission-command-workspace";
import { OrganizationProvider } from "../../../../../../features/organization-context/organization-context";

export default async function OrganizationCommissionPage({
  params,
}: Readonly<{ params: Promise<{ organizationId: string }> }>) {
  const { organizationId } = await params;
  return (
    <OrganizationProvider organizationId={organizationId}>
      <CommissionCommandWorkspace />
    </OrganizationProvider>
  );
}
