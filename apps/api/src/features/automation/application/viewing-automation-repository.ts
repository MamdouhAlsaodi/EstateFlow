import type { ViewingAutomationKind } from "../domain/viewing-automation.js";

export type ViewingAutomationOccurrence = Readonly<{
  organizationId: string;
  viewingId: string;
  leadId: string;
  brokerId: string;
  kind: ViewingAutomationKind;
  occurrenceKey: string;
  eventId: string;
  scheduledFor: Date;
  suggestedLeadStage: "QUALIFIED" | "NURTURING" | null;
  startAt: Date;
  endAt: Date;
  status: "PENDING" | "VOIDED";
}>;

export interface ViewingAutomationRepository {
  listDueOccurrences(
    now: Date,
  ): Promise<readonly ViewingAutomationOccurrence[]>;
  findPendingOccurrence(
    organizationId: string,
    eventId: string,
  ): Promise<ViewingAutomationOccurrence | null>;
}
