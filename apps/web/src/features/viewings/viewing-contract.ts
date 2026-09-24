const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const STATUSES = [
  "REQUESTED",
  "CONFIRMED",
  "CANCELLED",
  "COMPLETED",
  "NO_SHOW",
] as const;
export type ViewingStatus = (typeof STATUSES)[number];
export type Viewing = Readonly<{
  id: string;
  leadId: string;
  propertyId: string;
  brokerId: string;
  startAt: string;
  endAt: string;
  status: ViewingStatus;
  notes?: string;
}>;
export type ViewingPage = Readonly<{
  items: readonly Viewing[];
  nextCursor: string | null;
}>;
export type ViewingReminder = Readonly<{
  kind: "REMINDER_24H" | "REMINDER_1H" | "OUTCOME_REQUEST";
  scheduledFor: string;
  occurrenceKey: string;
}>;
export type ViewingDetail = Readonly<{
  viewing: Viewing;
  transitions: readonly Record<string, unknown>[];
  upcomingReminders: readonly ViewingReminder[];
}>;
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError("Invalid viewing response");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new TypeError("Invalid viewing text");
  return value;
}
function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value))
    throw new TypeError("Invalid viewing id");
  return value;
}
function utc(value: unknown): string {
  if (typeof value !== "string" || !UTC.test(value))
    throw new TypeError("Invalid viewing instant");
  return value;
}
export function normalizeViewingDetail(value: unknown): ViewingDetail {
  const body = record(value);
  if (
    !body.viewing ||
    !Array.isArray(body.transitions) ||
    !Array.isArray(body.upcomingReminders)
  )
    throw new TypeError("Invalid viewing detail");
  const viewingPage = normalizeViewingPage({
    items: [body.viewing],
    nextCursor: null,
  });
  const reminders = body.upcomingReminders.map((entry) => {
    const reminder = record(entry);
    const keys = ["kind", "scheduledFor", "occurrenceKey"];
    if (Object.keys(reminder).some((key) => !keys.includes(key)))
      throw new TypeError("Invalid viewing reminder fields");
    if (
      !["REMINDER_24H", "REMINDER_1H", "OUTCOME_REQUEST"].includes(
        reminder.kind as string,
      ) ||
      typeof reminder.scheduledFor !== "string" ||
      !UTC.test(reminder.scheduledFor) ||
      typeof reminder.occurrenceKey !== "string"
    )
      throw new TypeError("Invalid viewing reminder");
    return {
      kind: reminder.kind as ViewingReminder["kind"],
      scheduledFor: reminder.scheduledFor,
      occurrenceKey: reminder.occurrenceKey,
    };
  });
  return {
    viewing: viewingPage.items[0],
    transitions: body.transitions.map((entry) => record(entry)),
    upcomingReminders: reminders,
  };
}

export function normalizeViewingPage(value: unknown): ViewingPage {
  const body = record(value);
  if (
    !Array.isArray(body.items) ||
    (body.nextCursor !== null &&
      body.nextCursor !== undefined &&
      typeof body.nextCursor !== "string")
  )
    throw new TypeError("Invalid viewing page");
  return {
    items: body.items.map((entry) => {
      const row = record(entry);
      const keys = [
        "id",
        "organizationId",
        "leadId",
        "propertyId",
        "brokerId",
        "requestedByUserId",
        "startAt",
        "endAt",
        "status",
        "notes",
        "createdAt",
        "updatedAt",
      ];
      if (Object.keys(row).some((key) => !keys.includes(key)))
        throw new TypeError("Invalid viewing fields");
      if (!STATUSES.includes(row.status as ViewingStatus))
        throw new TypeError("Invalid viewing status");
      return {
        id: uuid(row.id),
        leadId: uuid(row.leadId),
        propertyId: uuid(row.propertyId),
        brokerId: uuid(row.brokerId),
        startAt: utc(row.startAt),
        endAt: utc(row.endAt),
        status: row.status as ViewingStatus,
        ...(row.notes === undefined ? {} : { notes: text(row.notes) }),
      };
    }),
    nextCursor:
      body.nextCursor === undefined ? null : (body.nextCursor as string | null),
  };
}
