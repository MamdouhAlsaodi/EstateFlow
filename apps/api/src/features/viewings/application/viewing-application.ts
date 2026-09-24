import { randomUUID } from "node:crypto";
import { createViewing, ViewingValidationError } from "../domain/viewing.js";
import type {
  Availability,
  AvailabilityException,
  AvailabilityRule,
  ViewingDetail,
  ViewingPage,
  ViewingRepository,
} from "./viewing-repository.js";
import type { ViewingAction, ViewingStatus } from "../domain/viewing.js";

export type ViewingMembership = Readonly<{
  organizationId: string;
  userId?: string;
  role: "OWNER" | "MANAGER" | "BROKER" | "CLIENT";
  status: "ACTIVE" | "PENDING" | "SUSPENDED" | "REVOKED";
}>;
export interface ViewingMembershipReader {
  findMembership(
    organizationId: string,
    userId: string,
  ): Promise<ViewingMembership | null>;
}
export type ViewingActor = Readonly<{ verified: boolean }>;
type CommandBase = Readonly<{
  actor: ViewingActor;
  userId: string;
  organizationId: string;
}>;
type Access = { kind: "access-denied" } | { kind: "not-found" } | true;

export class ViewingApplication {
  constructor(
    private readonly repository: ViewingRepository,
    private readonly memberships: ViewingMembershipReader,
  ) {}

  async list(
    input: CommandBase & {
      brokerId?: string;
      from?: Date;
      to?: Date;
      cursor?: string;
      limit?: number;
    },
  ): Promise<ViewingPage | { kind: "access-denied" | "not-found" }> {
    const access = await this.readAccess(input);
    if (access !== true) return access;
    const limit = input.limit ?? 50;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new ViewingValidationError("Invalid viewing page limit");
    return this.repository.listViewings({ ...input, limit });
  }

  async find(
    input: CommandBase & { viewingId: string },
  ): Promise<ViewingDetail | { kind: "access-denied" | "not-found" }> {
    const access = await this.readAccess(input);
    if (access !== true) return access;
    return (
      (await this.repository.findViewing(
        input.organizationId,
        input.viewingId,
      )) ?? { kind: "not-found" }
    );
  }

  async request(
    input: CommandBase & {
      viewingId: string;
      leadId: string;
      propertyId: string;
      brokerId: string;
      startAt: Date;
      endAt: Date;
      notes?: string;
    },
  ): Promise<ViewingDetail | { kind: "access-denied" | "not-found" }> {
    const access = await this.manageAccess(input, input.brokerId);
    if (access !== true) return access;
    const viewing = createViewing({
      id: input.viewingId,
      organizationId: input.organizationId,
      leadId: input.leadId,
      propertyId: input.propertyId,
      brokerId: input.brokerId,
      requestedByUserId: input.userId,
      startAt: input.startAt,
      endAt: input.endAt,
      notes: input.notes,
      createdAt: new Date(),
    });
    return this.repository.createViewing(viewing);
  }

  async confirm(
    input: CommandBase & { viewingId: string },
  ): Promise<
    ViewingDetail | { kind: "access-denied" | "not-found" | "invalid-state" }
  > {
    return this.lifecycle(input, "CONFIRMED");
  }

  async reschedule(
    input: CommandBase & {
      viewingId: string;
      startAt: Date;
      endAt: Date;
      reason?: string;
    },
  ): Promise<
    ViewingDetail | { kind: "access-denied" | "not-found" | "invalid-state" }
  > {
    const detail = await this.repository.findViewing(
      input.organizationId,
      input.viewingId,
    );
    if (!detail) return { kind: "not-found" };
    const access = await this.manageAccess(input, detail.viewing.brokerId);
    if (access !== true) return access;
    return this.repository.rescheduleViewing({
      ...input,
      actorId: input.userId,
      at: new Date(),
    });
  }

  async cancel(input: CommandBase & { viewingId: string; reason?: string }) {
    return this.lifecycle(input, "CANCELLED", input.reason);
  }
  async complete(input: CommandBase & { viewingId: string; reason?: string }) {
    return this.lifecycle(input, "COMPLETED", input.reason);
  }
  async noShow(input: CommandBase & { viewingId: string; reason?: string }) {
    return this.lifecycle(input, "NO_SHOW", input.reason);
  }

