import type { AuthRequestAbuseContext } from "./auth-abuse-control.js";
import type { AuthRepository } from "./auth.repository.js";
import type { Clock } from "./clock.js";
import type { SecurityAuditService } from "./security-audit.js";
import type { SessionPrincipal } from "./session-bundle.js";

export class Logout {
  constructor(
    private readonly repository: AuthRepository,
    private readonly clock: Clock,
    private readonly auditService: SecurityAuditService,
  ) {}

  async execute(
    principal: SessionPrincipal,
    context: AuthRequestAbuseContext,
  ): Promise<void> {
    await this.repository.revokeFamily({
      familyId: principal.familyId,
      userId: principal.userId,
      reason: "LOGOUT",
      now: this.clock.now(),
      requestCorrelationId: context.requestCorrelationId,
    });
  }
}
