import { ContentReviewQueueView } from "../../../../../../features/content/content-review-queue-view";
import { OrganizationProvider } from "../../../../../../features/organization-context/organization-context";

export default async function OrganizationContentReviewQueuePage({
  params,
}: Readonly<{ params: Promise<{ organizationId: string }> }>) {
  const { organizationId } = await params;
  return (
    <OrganizationProvider organizationId={organizationId}>
      <ContentReviewQueueView />
    </OrganizationProvider>
  );
}
