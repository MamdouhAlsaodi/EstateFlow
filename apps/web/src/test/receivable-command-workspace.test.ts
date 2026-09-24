import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { arMessages } from "../i18n/catalog";

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
  assert.match(workspace, /finance\.receivable\.draftTitle/);
  assert.match(workspace, /finance\.receivable\.issueTitle/);
  assert.match(workspace, /finance\.receivable\.paymentTitle/);
  assert.equal(
    arMessages["finance.receivable.draftTitle"],
    "إنشاء مسودة فاتورة",
  );
  assert.equal(arMessages["finance.receivable.issueTitle"], "إصدار الفاتورة");
  assert.equal(arMessages["finance.receivable.paymentTitle"], "تسجيل دفعة");
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
  assert.match(workspace, /finance\.command\.reauthButton/);
  assert.equal(
    arMessages["finance.command.reauthButton"],
    "إعادة التحقق من الجلسة",
  );
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
