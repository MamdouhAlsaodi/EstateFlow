import { OrganizationProvider } from "../../../../../../../features/organization-context/organization-context";
import { RuleDetailView } from "../../../../../../../features/automation/rule-detail-view";

export default async function OrganizationAutomationRulePage({
  params,
}: Readonly<{ params: Promise<{ organizationId: string; ruleId: string }> }>) {
  const { organizationId, ruleId } = await params;
  return (
    <OrganizationProvider organizationId={organizationId}>
      <RuleDetailView ruleId={ruleId} />
    </OrganizationProvider>
  );
}
