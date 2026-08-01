import type { AuthRepository } from "./auth.repository.js";
import type { Clock } from "./clock.js";
import type { AuthRequestAbuseContext } from "./auth-abuse-control.js";

export type SecurityAuditOutcome = "ALLOWED" | "DENIED";

export type SecurityAuditReason =
  | "REGISTRATION_ACCEPTED"
  | "REGISTRATION_DENIED"
  | "LOGIN_ALLOWED"
  | "LOGIN_DENIED"
  | "PASSWORD_RECOVERY_ACCEPTED"
  | "PASSWORD_RECOVERY_DENIED"
  | "PASSWORD_RESET_ALLOWED"
  | "PASSWORD_RESET_DENIED"
  | "REFRESH_ALLOWED"
  | "REFRESH_DENIED"
  | "LOGOUT_ALLOWED";

export type CreateSecurityAuditEventInput = Readonly<{
  subjectId: string | null;
  outcome: SecurityAuditOutcome;
  reason: SecurityAuditReason;
  requestCorrelationId: string;
  now: Date;
}>;

const ALLOWED_REASONS = new Set<SecurityAuditReason>([
  "REGISTRATION_ACCEPTED",
  "LOGIN_ALLOWED",
  "PASSWORD_RECOVERY_ACCEPTED",
  "PASSWORD_RESET_ALLOWED",
  "REFRESH_ALLOWED",
  "LOGOUT_ALLOWED",
]);

const DENIED_REASONS = new Set<SecurityAuditReason>([
  "REGISTRATION_DENIED",
  "LOGIN_DENIED",
  "PASSWORD_RECOVERY_DENIED",
  "PASSWORD_RESET_DENIED",
  "REFRESH_DENIED",
]);

const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export class SecurityAuditService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly clock: Clock,
  ) {}

  allowed(
    reason: SecurityAuditReason,
    context: AuthRequestAbuseContext,
    subjectId: string | null = null,
  ): Promise<void> {
    return this.create("ALLOWED", reason, context, subjectId);
  }

  denied(
    reason: SecurityAuditReason,
    context: AuthRequestAbuseContext,
    subjectId: string | null = null,
  ): Promise<void> {
    return this.create("DENIED", reason, context, subjectId);
  }

  private async create(
    outcome: SecurityAuditOutcome,
    reason: SecurityAuditReason,
    context: AuthRequestAbuseContext,
    subjectId: string | null,
  ): Promise<void> {
    const event = {
      subjectId,
      outcome,
      reason,
      requestCorrelationId: context.requestCorrelationId,
      now: this.clock.now(),
    };
    validateSecurityAuditEvent(event);
    await this.repository.createSecurityAuditEvent(event);
  }
}

export function validateSecurityAuditEvent(
  input: CreateSecurityAuditEventInput,
): void {
  validateSecurityAuditReason(input.outcome, input.reason);
  validateCanonicalUuid(input.requestCorrelationId, "Request correlation ID");
  if (input.subjectId !== null)
    validateCanonicalUuid(input.subjectId, "Subject ID");
  if (!(input.now instanceof Date) || Number.isNaN(input.now.getTime())) {
    throw new Error("Security audit event requires a valid creation time");
  }
}

function validateSecurityAuditReason(
  outcome: SecurityAuditOutcome,
  reason: SecurityAuditReason,
): void {
  if (outcome !== "ALLOWED" && outcome !== "DENIED") {
    throw new Error("Security audit requires a supported outcome");
  }
  const reasons = outcome === "ALLOWED" ? ALLOWED_REASONS : DENIED_REASONS;
  if (typeof reason !== "string" || !reasons.has(reason)) {
    throw new Error(
      `Security audit requires a ${outcome.toLowerCase()} audit reason`,
    );
  }
}

function validateCanonicalUuid(value: unknown, label: string): void {
  if (typeof value !== "string" || !CANONICAL_UUID.test(value)) {
    throw new Error(`${label} must be a canonical UUID`);
  }
}
