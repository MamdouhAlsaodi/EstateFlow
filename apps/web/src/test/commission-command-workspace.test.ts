import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, root), "utf8");
}

test("commission route is organization-scoped without fallback identity", async () => {
  const route = await source(
    "app/ar/organizations/[organizationId]/finance/commissions/page.tsx",
  );
  assert.match(route, /params/);
  assert.match(route, /organizationId/);
  assert.match(route, /CommissionCommandWorkspace/);
  assert.doesNotMatch(
    route,
    /fallback|demo-org|defaultOrganization|organizationId\s*\|\|/i,
  );
});

test("workspace exposes exactly three Arabic commands through the API client", async () => {
  const workspace = await source(
    "features/finance/commission-command-workspace.tsx",
  );
  assert.match(workspace, /createCommissionPlanVersion/);
  assert.match(workspace, /captureCommissionableValue/);
  assert.match(workspace, /createExpectedAccrual/);
  assert.match(workspace, /createSessionCsrfProvider/);
  assert.match(workspace, /crypto\.randomUUID\(\)/);
  assert.match(workspace, /pending/);
  assert.match(workspace, /role=.*alert/);
  assert.match(workspace, /role=.*status/);
  assert.match(workspace, /إنشاء نسخة خطة العمولة/);
  assert.match(workspace, /التقاط القيمة القابلة للعمولة/);
  assert.match(workspace, /إنشاء الاستحقاق المتوقع/);
  assert.doesNotMatch(workspace, /fetch\s*\(/);
  assert.doesNotMatch(
    workspace,
    /getCommission|listCommission|balance|ledger|invoice|payment|payable|\bDeal\b|\bLead\b/i,
  );
});

test("workspace has scoped validation, success replay messaging, and safe retry", async () => {
  const workspace = await source(
    "features/finance/commission-command-workspace.tsx",
  );
  assert.match(workspace, /amountMinor/);
  assert.match(workspace, /UUID/);
  assert.match(workspace, /sessionCsrfProvider\.getToken\(\)/);
  assert.match(workspace, /sessionCsrfProvider\.clear\(\)/);
  assert.match(workspace, /kind === "replayed"/);
  assert.doesNotMatch(workspace, /idempotent-replay/);
  assert.match(workspace, /إعادة التحقق من الجلسة/);
  assert.match(workspace, /amountMinor: ""/);
});

test("workspace styles are scoped and responsive", async () => {
  const styles = await source(
    "features/finance/commission-command-workspace.module.css",
  );
  assert.match(styles, /@media/);
  assert.match(styles, /\.workspace/);
  assert.doesNotMatch(styles, /(^|\n)body\b|(^|\n)button\b/);
});
