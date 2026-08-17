import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
async function source(path: string): Promise<string> {
  return readFile(new URL(path, root), "utf8");
}

test("receivables route is organization-scoped without fallback identity", async () => {
  const route = await source(
    "app/ar/organizations/[organizationId]/finance/receivables/page.tsx",
  );
  assert.match(route, /params/);
  assert.match(route, /organizationId/);
  assert.match(route, /ReceivableReconciliationWorkspace/);
  assert.doesNotMatch(
    route,
    /fallback|demo-org|defaultOrganization|organizationId\s*\|\|/i,
  );
});

test("workspace exposes exactly the accepted Arabic financial command sequence", async () => {
  const workspace = await source(
    "features/finance/receivable-command-workspace.tsx",
  );
  const contract = await source(
    "features/finance/receivable-command-contract.ts",
  );
  assert.match(workspace, /createInvoiceDraft/);
  assert.match(workspace, /issueInvoice/);
  assert.match(workspace, /recordReceivablePayment/);
  assert.match(workspace, /إنشاء مسودة فاتورة/);
  assert.match(workspace, /إصدار الفاتورة/);
  assert.match(workspace, /تسجيل دفعة/);
  assert.match(workspace, /createSessionCsrfProvider/);
  assert.match(workspace, /paymentKey/);
  assert.match(workspace, /crypto\.randomUUID\(\)/);
  assert.match(contract, /kind === "replayed"/);
  assert.match(workspace, /role=.*alert/);
  assert.match(workspace, /role=.*status/);
  assert.doesNotMatch(workspace, /fetch\s*\(/);
  assert.doesNotMatch(
    workspace,
    /getReceivable|listReceivable|receivableBalance|receivableAging|ledger|cancelInvoice|amendInvoice|refundPayment|exportReceivable/i,
  );
});

test("workspace keeps payment retry identity until success and validates before API calls", async () => {
  const workspace = await source(
    "features/finance/receivable-command-workspace.tsx",
  );
  assert.match(workspace, /setPaymentKey\(crypto\.randomUUID\(\)\)/);
  assert.match(workspace, /amountMinor/);
  assert.match(workspace, /isUtc/);
  assert.match(workspace, /isUuid/);
  assert.match(workspace, /sessionCsrfProvider\.getToken\(\)/);
  assert.match(workspace, /sessionCsrfProvider\.clear\(\)/);
  assert.match(workspace, /إعادة التحقق من الجلسة/);
});

test("workspace styles encode a responsive three-step financial rail", async () => {
  const styles = await source(
    "features/finance/receivable-command-workspace.module.css",
  );
  assert.match(styles, /\.rail/);
  assert.match(styles, /\.step/);
  assert.match(styles, /var\(--ef-gold/);
  assert.match(styles, /@media/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.doesNotMatch(styles, /(^|\n)body\b|(^|\n)button\b/);
});
