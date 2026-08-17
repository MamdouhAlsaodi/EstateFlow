import {
  assignLead,
  closeLost as closeLostLead,
  closeWon as closeWonLead,
  completeLeadTask,
  createLead,
  createLeadNote,
  createLeadTask,
  rescheduleLeadTask,
  setLeadNextAction,
  transitionLead,
} from "../domain/lead.js";
import type {
  Lead,
  LeadStage,
  LeadTask,
  TimelineEventIntent,
} from "../domain/lead.js";
import type {
  ClosePreflightInput,
  ClosePreflightResultFor,
  CreateLeadInput,
  DealCloseLostCommand,
  DealCloseWonCommand,
  LeadDetail,
  LeadListPage,
  LeadRepository,
  LeadMutationResult,
} from "./lead-repository.js";

export type LeadMembership = Readonly<{
  organizationId: string;
  role: "OWNER" | "MANAGER" | "BROKER" | "CLIENT";
  status: "ACTIVE" | "PENDING" | "SUSPENDED" | "REVOKED";
}>;
export type LeadActor = Readonly<{ verified: boolean }>;
export interface LeadMembershipReader {
  findMembership(
    organizationId: string,
    userId: string,
  ): Promise<LeadMembership | null>;
}
type MutationInput = {
  actor: LeadActor;
  userId: string;
  organizationId: string;
  leadId: string;
  expectedVersion: number;
  idempotencyKey: string;
  now?: Date;
};
type TaskMutationInput = MutationInput & { taskId: string; dueAt?: Date };
const MAX_IDEMPOTENCY_KEY_LENGTH = 255;
function validIdempotencyKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= MAX_IDEMPOTENCY_KEY_LENGTH
  );
}
type AccessResult =
  true | { kind: "ownership-conflict" } | { kind: "access-denied" };

type CloseInput = MutationInput & { propertyId: string; brokerId: string };
type LostInput = MutationInput & { reason: string };

export type LeadDetailResponse = Readonly<{
  lead: Readonly<Omit<Lead, "organizationId">>;
  timeline: Readonly<{
    items: readonly Readonly<{
      id: string;
      type: TimelineEventIntent["type"];
      occurredAt: Date;
      data: Readonly<Record<string, string | null>>;
    }>[];
    nextCursor: string | null;
  }>;
  notes: readonly Readonly<{ id: string; body: string; createdAt: Date }>[];
  tasks: readonly Readonly<{
    id: string;
    title: string;
    dueAt: Date;
    status: "OPEN" | "COMPLETED";
    createdAt: Date;
    completedAt: Date | null;
    version: number;
  }>[];
}>;

const EVENT_DATA_FIELDS: Readonly<
  Record<TimelineEventIntent["type"], readonly string[]>
> = {
  LEAD_CREATED: ["stage"],
  LEAD_ASSIGNED: ["fromOwnerId", "toOwnerId"],
  LEAD_STAGE_CHANGED: ["from", "to"],
  LEAD_NEXT_ACTION_CHANGED: ["from", "to"],
  LEAD_NOTE_ADDED: ["noteId"],
  LEAD_TASK_CREATED: ["taskId", "dueAt"],
  LEAD_TASK_COMPLETED: ["taskId", "completedAt"],
  LEAD_TASK_RESCHEDULED: ["taskId", "fromDueAt", "toDueAt"],
  LEAD_CLOSED_WON: ["dealId", "propertyId", "brokerId"],
  LEAD_CLOSED_LOST: ["reason"],
};

function toLeadDetailResponse(detail: LeadDetail): LeadDetailResponse {
  const { organizationId: _organizationId, ...lead } = detail.lead;
  return {
    lead,
    timeline: {
      nextCursor: detail.timeline.nextCursor,
      items: detail.timeline.items.map((event) => ({
        id: event.id,
        type: event.type,
        occurredAt: event.occurredAt,
        data: Object.fromEntries(
          EVENT_DATA_FIELDS[event.type]
            .filter((field) => event.data[field] !== undefined)
            .map((field) => [field, event.data[field] ?? null]),
        ),
      })),
    },
    notes: detail.notes.map(({ id, body, createdAt }) => ({
      id,
      body,
      createdAt,
    })),
    tasks: detail.tasks.map(
      ({ id, title, dueAt, status, createdAt, completedAt, version }) => ({
        id,
        title,
        dueAt,
        status,
        createdAt,
        completedAt,
        version,
      }),
    ),
  };
}

