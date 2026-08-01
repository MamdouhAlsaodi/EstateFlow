import type { AuthRepository } from "./auth.repository.js";
import {
  type AuthAbuseControl,
  type AuthRequestAbuseContext,
} from "./auth-abuse-control.js";
import type { SecurityAuditService } from "./security-audit.js";
import type { Clock } from "./clock.js";
import {
  issueSessionBundle,
  toSessionBundle,
  type SessionBundle,
} from "./session-bundle.js";
import {
  AuthRateLimitExceededError,
  InvalidRefreshError,
} from "../domain/auth-errors.js";
import { isCanonicalCsrfToken } from "../domain/session-credentials.js";
import type { SessionCredentialIssuer } from "../domain/session-credentials.js";
import { parseOpaqueCredential } from "../infrastructure/node-crypto-credential-issuer.js";

export type RefreshSessionInput = {
  refreshCredential: string;
  csrfToken: string;
};

export class RefreshSession {
  constructor(
    private readonly repository: AuthRepository,
    private readonly credentialIssuer: SessionCredentialIssuer,
    private readonly clock: Clock,
    private readonly abuseControl: AuthAbuseControl,
    private readonly auditService: SecurityAuditService,
  ) {}

  async execute(
    refreshRequest: RefreshSessionInput,
    context: AuthRequestAbuseContext,
  ): Promise<SessionBundle> {
    if (!isCanonicalCsrfToken(refreshRequest?.csrfToken)) {
      throw new InvalidRefreshError();
    }
    const presentedRefresh = this.parseRefreshCredential(
      refreshRequest?.refreshCredential,
    );

    const now = this.clock.now();
    const presentedTokenHash = this.credentialIssuer.hash(
      presentedRefresh.secret,
    );
    const userId = await this.repository.findRefreshSubject(
      presentedRefresh.id,
      presentedTokenHash,
    );
    try {
      await this.abuseControl.consumeRefresh(
        userId,
        presentedRefresh.id,
        context,
        now,
      );
    } catch (error) {
      if (error instanceof AuthRateLimitExceededError) {
        await this.auditService.denied("REFRESH_DENIED", context);
      }
      throw error;
    }
    const nextSession = issueSessionBundle(this.credentialIssuer, now);
    const rotation = await this.repository.rotateRefresh({
      presentedRefreshId: presentedRefresh.id,
      presentedTokenHash,
      presentedCsrfHash: this.credentialIssuer.hash(refreshRequest.csrfToken),
      now,
      nextRefresh: nextSession.refresh,
      nextAccess: nextSession.access,
      requestCorrelationId: context.requestCorrelationId,
    });
    if (rotation.status !== "rotated") throw new InvalidRefreshError();

    return {
      ...toSessionBundle(nextSession),
      refreshAbsoluteExpiresAt: new Date(rotation.absoluteExpiresAt),
    };
  }

  private parseRefreshCredential(refreshCredential: string) {
    try {
      return parseOpaqueCredential(refreshCredential);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Malformed opaque credential"
      ) {
        throw new InvalidRefreshError();
      }
      throw error;
    }
  }
}
