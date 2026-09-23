import { ContentCalendarView } from "../../../../../../features/content/content-calendar-view";
import { OrganizationProvider } from "../../../../../../features/organization-context/organization-context";

export default async function OrganizationContentCalendarPage({
  params,
}: Readonly<{ params: Promise<{ organizationId: string }> }>) {
  const { organizationId } = await params;
  return (
    <OrganizationProvider organizationId={organizationId}>
      <ContentCalendarView />
    </OrganizationProvider>
  );
}