export class LeadApplication {
  constructor(
    private readonly repository: LeadRepository,
    private readonly membershipReader: LeadMembershipReader,
  ) {}

  async list(input: {
    actor: LeadActor;
    userId: string;
    organizationId: string;
    stage?: LeadStage;
    cursor?: string;
    limit?: number;
  }): Promise<
    LeadListPage | { kind: "ownership-conflict" } | { kind: "access-denied" }
  > {
    const access = await this.authorize(
      input.actor,
      input.userId,
      input.organizationId,
    );
    if (access !== true) return access;
    return this.repository.listLeads(input.organizationId, {
      stage: input.stage,
      cursor: input.cursor,
      limit: input.limit,
    });
  }

  async findDetail(input: {
    actor: LeadActor;
    userId: string;
    organizationId: string;
    leadId: string;
    cursor?: string;
    limit?: number;
  }): Promise<
    | LeadDetailResponse
    | { kind: "ownership-conflict" }
    | { kind: "access-denied" }
  > {
    const access = await this.authorize(
      input.actor,
      input.userId,
      input.organizationId,
    );
    if (access !== true) return access;
    const detail = await this.repository.findLeadDetail(
      input.organizationId,
      input.leadId,
      { cursor: input.cursor, limit: input.limit },
    );
    return detail
      ? toLeadDetailResponse(detail)
      : { kind: "ownership-conflict" };
  }

  async find(input: {
    actor: LeadActor;
    userId: string;
    organizationId: string;
    leadId: string;
  }): Promise<
    Lead | { kind: "ownership-conflict" } | { kind: "access-denied" }
  > {
    const access = await this.authorize(
      input.actor,
      input.userId,
      input.organizationId,
    );
    if (access !== true) return access;
    const lead = await this.repository.findLead(
      input.organizationId,
      input.leadId,
    );
    return lead ?? { kind: "ownership-conflict" };
  }

  async create(input: {
    actor: LeadActor;
    userId: string;
    organizationId: string;
    lead: {
      id: string;
      ownerId: string;
      nextAction: string;
      source: string;
      utm?: unknown;
    };
    idempotencyKey: string;
    now?: Date;
  }): Promise<LeadMutationResult | { kind: "access-denied" }> {
    const access = await this.authorize(
      input.actor,
      input.userId,
      input.organizationId,
    );
    if (access !== true) return access;
    if (!validIdempotencyKey(input.idempotencyKey))
      return { kind: "invalid-idempotency-key" };
    const lead = createLead({
      ...input.lead,
      organizationId: input.organizationId,
      now: input.now ?? new Date(),
    });
    const createdEvent: TimelineEventIntent = Object.freeze({
      type: "LEAD_CREATED",
      leadId: lead.id,
      organizationId: lead.organizationId,
      occurredAt: lead.createdAt,
      data: Object.freeze({
        stage: lead.stage,
        ownerId: lead.ownerId,
        nextAction: lead.nextAction,
      }),
    });
    const command: CreateLeadInput = {
      lead,
      idempotencyKey: input.idempotencyKey,
      timelineEvents: Object.freeze([createdEvent]),
    };
    return this.repository.createLead(command);
  }
  async transition(
    input: MutationInput & { to: LeadStage },
  ): Promise<LeadMutationResult | { kind: "access-denied" }> {
    return this.mutate(input, (lead, now) =>
      transitionLead(lead, input.to, input.expectedVersion, now),
    );
  }
  async assign(
    input: MutationInput & { ownerId: string },
  ): Promise<LeadMutationResult | { kind: "access-denied" }> {
    return this.mutate(input, (lead, now) =>
      assignLead(lead, input.ownerId, input.expectedVersion, now),
    );
  }
  async setNextAction(
    input: MutationInput & { nextAction: string },
  ): Promise<LeadMutationResult | { kind: "access-denied" }> {
    return this.mutate(input, (lead, now) =>
      setLeadNextAction(lead, input.nextAction, input.expectedVersion, now),
    );
  }

