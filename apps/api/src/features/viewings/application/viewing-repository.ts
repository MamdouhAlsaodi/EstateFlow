import type {
  Viewing,
  ViewingAction,
  ViewingTransition,
} from "../domain/viewing.js";

export type AvailabilityRule = Readonly<{
  id: string;
  brokerId: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  timezone: string;
}>;
export type AvailabilityException = Readonly<{
  id: string;
  brokerId: string;
  localDate: string;
  kind: "BLOCKED" | "EXTRA";
  startMinute: number;
  endMinute: number;
  timezone: string;
}>;
export type Availability = Readonly<{
  rules: readonly AvailabilityRule[];
  exceptions: readonly AvailabilityException[];
}>;
export type ViewingPage = Readonly<{
  items: readonly Viewing[];
  nextCursor: string | null;
}>;
export type ViewingDetail = Readonly<{
  viewing: Viewing;
  transitions: readonly ViewingTransition[];
}>;

export interface ViewingRepository {
  createViewing(
    viewing: Viewing,
  ): Promise<ViewingDetail | { kind: "not-found" }>;
  findViewing(
    organizationId: string,
    viewingId: string,
  ): Promise<ViewingDetail | null>;
  listViewings(input: {
    organizationId: string;
    brokerId?: string;
    from?: Date;
    to?: Date;
    cursor?: string;
    limit: number;
  }): Promise<ViewingPage>;
  confirmViewing(input: {
    organizationId: string;
    viewingId: string;
    actorId: string;
    at: Date;
  }): Promise<
    ViewingDetail | { kind: "not-found" } | { kind: "invalid-state" }
  >;
  rescheduleViewing(input: {
    organizationId: string;
    viewingId: string;
    startAt: Date;
    endAt: Date;
    reason?: string;
    actorId: string;
    at: Date;
  }): Promise<
    ViewingDetail | { kind: "not-found" } | { kind: "invalid-state" }
  >;
  transitionViewing(input: {
    organizationId: string;
    viewingId: string;
    action: Exclude<ViewingAction, "CONFIRMED" | "RESCHEDULED" | "REQUESTED">;
    reason?: string;
    actorId: string;
    at: Date;
  }): Promise<
    ViewingDetail | { kind: "not-found" } | { kind: "invalid-state" }
  >;
  getAvailability(
    organizationId: string,
    brokerId: string,
  ): Promise<Availability | null>;
  addAvailabilityRule(input: {
    id: string;
    organizationId: string;
    brokerId: string;
    weekday: number;
    startMinute: number;
    endMinute: number;
    timezone: string;
    createdBy: string;
  }): Promise<AvailabilityRule | { kind: "not-found" }>;
  addAvailabilityException(input: {
    id: string;
    organizationId: string;
    brokerId: string;
    localDate: string;
    kind: "BLOCKED" | "EXTRA";
    startMinute: number;
    endMinute: number;
    timezone: string;
    createdBy: string;
  }): Promise<AvailabilityException | { kind: "not-found" }>;
}