  async availability(
    input: CommandBase & { brokerId: string },
  ): Promise<Availability | { kind: "access-denied" | "not-found" }> {
    const access = await this.readAccess(input);
    if (access !== true) return access;
    const availability = await this.repository.getAvailability(
      input.organizationId,
      input.brokerId,
    );
    return availability ?? { kind: "not-found" };
  }

  async addRule(
    input: CommandBase & {
      brokerId: string;
      weekday: number;
      startMinute: number;
      endMinute: number;
      timezone: string;
    },
  ): Promise<AvailabilityRule | { kind: "access-denied" | "not-found" }> {
    const access = await this.availabilityAccess(input);
    if (access !== true) return access;
    validateMinutes(input.startMinute, input.endMinute);
    if (
      !Number.isInteger(input.weekday) ||
      input.weekday < 0 ||
      input.weekday > 6
    )
      throw new ViewingValidationError("Invalid weekday");
    return this.repository.addAvailabilityRule({
      ...input,
      id: randomUUID(),
      createdBy: input.userId,
    });
  }

  async addException(
    input: CommandBase & {
      brokerId: string;
      localDate: string;
      kind: "BLOCKED" | "EXTRA";
      startMinute: number;
      endMinute: number;
      timezone: string;
    },
  ): Promise<AvailabilityException | { kind: "access-denied" | "not-found" }> {
    const access = await this.availabilityAccess(input);
    if (access !== true) return access;
    validateMinutes(input.startMinute, input.endMinute);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.localDate))
      throw new ViewingValidationError("Invalid local date");
    return this.repository.addAvailabilityException({
      ...input,
      id: randomUUID(),
      createdBy: input.userId,
    });
  }

  private async lifecycle(
    input: CommandBase & { viewingId: string; reason?: string },
    action: Exclude<ViewingAction, "RESCHEDULED" | "REQUESTED">,
    reason?: string,
  ) {
    const detail = await this.repository.findViewing(
      input.organizationId,
      input.viewingId,
    );
    if (!detail) return { kind: "not-found" as const };
    const access = await this.manageAccess(input, detail.viewing.brokerId);
    if (access !== true) return access;
    if (action === "CONFIRMED")
      return this.repository.confirmViewing({
        ...input,
        actorId: input.userId,
        at: new Date(),
      });
    return this.repository.transitionViewing({
      organizationId: input.organizationId,
      viewingId: input.viewingId,
      action,
      reason,
      actorId: input.userId,
      at: new Date(),
    });
  }

  private async readAccess(input: CommandBase): Promise<Access> {
    if (!input.actor.verified || input.userId.trim().length === 0)
      return { kind: "access-denied" };
    const membership = await this.memberships.findMembership(
      input.organizationId,
      input.userId,
    );
    if (!membership || membership.organizationId !== input.organizationId)
      return { kind: "not-found" };
    if (membership.status !== "ACTIVE" || membership.role === "CLIENT")
      return { kind: "access-denied" };
    return true;
  }

  private async manageAccess(
    input: CommandBase,
    brokerId: string,
  ): Promise<Access> {
    const access = await this.readAccess(input);
    if (access !== true) return access;
    const membership = await this.memberships.findMembership(
      input.organizationId,
      input.userId,
    );
    if (!membership) return { kind: "not-found" };
    if (membership.role === "BROKER" && brokerId !== input.userId)
      return { kind: "access-denied" };
    return true;
  }

  private async availabilityAccess(
    input: CommandBase & { brokerId: string },
  ): Promise<Access> {
    const access = await this.readAccess(input);
    if (access !== true) return access;
    const membership = await this.memberships.findMembership(
      input.organizationId,
      input.userId,
    );
    if (
      !membership ||
      (membership.role !== "OWNER" && membership.role !== "MANAGER")
    )
      return { kind: "access-denied" };
    return true;
  }
}

function validateMinutes(startMinute: number, endMinute: number): void {
  if (
    !Number.isInteger(startMinute) ||
    !Number.isInteger(endMinute) ||
    startMinute < 0 ||
    startMinute >= endMinute ||
    endMinute > 1440
  )
    throw new ViewingValidationError("Invalid availability interval");
}

export type { ViewingStatus };
