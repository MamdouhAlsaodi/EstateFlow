import { OrganizationProvider } from "../../../../../features/organization-context/organization-context";
import { LeadBoard } from "../../../../../features/leads/lead-board";

export default async function OrganizationLeadsPage({
  params,
}: Readonly<{ params: Promise<{ organizationId: string }> }>) {
  const { organizationId } = await params;
  return (
    <OrganizationProvider organizationId={organizationId}>
      <LeadBoard />
    </OrganizationProvider>
  );
}
