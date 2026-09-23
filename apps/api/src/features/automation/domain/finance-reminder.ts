import { createHash } from "node:crypto";

export type FinanceReminderType =
  "receivable.due_soon" | "receivable.overdue" | "commission.due";
export type FinanceReminderTargetKind = "RECEIVABLE" | "COMMISSION";
export type FinanceReminderCandidate = Readonly<{
  organizationId: string;
  targetId: string;
  targetType: FinanceReminderTargetKind;
  reminderType: FinanceReminderType;
  dueOccurrence: string;
  dueAt: Date;
  recipientUserId: string;
  status: string;
  outstandingMinor?: bigint;
}>;

const DAY_MS = 86_400_000;

function uuidFromDigest(digest: string): string {
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

/** Stable per-tenant financial occurrence identity, independent of rule version. */
export function financeReminderOccurrenceId(input: {
  organizationId: string;
  targetType: FinanceReminderTargetKind;
  targetId: string;
  reminderType: FinanceReminderType;
  dueOccurrence: string;
}): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        dueOccurrence: input.dueOccurrence,
        organizationId: input.organizationId,
        reminderType: input.reminderType,
        targetId: input.targetId,
        targetType: input.targetType,
      }),
      "utf8",
    )
    .digest("hex");
  return uuidFromDigest(digest);
}

export function reminderWindowReached(input: {
  reminderType: FinanceReminderType;
  dueAt: Date;
  now: Date;
  days: number;
}): boolean {
  if (!Number.isSafeInteger(input.days) || input.days < 0 || input.days > 3650)
    return false;
  const dueAt = input.dueAt.getTime();
  const now = input.now.getTime();
  if (input.reminderType === "receivable.due_soon")
    return now >= dueAt - input.days * DAY_MS && now < dueAt;
  if (input.reminderType === "receivable.overdue")
    return now >= dueAt + input.days * DAY_MS;
  return true;
}

export function reminderDays(
  reminderType: FinanceReminderType,
  payload: Readonly<Record<string, string>>,
): number | null {
  const key =
    reminderType === "receivable.due_soon"
      ? "daysBeforeDue"
      : reminderType === "receivable.overdue"
        ? "daysPastDue"
        : "days";
  const raw = payload[key] ?? payload.days;
  if (raw === undefined) return reminderType === "commission.due" ? 0 : null;
  const days = Number(raw);
  return Number.isSafeInteger(days) && days >= 0 && days <= 3650 ? days : null;
}

export function financeReminderDueOccurrence(input: {
  dueAt: Date;
  status: string;
  outstandingMinor?: bigint;
}): string {
  return [
    input.dueAt.toISOString(),
    input.status,
    input.outstandingMinor?.toString(10) ?? "",
  ].join("|");
}

export type FinanceReminderDefaultRule = Readonly<{
  name: string;
  definition: Readonly<{
    trigger: Readonly<{ kind: "DOMAIN_EVENT"; eventType: FinanceReminderType }>;
    conditions: readonly [];
    action: Readonly<{
      actionType: "CREATE_INTERNAL_NOTIFICATION";
      payload: Readonly<Record<string, string>>;
    }>;
  }>;
}>;

export function defaultFinanceReminderRules(): FinanceReminderDefaultRule[] {
  return [
    {
      name: "تذكير استحقاق الذمم",
      definition: {
        trigger: { kind: "DOMAIN_EVENT", eventType: "receivable.due_soon" },
        conditions: [],
        action: {
          actionType: "CREATE_INTERNAL_NOTIFICATION",
          payload: { daysBeforeDue: "3", template: "receivable-due-soon" },
        },
      },
    },
    {
      name: "تنبيه الذمم المتأخرة",
      definition: {
        trigger: { kind: "DOMAIN_EVENT", eventType: "receivable.overdue" },
        conditions: [],
        action: {
          actionType: "CREATE_INTERNAL_NOTIFICATION",
          payload: { daysPastDue: "1", template: "receivable-overdue" },
        },
      },
    },
    {
      name: "تذكير العمولة المستحقة",
      definition: {
        trigger: { kind: "DOMAIN_EVENT", eventType: "commission.due" },
        conditions: [],
        action: {
          actionType: "CREATE_INTERNAL_NOTIFICATION",
          payload: { template: "commission-due" },
        },
      },
    },
  ];
}
