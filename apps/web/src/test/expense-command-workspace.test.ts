import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
async function source(path: string): Promise<string> {
  return readFile(new URL(path, root), "utf8");
}

test("expenses route is organization-scoped without fallback identity", async () => {
  const route = await source(
    "app/ar/organizations/[organizationId]/finance/expenses/page.tsx",
  );
  assert.match(route, /params/);
  assert.match(route, /organizationId/);
  assert.match(route, /ExpenseCommandWorkspace/);
  assert.doesNotMatch(
    route,
    /fallback|demo-org|defaultOrganization|organizationId\s*\|\|/i,
  );
});

test("workspace exposes exactly the accepted Arabic expense command sequence", async () => {
  const workspace = await source(
    "features/finance/expense-command-workspace.tsx",
  );
  const contract = await source("features/finance/expense-command-contract.ts");
  assert.match(workspace, /finance\/expenses`/);
  assert.match(workspace, /\/evidence`/);
  assert.match(workspace, /\/submit`/);
  assert.match(workspace, /\/decision`/);
  assert.match(workspace, /expense-approval-policy/);
  assert.match(workspace, /إنشاء مسودة مصروف/);
  assert.match(workspace, /إرفاق بيانات المستند/);
  assert.match(workspace, /الإرسال للاعتماد/);
  assert.match(workspace, /قرار الاعتماد/);
  assert.match(workspace, /سياسة حد الاعتماد/);
  assert.match(workspace, /createSessionCsrfProvider/);
  assert.match(workspace, /evidenceKey/);
  assert.match(workspace, /crypto\.randomUUID\(\)/);
  assert.match(contract, /kind === "replayed"/);
  assert.match(workspace, /role=.*alert/);
  assert.match(workspace, /role=.*status/);
  assert.doesNotMatch(workspace, /fetch\s*\(/);
  assert.doesNotMatch(
    workspace,
    /listExpense|getExpense|readExpense|refund|reversal|ledger|deleteExpense|exportExpense|journal/i,
  );
});

test("workspace keeps evidence retry identity until success and validates before API calls", async () => {
  const workspace = await source(
    "features/finance/expense-command-workspace.tsx",
  );
  assert.match(workspace, /setEvidenceKey\(crypto\.randomUUID\(\)\)/);
  assert.match(workspace, /amountMinor/);
  assert.match(workspace, /isUtc/);
  assert.match(workspace, /isUuid/);
  assert.match(workspace, /isByteSize/);
  assert.match(workspace, /isCategory/);
  assert.match(workspace, /encodeURIComponent\(organizationId\)/);
  assert.match(workspace, /encodeURIComponent\(form\.expenseId\)/);
  assert.match(workspace, /sessionCsrfProvider\.getToken\(\)/);
  assert.match(workspace, /sessionCsrfProvider\.clear\(\)/);
  assert.match(workspace, /إعادة التحقق من الجلسة/);
  assert.match(workspace, /REJECTED/);
  assert.match(workspace, /الرفض يتطلب سببًا/);
});

test("workspace styles encode a responsive five-step financial rail", async () => {
  const styles = await source(
    "features/finance/expense-command-workspace.module.css",
  );
  assert.match(styles, /\.rail/);
  assert.match(styles, /\.step/);
  assert.match(styles, /var\(--ef-gold/);
  assert.match(styles, /@media/);
  assert.match(styles, /prefers-reduced-motion/);
});

test("expense commands match the generated API client contract", async () => {
  const generated = await source(
    "../../../packages/api-client/src/generated.ts",
  );
  for (const method of [
    "createExpenseDraft",
    "attachExpenseEvidence",
    "submitExpenseForApproval",
    "decideExpenseApproval",
    "setExpenseApprovalPolicy",
  ])
    assert.match(generated, new RegExp(`${method}: \\(`));
  const contract = await source("features/finance/expense-command-contract.ts");
  for (const category of ["OFFICE", "CAMPAIGN", "PROPERTY", "OTHER"])
    assert.match(contract, new RegExp(category));
  for (const mediaType of ["PDF", "JPEG", "PNG", "WEBP"])
    assert.match(contract, new RegExp(mediaType));
});
