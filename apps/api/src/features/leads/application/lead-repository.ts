import type { Lead, LeadStage, TimelineEventIntent } from "../domain/lead.js";

export type LeadMutationInput = Readonly<{
  organizationId: string;
  leadId: string;
  expectedVersion: number;
  idempotencyKey: string;
  lead: Lead;
  timelineEvents: readonly TimelineEventIntent[];
}>;

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

export type LeadListCriteria = Readonly<{ stage?: LeadStage; cursor?: string; limit?: number }>;
export type LeadListPage = Readonly<{ items: readonly Lead[]; nextCursor: string | null }>;

export type CreateLeadInput = Readonly<{
  lead: Lead;
  idempotencyKey: string;
  timelineEvents: readonly TimelineEventIntent[];
}>;

export interface LeadRepository {
  findLead(organizationId: string, leadId: string): Promise<Lead | null>;
  listLeads(organizationId: string, criteria: LeadListCriteria): Promise<LeadListPage>;
  /** Atomically bind this command's idempotency key to its first result; replay returns that result without duplicate Lead/event persistence. */
  createLead(input: CreateLeadInput): Promise<LeadMutationResult>;
  /** Atomically bind this command's idempotency key to its first result; same-command replay returns it, while a different command yields typed idempotency-conflict. */
  updateLead(input: LeadMutationInput): Promise<LeadMutationResult>;
  /** Timeline persistence is append-only: implementations expose no update or delete operation. */
  appendTimelineEvents(events: readonly TimelineEventIntent[]): Promise<void>;
}