  async closeWon(input: CloseInput) {
    const preflight = await this.preflightClose(input.actor, input.userId, {
      organizationId: input.organizationId,
      leadId: input.leadId,
      actor: input.userId,
      scope: "CLOSE_WON",
      idempotencyKey: input.idempotencyKey,
      expectedVersion: input.expectedVersion,
      propertyId: input.propertyId.trim(),
      brokerId: input.brokerId.trim(),
    });
    if (preflight.kind !== "no-prior-command") return preflight;
    const prepared = await this.prepareClose(input);
    if (prepared.kind !== "ready") return prepared.result;
    const changed = closeWonLead({
      lead: prepared.lead,
      dealId: crypto.randomUUID(),
      propertyId: input.propertyId,
      brokerId: input.brokerId,
      expectedVersion: input.expectedVersion,
      now: input.now ?? new Date(),
    });
    const command: DealCloseWonCommand = {
      organizationId: input.organizationId,
      leadId: input.leadId,
      actor: input.userId,
      idempotencyKey: input.idempotencyKey,
      expectedVersion: input.expectedVersion,
      lead: changed.lead,
      deal: changed.deal,
      timelineEvent: changed.timelineEvent,
      event: changed.event,
    };
    return this.repository.closeWon(command);
  }

  async closeLost(input: LostInput) {
    const preflight = await this.preflightClose(input.actor, input.userId, {
      organizationId: input.organizationId,
      leadId: input.leadId,
      actor: input.userId,
      scope: "CLOSE_LOST",
      idempotencyKey: input.idempotencyKey,
      expectedVersion: input.expectedVersion,
      reason: input.reason.trim(),
    });
    if (preflight.kind !== "no-prior-command") return preflight;
    const prepared = await this.prepareClose(input);
    if (prepared.kind !== "ready") return prepared.result;
    const changed = closeLostLead({
      lead: prepared.lead,
      reason: input.reason,
      expectedVersion: input.expectedVersion,
      now: input.now ?? new Date(),
    });
    const command: DealCloseLostCommand = {
      organizationId: input.organizationId,
      leadId: input.leadId,
      actor: input.userId,
      idempotencyKey: input.idempotencyKey,
      expectedVersion: input.expectedVersion,
      lead: changed.lead,
      timelineEvent: changed.timelineEvent,
    };
    return this.repository.closeLost(command);
  }

  async createNote(input: {
    actor: LeadActor;
    userId: string;
    organizationId: string;
    leadId: string;
    body: string;
    idempotencyKey: string;
    now?: Date;
  }) {
    const access = await this.authorize(
      input.actor,
      input.userId,
      input.organizationId,
    );
    if (access !== true) return access;
    if (!validIdempotencyKey(input.idempotencyKey))
      return { kind: "invalid-idempotency-key" as const };
    const note = createLeadNote({
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      leadId: input.leadId,
      body: input.body,
      createdByUserId: input.userId,
      createdAt: input.now ?? new Date(),
    });
    return this.repository.createLeadNote({
      organizationId: input.organizationId,
      leadId: input.leadId,
      createdByUserId: input.userId,
      idempotencyKey: input.idempotencyKey,
      note,
      timelineEvent: note.timelineEvent,
    });
  }

  async createTask(input: {
    actor: LeadActor;
    userId: string;
    organizationId: string;
    leadId: string;
    title: string;
    dueAt: Date;
    idempotencyKey: string;
    now?: Date;
  }) {
    const access = await this.authorize(
      input.actor,
      input.userId,
      input.organizationId,
    );
    if (access !== true) return access;
    if (!validIdempotencyKey(input.idempotencyKey))
      return { kind: "invalid-idempotency-key" as const };
    const task = createLeadTask({
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      leadId: input.leadId,
      title: input.title,
      dueAt: input.dueAt,
      createdByUserId: input.userId,
      createdAt: input.now ?? new Date(),
    });
    return this.repository.createLeadTask({
      organizationId: input.organizationId,
      leadId: input.leadId,
      createdByUserId: input.userId,
      idempotencyKey: input.idempotencyKey,
      task,
      timelineEvent: task.timelineEvent,
    });
  }

  async completeTask(input: TaskMutationInput) {
    return this.mutateTask(
      input,
      (task) =>
        completeLeadTask(task, input.expectedVersion, input.now ?? new Date()),
      "completeLeadTask",
    );
  }

  async rescheduleTask(input: TaskMutationInput & { dueAt: Date }) {
    return this.mutateTask(
      input,
      (task) =>
        rescheduleLeadTask(
          task,
          input.dueAt,
          input.expectedVersion,
          input.now ?? new Date(),
        ),
      "rescheduleLeadTask",
    );
  }

