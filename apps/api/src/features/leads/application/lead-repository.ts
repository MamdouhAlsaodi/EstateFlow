import type {
  Deal,
  DealClosedWonEventIntent,
  Lead,
  LeadNote,
  LeadStage,
  LeadTask,
  TimelineEventIntent,
} from "../domain/lead.js";

export type LeadMutationInput = Readonly<{
  organizationId: string;
  leadId: string;
  expectedVersion: number;
  idempotencyKey: string;
  lead: Lead;
  timelineEvents: readonly TimelineEventIntent[];
}>;

export type DealCloseWonCommand = Readonly<{
  organizationId: string;
  leadId: string;
  actor: string;
  idempotencyKey: string;
  expectedVersion: number;
  lead: Lead;
  deal: Deal;
  timelineEvent: TimelineEventIntent;
  event: DealClosedWonEventIntent;
}>;
export type DealCloseLostCommand = Readonly<{
  organizationId: string;
  leadId: string;
  actor: string;
  idempotencyKey: string;
  expectedVersion: number;
  lead: Lead;
  timelineEvent: TimelineEventIntent;
}>;
type DealCloseConflict =
  | {
      readonly kind: "stale-version-conflict";
      readonly expectedVersion: number;
      readonly actualVersion: number;
    }
  | { readonly kind: "ownership-conflict" }
  | { readonly kind: "idempotency-conflict"; readonly idempotencyKey: string }
  | { readonly kind: "invalid-idempotency-key" };
export type CloseWonPreflight = Readonly<{
  organizationId: string;
  leadId: string;
  actor: string;
  scope: "CLOSE_WON";
  idempotencyKey: string;
  expectedVersion: number;
  propertyId: string;
  brokerId: string;
}>;
export type CloseLostPreflight = Readonly<{
  organizationId: string;
  leadId: string;
  actor: string;
  scope: "CLOSE_LOST";
  idempotencyKey: string;
  expectedVersion: number;
  reason: string;
}>;
export type ClosePreflightInput = CloseWonPreflight | CloseLostPreflight;
export type CloseWonReplay = {
  readonly kind: "idempotent-replay";
  readonly lead: Lead;
  readonly deal: Deal;
  readonly timelineEvent: TimelineEventIntent;
  readonly event: DealClosedWonEventIntent;
};
export type CloseLostReplay = {
  readonly kind: "idempotent-replay";
  readonly lead: Lead;
  readonly timelineEvent: TimelineEventIntent;
};
type CloseIdempotencyConflict = {
  readonly kind: "idempotency-conflict";
  readonly idempotencyKey: string;
};
export type CloseWonPreflightResult =
  | { readonly kind: "no-prior-command" }
  | CloseWonReplay
  | CloseIdempotencyConflict;
export type CloseLostPreflightResult =
  | { readonly kind: "no-prior-command" }
  | CloseLostReplay
  | CloseIdempotencyConflict;
export type ClosePreflightResultFor<T extends ClosePreflightInput> =
  T extends CloseWonPreflight
    ? CloseWonPreflightResult
    : T extends CloseLostPreflight
      ? CloseLostPreflightResult
      : never;
export type ClosePreflightResult =
  CloseWonPreflightResult | CloseLostPreflightResult;
export type DealCloseWonResult =
  | {
      readonly kind: "ok" | "idempotent-replay";
      readonly lead: Lead;
      readonly deal: Deal;
      readonly timelineEvent: TimelineEventIntent;
      readonly event: DealClosedWonEventIntent;
    }
  | DealCloseConflict;
export type DealCloseLostResult =
  | {
      readonly kind: "ok" | "idempotent-replay";
      readonly lead: Lead;
      readonly timelineEvent: TimelineEventIntent;
    }
  | DealCloseConflict;
export type LeadMutationResult =
  | {
      readonly kind: "ok";
      readonly lead: Lead;
      readonly timelineEvents: readonly TimelineEventIntent[];
    }
  | {
      readonly kind: "idempotent-replay";
      readonly lead: Lead;
      readonly timelineEvents: readonly TimelineEventIntent[];
    }
  | {
      readonly kind: "stale-version-conflict";
      readonly expectedVersion: number;
      readonly actualVersion: number;
    }
  | { readonly kind: "ownership-conflict" }
  | { readonly kind: "idempotency-conflict"; readonly idempotencyKey: string }
  | { readonly kind: "invalid-idempotency-key" };

