import { ExpenseCommandWorkspace } from "../../../../../../features/finance/expense-command-workspace";
import { OrganizationProvider } from "../../../../../../features/organization-context/organization-context";

export default async function OrganizationExpensesPage({
  params,
}: Readonly<{ params: Promise<{ organizationId: string }> }>) {
  const { organizationId } = await params;
  return (
    <OrganizationProvider organizationId={organizationId}>
      <ExpenseCommandWorkspace />
    </OrganizationProvider>
  );
}