  private async mutateTask(
    input: TaskMutationInput,
    change: (task: LeadTask) => {
      task: LeadTask;
      timelineEvent: TimelineEventIntent;
    },
    repositoryMethod: "completeLeadTask" | "rescheduleLeadTask",
  ) {
    const access = await this.authorize(
      input.actor,
      input.userId,
      input.organizationId,
    );
    if (access !== true) return access;
    if (!validIdempotencyKey(input.idempotencyKey))
      return { kind: "invalid-idempotency-key" as const };
    const task = await this.repository.findLeadTask(
      input.organizationId,
      input.leadId,
      input.taskId,
    );
    if (!task || task.organizationId !== input.organizationId)
      return { kind: "ownership-conflict" as const };
    const changed = change(task);
    const command = {
      organizationId: input.organizationId,
      leadId: input.leadId,
      createdByUserId: input.userId,
      idempotencyKey: input.idempotencyKey,
      expectedVersion: input.expectedVersion,
      task: changed.task,
      timelineEvent: changed.timelineEvent,
    };
    if (repositoryMethod === "completeLeadTask")
      return this.repository.completeLeadTask(command);
    return this.repository.rescheduleLeadTask(command);
  }

  private async preflightClose<T extends ClosePreflightInput>(
    actor: LeadActor,
    userId: string,
    input: T,
  ): Promise<
    | ClosePreflightResultFor<T>
    | {
        kind:
          "access-denied" | "ownership-conflict" | "invalid-idempotency-key";
      }
  > {
    const access = await this.authorize(actor, userId, input.organizationId);
    if (access !== true) return access;
    if (!validIdempotencyKey(input.idempotencyKey))
      return { kind: "invalid-idempotency-key" };
    return this.repository.preflightClose(input);
  }

  private async prepareClose(input: MutationInput): Promise<
    | { kind: "ready"; lead: Lead }
    | {
        kind: "rejected";
        result: {
          kind:
            | "access-denied"
            | "ownership-conflict"
            | "invalid-idempotency-key"
            | "stale-version-conflict";
          expectedVersion?: number;
          actualVersion?: number;
        };
      }
  > {
    const current = await this.repository.findLead(
      input.organizationId,
      input.leadId,
    );
    if (!current || current.organizationId !== input.organizationId)
      return { kind: "rejected", result: { kind: "ownership-conflict" } };
    if (current.version !== input.expectedVersion)
      return {
        kind: "rejected",
        result: {
          kind: "stale-version-conflict",
          expectedVersion: input.expectedVersion,
          actualVersion: current.version,
        },
      };
    return { kind: "ready", lead: current };
  }

  private async mutate(
    input: MutationInput,
    change: (
      lead: Lead,
      now: Date,
    ) => { lead: Lead; timelineEvent: TimelineEventIntent },
  ) {
    const access = await this.authorize(
      input.actor,
      input.userId,
      input.organizationId,
    );
    if (access !== true) return access;
    if (!validIdempotencyKey(input.idempotencyKey))
      return { kind: "invalid-idempotency-key" as const };
    const current = await this.repository.findLead(
      input.organizationId,
      input.leadId,
    );
    if (!current || current.organizationId !== input.organizationId)
      return { kind: "ownership-conflict" as const };
    if (current.version !== input.expectedVersion)
      return {
        kind: "stale-version-conflict" as const,
        expectedVersion: input.expectedVersion,
        actualVersion: current.version,
      };
    const changed = change(current, input.now ?? new Date());
    return this.repository.updateLead({
      organizationId: input.organizationId,
      leadId: input.leadId,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      lead: changed.lead,
      timelineEvents: Object.freeze([changed.timelineEvent]),
    });
  }

  private async authorize(
    actor: LeadActor | undefined,
    userId: string | undefined,
    organizationId: string,
  ): Promise<AccessResult> {
    if (
      !actor?.verified ||
      typeof userId !== "string" ||
      userId.trim().length === 0
    )
      return { kind: "access-denied" };
    const membership = await this.membershipReader.findMembership(
      organizationId,
      userId,
    );
    if (!membership) return { kind: "ownership-conflict" };
    if (
      membership.status !== "ACTIVE" ||
      !["OWNER", "MANAGER", "BROKER"].includes(membership.role)
    )
      return { kind: "access-denied" };
    return true;
  }
}
