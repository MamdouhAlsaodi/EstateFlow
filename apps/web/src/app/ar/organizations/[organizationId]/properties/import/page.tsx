import { CsvImportWorkspace } from "../../../../../../features/properties/csv-import-workspace";
import { OrganizationProvider } from "../../../../../../features/organization-context/organization-context";

export default async function OrganizationPropertiesImportPage({
  params,
}: Readonly<{ params: Promise<{ organizationId: string }> }>) {
  const { organizationId } = await params;
  return (
    <OrganizationProvider organizationId={organizationId}>
      <CsvImportWorkspace />
    </OrganizationProvider>
  );
}
