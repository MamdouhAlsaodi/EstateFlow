import type {
  AccessSessionInput,
  PlatformRole,
  RefreshSessionInput,
} from "./auth.repository.js";
import { calculateRefreshIdleExpiry } from "../domain/session-credentials.js";
import type { SessionCredentialIssuer } from "../domain/session-credentials.js";

const ACCESS_LIFETIME_MILLISECONDS = 15 * 60 * 1_000;
const REFRESH_ABSOLUTE_LIFETIME_MILLISECONDS = 7 * 24 * 60 * 60 * 1_000;

export type SessionPrincipal = {
  userId: string;
  familyId: string;
  accessSessionId: string;
  verified: boolean;
  platformRole: PlatformRole;
  csrfHash: string;
};

export type SessionBundle = {
  accessCredential: string;
  refreshCredential: string;
  csrfToken: string;
  accessExpiresAt: Date;
  refreshAbsoluteExpiresAt: Date;
};

export type SessionPersistence = {
  access: AccessSessionInput;
  refresh: RefreshSessionInput;
};

export type IssuedSessionBundle = SessionBundle & SessionPersistence;

export function issueSessionBundle(
  credentialIssuer: SessionCredentialIssuer,
  now: Date,
  refreshAbsoluteExpiresAt = new Date(
    now.getTime() + REFRESH_ABSOLUTE_LIFETIME_MILLISECONDS,
  ),
): IssuedSessionBundle {
  const accessCredential = credentialIssuer.issue();
  const refreshCredential = credentialIssuer.issue();
  const csrfCredential = credentialIssuer.issue();
  const accessExpiresAt = new Date(
    now.getTime() + ACCESS_LIFETIME_MILLISECONDS,
  );
  const absoluteExpiresAt = new Date(refreshAbsoluteExpiresAt);

  return {
    accessCredential: accessCredential.serialized,
    refreshCredential: refreshCredential.serialized,
    csrfToken: csrfCredential.secret,
    accessExpiresAt,
    refreshAbsoluteExpiresAt: absoluteExpiresAt,
    access: {
      id: accessCredential.id,
      tokenHash: accessCredential.hash,
      csrfHash: csrfCredential.hash,
      issuedAt: new Date(now),
      expiresAt: accessExpiresAt,
    },
    refresh: {
      id: refreshCredential.id,
      tokenHash: refreshCredential.hash,
      csrfHash: csrfCredential.hash,
      issuedAt: new Date(now),
      absoluteExpiresAt,
      idleExpiresAt: calculateRefreshIdleExpiry(now, absoluteExpiresAt),
    },
  };
}

export function toSessionBundle(session: IssuedSessionBundle): SessionBundle {
  const {
    accessCredential,
    refreshCredential,
    csrfToken,
    accessExpiresAt,
    refreshAbsoluteExpiresAt,
  } = session;
  return {
    accessCredential,
    refreshCredential,
    csrfToken,
    accessExpiresAt,
    refreshAbsoluteExpiresAt,
  };
}
