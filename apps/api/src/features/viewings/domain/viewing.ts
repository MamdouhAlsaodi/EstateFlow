export const ViewingStatus = {
  REQUESTED: "REQUESTED",
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
  NO_SHOW: "NO_SHOW",
} as const;
export type ViewingStatus = (typeof ViewingStatus)[keyof typeof ViewingStatus];

export const ViewingAction = {
  REQUESTED: "REQUESTED",
  CONFIRMED: "CONFIRMED",
  RESCHEDULED: "RESCHEDULED",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
  NO_SHOW: "NO_SHOW",
} as const;
export type ViewingAction = (typeof ViewingAction)[keyof typeof ViewingAction];

export type Viewing = Readonly<{
  id: string;
  organizationId: string;
  leadId: string;
  propertyId: string;
  brokerId: string;
  requestedByUserId: string;
  startAt: Date;
  endAt: Date;
  status: ViewingStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}>;

export type ViewingTransition = Readonly<{
  id: string;
  organizationId: string;
  viewingId: string;
  action: ViewingAction;
  fromStatus?: ViewingStatus;
  toStatus: ViewingStatus;
  startAt: Date;
  endAt: Date;
  reason?: string;
  actorId: string;
  createdAt: Date;
}>;

export class ViewingValidationError extends Error {
  constructor(message = "Invalid viewing input") {
    super(message);
    this.name = "ViewingValidationError";
  }
}
export class ViewingTransitionError extends Error {
  constructor(message = "Invalid viewing transition") {
    super(message);
    this.name = "ViewingTransitionError";
  }
}
export class ViewingConflictError extends Error {
  constructor() {
    super("Viewing interval conflicts with another confirmed viewing");
    this.name = "ViewingConflictError";
  }
}

function text(value: unknown, field: string, max = 255): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > max
  )
    throw new ViewingValidationError(`Invalid ${field}`);
  return value.trim();
}
function instant(value: unknown, field: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new ViewingValidationError(`Invalid ${field}`);
  return new Date(value.getTime());
}

export function createViewing(input: {
  id: string;
  organizationId: string;
  leadId: string;
  propertyId: string;
  brokerId: string;
  requestedByUserId: string;
  startAt: Date;
  endAt: Date;
  notes?: unknown;
  createdAt: Date;
}): Viewing {
  const startAt = instant(input.startAt, "startAt");
  const endAt = instant(input.endAt, "endAt");
  if (startAt >= endAt)
    throw new ViewingValidationError("Viewing interval must be positive");
  return Object.freeze({
    id: text(input.id, "id"),
    organizationId: text(input.organizationId, "organizationId"),
    leadId: text(input.leadId, "leadId"),
    propertyId: text(input.propertyId, "propertyId"),
    brokerId: text(input.brokerId, "brokerId"),
    requestedByUserId: text(input.requestedByUserId, "requestedByUserId"),
    startAt,
    endAt,
    status: ViewingStatus.REQUESTED,
    ...(input.notes === undefined
      ? {}
      : { notes: text(input.notes, "notes", 1000) }),
    createdAt: instant(input.createdAt, "createdAt"),
    updatedAt: instant(input.createdAt, "createdAt"),
  });
}

export function nextViewingState(
  current: ViewingStatus,
  action: ViewingAction,
): ViewingStatus {
  if (action === "CONFIRMED" && current === "REQUESTED") return "CONFIRMED";
  if (
    action === "RESCHEDULED" &&
    (current === "REQUESTED" || current === "CONFIRMED")
  )
    return current;
  if (
    action === "CANCELLED" &&
    (current === "REQUESTED" || current === "CONFIRMED")
  )
    return "CANCELLED";
  if (action === "COMPLETED" && current === "CONFIRMED") return "COMPLETED";
  if (action === "NO_SHOW" && current === "CONFIRMED") return "NO_SHOW";
  throw new ViewingTransitionError();
}
