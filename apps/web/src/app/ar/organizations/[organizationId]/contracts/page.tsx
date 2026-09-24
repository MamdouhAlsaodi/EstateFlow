import { ContractsWorkspace } from "../../../../../features/contracts/contracts-workspace";
import { OrganizationProvider } from "../../../../../features/organization-context/organization-context";

export default async function OrganizationContractsPage({
  params,
}: Readonly<{
  params: Promise<{ organizationId: string }>;
}>) {
  const { organizationId } = await params;
  return (
    <OrganizationProvider organizationId={organizationId}>
      <ContractsWorkspace organizationId={organizationId} />
    </OrganizationProvider>
  );
}