export type LeadListCriteria = Readonly<{
  stage?: LeadStage;
  cursor?: string;
  limit?: number;
}>;
export type LeadListPage = Readonly<{
  items: readonly Lead[];
  nextCursor: string | null;
}>;
export type LeadTimelineCriteria = Readonly<{
  cursor?: string;
  limit?: number;
}>;
export type LeadTimelineEventRecord = Readonly<{
  id: string;
  type: TimelineEventIntent["type"];
  occurredAt: Date;
  data: Readonly<Record<string, string | null>>;
}>;
export type LeadDetailNote = Readonly<
  Pick<LeadNote, "id" | "body" | "createdAt">
>;
export type LeadDetailTask = Readonly<
  Pick<
    LeadTask,
    | "id"
    | "title"
    | "dueAt"
    | "status"
    | "createdAt"
    | "completedAt"
    | "version"
  >
>;
export type LeadDetail = Readonly<{
  lead: Lead;
  timeline: Readonly<{
    items: readonly LeadTimelineEventRecord[];
    nextCursor: string | null;
  }>;
  notes: readonly LeadDetailNote[];
  tasks: readonly LeadDetailTask[];
}>;

export type CreateLeadInput = Readonly<{
  lead: Lead;
  idempotencyKey: string;
  timelineEvents: readonly TimelineEventIntent[];
}>;

type ChildCommandConflict =
  | {
      readonly kind: "stale-version-conflict";
      readonly expectedVersion: number;
      readonly actualVersion: number;
    }
  | { readonly kind: "ownership-conflict" }
  | { readonly kind: "idempotency-conflict"; readonly idempotencyKey: string }
  | { readonly kind: "invalid-idempotency-key" };
export type LeadNoteCommandResult =
  | {
      readonly kind: "ok" | "idempotent-replay";
      readonly note: LeadNote;
      readonly timelineEvent: TimelineEventIntent;
    }
  | ChildCommandConflict;
export type LeadTaskCommandResult =
  | {
      readonly kind: "ok" | "idempotent-replay";
      readonly task: LeadTask;
      readonly timelineEvent: TimelineEventIntent;
    }
  | ChildCommandConflict;
export type LeadNoteCommand = Readonly<{
  organizationId: string;
  leadId: string;
  createdByUserId: string;
  idempotencyKey: string;
  note: LeadNote;
  timelineEvent: TimelineEventIntent;
}>;
export type LeadTaskCommand = Readonly<{
  organizationId: string;
  leadId: string;
  createdByUserId: string;
  idempotencyKey: string;
  task: LeadTask;
  timelineEvent: TimelineEventIntent;
}>;
export type LeadTaskTransitionCommand = LeadTaskCommand &
  Readonly<{ expectedVersion: number }>;

export interface LeadRepository {
  findLead(organizationId: string, leadId: string): Promise<Lead | null>;
  listLeads(
    organizationId: string,
    criteria: LeadListCriteria,
  ): Promise<LeadListPage>;
  findLeadDetail(
    organizationId: string,
    leadId: string,
    criteria: LeadTimelineCriteria,
  ): Promise<LeadDetail | null>;
  /** Atomically bind this command's idempotency key to its first result; replay returns that result without duplicate Lead/event persistence. */
  createLead(input: CreateLeadInput): Promise<LeadMutationResult>;
  /** Atomically bind this command's idempotency key to its first result; same-command replay returns it, while a different command yields typed idempotency-conflict. */
  updateLead(input: LeadMutationInput): Promise<LeadMutationResult>;
  /** Timeline persistence is append-only: implementations expose no update or delete operation. */
  appendTimelineEvents(events: readonly TimelineEventIntent[]): Promise<void>;
  /** Atomically compares the canonical close payload and returns the original outcome before any Lead read. */
  preflightClose<T extends ClosePreflightInput>(
    input: T,
  ): Promise<ClosePreflightResultFor<T>>;
  createLeadNote(input: LeadNoteCommand): Promise<LeadNoteCommandResult>;
  createLeadTask(input: LeadTaskCommand): Promise<LeadTaskCommandResult>;
  findLeadTask(
    organizationId: string,
    leadId: string,
    taskId: string,
  ): Promise<LeadTask | null>;
  completeLeadTask(
    input: LeadTaskTransitionCommand,
  ): Promise<LeadTaskCommandResult>;
  rescheduleLeadTask(
    input: LeadTaskTransitionCommand,
  ): Promise<LeadTaskCommandResult>;
  closeWon(input: DealCloseWonCommand): Promise<DealCloseWonResult>;
  closeLost(input: DealCloseLostCommand): Promise<DealCloseLostResult>;
}
