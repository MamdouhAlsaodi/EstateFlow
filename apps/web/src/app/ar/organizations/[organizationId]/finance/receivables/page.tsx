import { ReceivableReconciliationWorkspace } from "../../../../../../features/finance/receivable-reconciliation-workspace";
import { OrganizationProvider } from "../../../../../../features/organization-context/organization-context";

export default async function OrganizationReceivablesPage({
  params,
}: Readonly<{ params: Promise<{ organizationId: string }> }>) {
  const { organizationId } = await params;
  return (
    <OrganizationProvider organizationId={organizationId}>
      <ReceivableReconciliationWorkspace />
    </OrganizationProvider>
  );
}
