import {
  assignLead,
  createLead,
  setLeadNextAction,
  transitionLead,
} from "../domain/lead.js";
import type { Lead, LeadStage, TimelineEventIntent } from "../domain/lead.js";
import type { CreateLeadInput, LeadMutationResult, LeadRepository } from "./lead-repository.js";

export type LeadActor = Readonly<{ verified: boolean; organizationIds: readonly string[] }>;
type MutationInput = { actor: LeadActor; organizationId: string; leadId: string; expectedVersion: number; idempotencyKey: string; now?: Date };
type UpdateResult = LeadMutationResult;
const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

function validIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= MAX_IDEMPOTENCY_KEY_LENGTH;
}

export class LeadApplication {
  constructor(private readonly repository: LeadRepository) {}

  async create(input: {
    actor: LeadActor;
    organizationId: string;
    lead: { id: string; ownerId: string; nextAction: string; source: string; utm?: unknown };
    idempotencyKey: string;
    now?: Date;
  }): Promise<LeadMutationResult> {
    if (!this.canAccess(input.actor, input.organizationId)) return { kind: "ownership-conflict" };
    if (!validIdempotencyKey(input.idempotencyKey)) return { kind: "invalid-idempotency-key" };
    const lead = createLead({ ...input.lead, organizationId: input.organizationId, now: input.now ?? new Date() });
    const createdEvent: TimelineEventIntent = Object.freeze({
      type: "LEAD_CREATED",
      leadId: lead.id,
      organizationId: lead.organizationId,
      occurredAt: lead.createdAt,
      data: Object.freeze({ stage: lead.stage, ownerId: lead.ownerId, nextAction: lead.nextAction }),
    });
    const timelineEvents: readonly TimelineEventIntent[] = Object.freeze([createdEvent]);
    const command: CreateLeadInput = { lead, idempotencyKey: input.idempotencyKey, timelineEvents };
    return this.repository.createLead(command);
  }

  async transition(input: MutationInput & { to: LeadStage }): Promise<UpdateResult> {
    return this.mutate(input, (lead, now) => transitionLead(lead, input.to, input.expectedVersion, now));
  }

  async assign(input: MutationInput & { ownerId: string }): Promise<UpdateResult> {
    return this.mutate(input, (lead, now) => assignLead(lead, input.ownerId, input.expectedVersion, now));
  }

  async setNextAction(input: MutationInput & { nextAction: string }): Promise<UpdateResult> {
    return this.mutate(input, (lead, now) => setLeadNextAction(lead, input.nextAction, input.expectedVersion, now));
  }

  private async mutate(input: MutationInput, change: (lead: Lead, now: Date) => { lead: Lead; timelineEvent: TimelineEventIntent }): Promise<UpdateResult> {
    if (!this.canAccess(input.actor, input.organizationId)) return { kind: "ownership-conflict" };
    if (!validIdempotencyKey(input.idempotencyKey)) return { kind: "invalid-idempotency-key" };
    const current = await this.repository.findLead(input.organizationId, input.leadId);
    if (!current || current.organizationId !== input.organizationId) return { kind: "ownership-conflict" };
    if (current.version !== input.expectedVersion) return { kind: "stale-version-conflict", expectedVersion: input.expectedVersion, actualVersion: current.version };
    const changed = change(current, input.now ?? new Date());
    return this.repository.updateLead({ organizationId: input.organizationId, leadId: input.leadId, expectedVersion: input.expectedVersion, idempotencyKey: input.idempotencyKey, lead: changed.lead, timelineEvents: Object.freeze([changed.timelineEvent]) });
  }

  private canAccess(actor: LeadActor | undefined, organizationId: string): boolean {
    return Boolean(actor?.verified && actor.organizationIds.includes(organizationId));
  }
}
