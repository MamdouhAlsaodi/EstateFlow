import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { arMessages } from "../i18n/catalog";
import {
  appendAgingItems,
  type ReceivableAgingItem,
} from "../features/finance/receivable-aging-model";
import { normalizeReceivableAging } from "../lib/api-client/receivable-aging";

const root = new URL("../", import.meta.url);
async function source(path: string): Promise<string> {
  return readFile(new URL(path, root), "utf8");
}

const valid = {
  asOf: "2026-08-17T10:00:00.000Z",
  items: [
    {
      receivableId: "11111111-1111-4111-8111-111111111104",
      invoiceId: "11111111-1111-4111-8111-111111111103",
      dealId: "11111111-1111-4111-8111-111111111102",
      currency: "USD",
      originalAmountMinor: "9007199254740993",
      outstandingMinor: "9007199254740993",
      status: "OPEN",
      issuedAt: "2026-08-01T10:00:00.000Z",
      dueAt: "2026-08-10T10:00:00.000Z",
      daysPastDue: 7,
      bucket: "DAYS_1_30",
    },
  ],
  nextCursor: "eyJ2IjoxfQ",
};

test("aging normalizer preserves exact money and rejects closed-contract violations", () => {
  const result = normalizeReceivableAging(valid);
  assert.equal(result.items[0]?.outstandingMinor, "9007199254740993");
  assert.throws(() => normalizeReceivableAging({ ...valid, unexpected: true }));
  assert.throws(() =>
    normalizeReceivableAging({
      ...valid,
      items: [{ ...valid.items[0], daysPastDue: -1 }],
    }),
  );
  assert.throws(() =>
    normalizeReceivableAging({
      ...valid,
      items: [{ ...valid.items[0], invoiceId: "bad" }],
    }),
  );
  assert.throws(() =>
    normalizeReceivableAging({
      ...valid,
      items: [valid.items[0], { ...valid.items[0] }],
    }),
  );
});

test("aging pagination deduplicates current and incoming rows in first-seen order", () => {
  const current = valid.items as readonly ReceivableAgingItem[];
  const duplicate = { ...current[0] };
  const incoming = [
    duplicate,
    { ...duplicate, receivableId: "11111111-1111-4111-8111-111111111105" },
    duplicate,
  ];
  const result = appendAgingItems(current, incoming);
  assert.deepEqual(
    result.map((item) => item.receivableId),
    [current[0]?.receivableId, "11111111-1111-4111-8111-111111111105"],
  );
});

test("reconciliation composition keeps commands and bounded panels separate", async () => {
  const page = await source(
    "app/ar/organizations/[organizationId]/finance/receivables/page.tsx",
  );
  const composition = await source(
    "features/finance/receivable-reconciliation-workspace.tsx",
  );
  const cancellation = await source(
    "features/finance/receivable-cancellation-panel.tsx",
  );
  const aging = await source("features/finance/receivable-aging-panel.tsx");
  const styles = await source(
    "features/finance/receivable-reconciliation-workspace.module.css",
  );
  assert.match(page, /ReceivableReconciliationWorkspace/);
  assert.match(composition, /ReceivableCommandWorkspace/);
  assert.match(cancellation, /cancelInvoice/);
  assert.match(cancellation, /finance\.cancellation\.paidConflict/);
  assert.equal(
    arMessages["finance.cancellation.paidConflict"],
    "لا يمكن إلغاء فاتورة عليها دفعة مالية.",
  );
  assert.match(aging, /nextCursor/);
  assert.match(aging, /appendAgingItems/);
  assert.doesNotMatch(
    `${cancellation}${aging}`,
    /refund|reversal|negative-payment|asOf.*input/i,
  );
  assert.match(styles, /@media/);
  assert.match(styles, /focus-visible/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.doesNotMatch(styles, /(^|\n)body\b|(^|\n)button\b/);
});
