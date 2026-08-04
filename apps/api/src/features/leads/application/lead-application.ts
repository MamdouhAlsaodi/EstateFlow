import { assignLead, createLead, setLeadNextAction, transitionLead } from "../domain/lead.js";
import type { Lead, LeadStage, TimelineEventIntent } from "../domain/lead.js";
import type { CreateLeadInput, LeadListPage, LeadRepository, LeadMutationResult } from "./lead-repository.js";

export type LeadMembership = Readonly<{ organizationId: string; role: "OWNER" | "MANAGER" | "BROKER" | "CLIENT"; status: "ACTIVE" | "PENDING" | "SUSPENDED" | "REVOKED" }>;
export type LeadActor = Readonly<{ verified: boolean }>;
export interface LeadMembershipReader { findMembership(organizationId: string, userId: string): Promise<LeadMembership | null>; }
type MutationInput = { actor: LeadActor; userId: string; organizationId: string; leadId: string; expectedVersion: number; idempotencyKey: string; now?: Date };
const MAX_IDEMPOTENCY_KEY_LENGTH = 255;
function validIdempotencyKey(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= MAX_IDEMPOTENCY_KEY_LENGTH; }
type AccessResult = true | { kind: "ownership-conflict" } | { kind: "access-denied" };

export class LeadApplication {
  constructor(private readonly repository: LeadRepository, private readonly membershipReader: LeadMembershipReader) {}

  async list(input: { actor: LeadActor; userId: string; organizationId: string; stage?: LeadStage; cursor?: string; limit?: number }): Promise<LeadListPage | { kind: "ownership-conflict" } | { kind: "access-denied" }> {
    const access = await this.authorize(input.actor, input.userId, input.organizationId);
    if (access !== true) return access;
    return this.repository.listLeads(input.organizationId, { stage: input.stage, cursor: input.cursor, limit: input.limit });
  }

  async find(input: { actor: LeadActor; userId: string; organizationId: string; leadId: string }): Promise<Lead | { kind: "ownership-conflict" } | { kind: "access-denied" }> {
    const access = await this.authorize(input.actor, input.userId, input.organizationId);
    if (access !== true) return access;
    const lead = await this.repository.findLead(input.organizationId, input.leadId);
    return lead ?? { kind: "ownership-conflict" };
  }

  async create(input: { actor: LeadActor; userId: string; organizationId: string; lead: { id: string; ownerId: string; nextAction: string; source: string; utm?: unknown }; idempotencyKey: string; now?: Date }): Promise<LeadMutationResult | { kind: "access-denied" }> {
    const access = await this.authorize(input.actor, input.userId, input.organizationId);
    if (access !== true) return access;
    if (!validIdempotencyKey(input.idempotencyKey)) return { kind: "invalid-idempotency-key" };
    const lead = createLead({ ...input.lead, organizationId: input.organizationId, now: input.now ?? new Date() });
    const createdEvent: TimelineEventIntent = Object.freeze({ type: "LEAD_CREATED", leadId: lead.id, organizationId: lead.organizationId, occurredAt: lead.createdAt, data: Object.freeze({ stage: lead.stage, ownerId: lead.ownerId, nextAction: lead.nextAction }) });
    const command: CreateLeadInput = { lead, idempotencyKey: input.idempotencyKey, timelineEvents: Object.freeze([createdEvent]) };
    return this.repository.createLead(command);
  }
  async transition(input: MutationInput & { to: LeadStage }): Promise<LeadMutationResult | { kind: "access-denied" }> { return this.mutate(input, (lead, now) => transitionLead(lead, input.to, input.expectedVersion, now)); }
  async assign(input: MutationInput & { ownerId: string }): Promise<LeadMutationResult | { kind: "access-denied" }> { return this.mutate(input, (lead, now) => assignLead(lead, input.ownerId, input.expectedVersion, now)); }
  async setNextAction(input: MutationInput & { nextAction: string }): Promise<LeadMutationResult | { kind: "access-denied" }> { return this.mutate(input, (lead, now) => setLeadNextAction(lead, input.nextAction, input.expectedVersion, now)); }

  private async mutate(input: MutationInput, change: (lead: Lead, now: Date) => { lead: Lead; timelineEvent: TimelineEventIntent }) {
    const access = await this.authorize(input.actor, input.userId, input.organizationId);
    if (access !== true) return access;
    if (!validIdempotencyKey(input.idempotencyKey)) return { kind: "invalid-idempotency-key" as const };
    const current = await this.repository.findLead(input.organizationId, input.leadId);
    if (!current || current.organizationId !== input.organizationId) return { kind: "ownership-conflict" as const };
    if (current.version !== input.expectedVersion) return { kind: "stale-version-conflict" as const, expectedVersion: input.expectedVersion, actualVersion: current.version };
    const changed = change(current, input.now ?? new Date());
    return this.repository.updateLead({ organizationId: input.organizationId, leadId: input.leadId, expectedVersion: input.expectedVersion, idempotencyKey: input.idempotencyKey, lead: changed.lead, timelineEvents: Object.freeze([changed.timelineEvent]) });
  }

  private async authorize(actor: LeadActor | undefined, userId: string | undefined, organizationId: string): Promise<AccessResult> {
    if (!actor?.verified || typeof userId !== "string" || userId.trim().length === 0) return { kind: "access-denied" };
    const membership = await this.membershipReader.findMembership(organizationId, userId);
    if (!membership) return { kind: "ownership-conflict" };
    if (membership.status !== "ACTIVE" || !["OWNER", "MANAGER", "BROKER"].includes(membership.role)) return { kind: "access-denied" };
    return true;
  }
}
