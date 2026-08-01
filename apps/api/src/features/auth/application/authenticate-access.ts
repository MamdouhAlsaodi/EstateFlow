import type { AuthRepository } from "./auth.repository.js";
import type { Clock } from "./clock.js";
import type { SessionPrincipal } from "./session-bundle.js";
import { InvalidSessionError } from "../domain/auth-errors.js";
import type { SessionCredentialIssuer } from "../domain/session-credentials.js";
import { parseOpaqueCredential } from "../infrastructure/node-crypto-credential-issuer.js";

export class AuthenticateAccess {
  constructor(
    private readonly repository: AuthRepository,
    private readonly credentialIssuer: SessionCredentialIssuer,
    private readonly clock: Clock,
  ) {}

  async execute(accessCredential: string): Promise<SessionPrincipal> {
    const presented = this.parseAccessCredential(accessCredential);
    const access = await this.repository.findActiveAccessById(
      presented.id,
      this.clock.now(),
    );
    if (
      !access ||
      !this.credentialIssuer.matches(presented.secret, access.tokenHash)
    ) {
      throw new InvalidSessionError();
    }
    return {
      userId: access.userId,
      familyId: access.familyId,
      accessSessionId: access.accessSessionId,
      verified: access.verified,
      platformRole: access.platformRole,
      csrfHash: access.csrfHash,
    };
  }

  private parseAccessCredential(accessCredential: string) {
    try {
      return parseOpaqueCredential(accessCredential);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Malformed opaque credential"
      ) {
        throw new InvalidSessionError();
      }
      throw error;
    }
  }
}
