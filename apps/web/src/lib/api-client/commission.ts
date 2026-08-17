import type { ApiClient } from "./index";

type CommandContext = Readonly<{ organizationId: string; csrfToken: string }>;
type DealCommandContext = Readonly<CommandContext & { dealId: string }>;
export type CommissionRecipientInput = Readonly<{
  order: number;
  kind: "BROKER" | "OFFICE";
  splitBps: number;
}>;
export type CommissionPlanInput =
  | Readonly<{ version: number }>
  | Readonly<{
      version: number;
      rateBps: number;
      recipients: readonly CommissionRecipientInput[];
    }>;
export type CommissionValueInput = Readonly<{
  valueId: string;
  amountMinor: string;
  currency: string;
  capturedAt: string;
}>;
export type CommissionAccrualInput = Readonly<{
  accrualId: string;
  commissionableValueId: string;
  commissionPlanVersionId: string;
  dealClosedWonEventId: string;
}>;
export type CommissionAdapter = Readonly<{
  createCommissionPlanVersion(
    context: CommandContext,
    input: CommissionPlanInput,
  ): Promise<unknown>;
  captureCommissionableValue(
    context: DealCommandContext,
    input: CommissionValueInput,
  ): Promise<unknown>;
  createExpectedAccrual(
    context: DealCommandContext,
    input: CommissionAccrualInput,
  ): Promise<unknown>;
}>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const AMOUNT = /^[1-9]\d*$/;

export function createCommissionAdapter(
  client: Pick<ApiClient, "request">,
): CommissionAdapter {
  return {
    createCommissionPlanVersion: (context, input) => {
      assertUuid(context.organizationId);
      return client.request(
        `/organizations/${encodeURIComponent(context.organizationId)}/finance/commission-plan-versions`,
        {
          method: "POST",
          csrfToken: context.csrfToken,
          body: serializePlan(input),
        },
      );
    },
    captureCommissionableValue: (context, input) => {
      assertCommandContext(context);
      return client.request(
        `/organizations/${encodeURIComponent(context.organizationId)}/finance/deals/${encodeURIComponent(context.dealId)}/commissionable-values`,
        {
          method: "POST",
          csrfToken: context.csrfToken,
          body: serializeValue(input),
        },
      );
    },
    createExpectedAccrual: (context, input) => {
      assertCommandContext(context);
      return client.request(
        `/organizations/${encodeURIComponent(context.organizationId)}/finance/deals/${encodeURIComponent(context.dealId)}/expected-commissions`,
        {
          method: "POST",
          csrfToken: context.csrfToken,
          body: serializeAccrual(input),
        },
      );
    },
  };
}

function serializePlan(input: CommissionPlanInput): CommissionPlanInput {
  assertExactKeys(input, ["version", "rateBps", "recipients"]);
  assertSafePositiveInteger(input.version, "version");
  const hasRate = "rateBps" in input;
  const hasRecipients = "recipients" in input;
  if (hasRate !== hasRecipients)
    throw new TypeError("Commission policy must be complete");
  if (!hasRate) return { version: input.version };
  assertSafeInteger(input.rateBps, "rateBps", 1, 10000);
  if (!Array.isArray(input.recipients) || input.recipients.length === 0)
    throw new TypeError("Invalid commission recipients");
  input.recipients.forEach((recipient, index) => {
    assertExactKeys(recipient, ["order", "kind", "splitBps"]);
    assertSafeInteger(recipient.order, "recipient order", index + 1, index + 1);
    if (recipient.kind !== "BROKER" && recipient.kind !== "OFFICE")
      throw new TypeError("Unsupported recipient kind");
    assertSafeInteger(recipient.splitBps, "recipient split", 1, 10000);
  });
  if (
    input.recipients.reduce(
      (total, recipient) => total + recipient.splitBps,
      0,
    ) !== 10000
  )
    throw new TypeError("Invalid commission split total");
  return {
    version: input.version,
    rateBps: input.rateBps,
    recipients: input.recipients.map((recipient) => ({ ...recipient })),
  };
}

function serializeValue(input: CommissionValueInput): CommissionValueInput {
  assertExactKeys(input, ["valueId", "amountMinor", "currency", "capturedAt"]);
  assertUuid(input.valueId);
  if (typeof input.amountMinor !== "string" || !AMOUNT.test(input.amountMinor))
    throw new TypeError("Invalid amountMinor");
  if (typeof input.currency !== "string" || !/^[A-Z]{3}$/.test(input.currency))
    throw new TypeError("Invalid currency");
  if (
    typeof input.capturedAt !== "string" ||
    !UTC.test(input.capturedAt) ||
    Number.isNaN(Date.parse(input.capturedAt))
  )
    throw new TypeError("Invalid UTC timestamp");
  return { ...input };
}

function serializeAccrual(
  input: CommissionAccrualInput,
): CommissionAccrualInput {
  assertExactKeys(input, [
    "accrualId",
    "commissionableValueId",
    "commissionPlanVersionId",
    "dealClosedWonEventId",
  ]);
  assertUuid(input.accrualId);
  assertUuid(input.commissionableValueId);
  assertUuid(input.commissionPlanVersionId);
  assertUuid(input.dealClosedWonEventId);
  return { ...input };
}

function assertCommandContext(context: DealCommandContext): void {
  assertUuid(context.organizationId);
  assertUuid(context.dealId);
}

function assertExactKeys(value: object, keys: readonly string[]): void {
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new TypeError("Unknown commission field");
}
function assertUuid(value: unknown): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value))
    throw new TypeError("Invalid UUID");
}
function assertSafePositiveInteger(
  value: unknown,
  field: string,
): asserts value is number {
  assertSafeInteger(value, field, 1, Number.MAX_SAFE_INTEGER);
}
function assertSafeInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    throw new TypeError(`Invalid ${field}`);
}
