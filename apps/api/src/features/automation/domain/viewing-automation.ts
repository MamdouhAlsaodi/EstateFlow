import { createHash } from "node:crypto";

export const ViewingAutomationKind = {
  REMINDER_24H: "REMINDER_24H",
  REMINDER_1H: "REMINDER_1H",
  OUTCOME_REQUEST: "OUTCOME_REQUEST",
} as const;
export type ViewingAutomationKind =
  (typeof ViewingAutomationKind)[keyof typeof ViewingAutomationKind];

export type ViewingAutomationEventType =
  "viewing.reminder_24h" | "viewing.reminder_1h" | "viewing.outcome_requested";

const HOUR_MS = 60 * 60 * 1000;

function uuidFromDigest(digest: string): string {
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

/** Stable occurrence identity: tenant + viewing + kind + schedule occurrence. */
export function viewingAutomationOccurrenceId(input: {
  organizationId: string;
  viewingId: string;
  kind: ViewingAutomationKind;
  occurrence: string;
}): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        kind: input.kind,
        occurrence: input.occurrence,
        organizationId: input.organizationId,
        viewingId: input.viewingId,
      }),
      "utf8",
    )
    .digest("hex");
  return uuidFromDigest(digest);
}

export function viewingReminderEventType(
  kind: Exclude<ViewingAutomationKind, "OUTCOME_REQUEST">,
): ViewingAutomationEventType {
  return kind === "REMINDER_24H"
    ? "viewing.reminder_24h"
    : "viewing.reminder_1h";
}

export function viewingOutcomeEventType(): ViewingAutomationEventType {
  return "viewing.outcome_requested";
}

export function viewingReminderDueAt(
  startAt: Date,
  kind: Exclude<ViewingAutomationKind, "OUTCOME_REQUEST">,
): Date {
  return new Date(
    startAt.getTime() - (kind === "REMINDER_24H" ? 24 : 1) * HOUR_MS,
  );
}

export type ViewingAutomationDefaultRule = Readonly<{
  name: string;
  definition: Readonly<{
    trigger: Readonly<{
      kind: "DOMAIN_EVENT";
      eventType: ViewingAutomationEventType;
    }>;
    conditions: readonly [];
    action: Readonly<{
      actionType: "CREATE_INTERNAL_NOTIFICATION" | "CREATE_VIEWING_FOLLOW_UP";
      payload: Readonly<Record<string, string>>;
    }>;
  }>;
}>;

/** Arabic-first starter rules, appended through the existing EF-301 API. */
export function defaultViewingAutomationRules(): ViewingAutomationDefaultRule[] {
  return [
    {
      name: "تذكير المعاينة قبل 24 ساعة",
      definition: {
        trigger: { kind: "DOMAIN_EVENT", eventType: "viewing.reminder_24h" },
        conditions: [],
        action: {
          actionType: "CREATE_INTERNAL_NOTIFICATION",
          payload: { template: "viewing-reminder-24h" },
        },
      },
    },
    {
      name: "تذكير المعاينة قبل ساعة",
      definition: {
        trigger: { kind: "DOMAIN_EVENT", eventType: "viewing.reminder_1h" },
        conditions: [],
        action: {
          actionType: "CREATE_INTERNAL_NOTIFICATION",
          payload: { template: "viewing-reminder-1h" },
        },
      },
    },
    {
      name: "طلب نتيجة المعاينة والمتابعة",
      definition: {
        trigger: {
          kind: "DOMAIN_EVENT",
          eventType: "viewing.outcome_requested",
        },
        conditions: [],
        action: {
          actionType: "CREATE_VIEWING_FOLLOW_UP",
          payload: {
            template: "viewing-outcome-request",
            taskTitle: "تسجيل نتيجة المعاينة والمتابعة",
            suggestedLeadStage: "QUALIFIED",
            dueInMinutes: "1440",
          },
        },
      },
    },
  ];
}
