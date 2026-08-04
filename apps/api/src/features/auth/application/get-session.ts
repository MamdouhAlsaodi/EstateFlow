import type { SessionPrincipal } from "./session-bundle.js";

export type SessionView = {
  id: string;
  verified: boolean;
  csrfToken: string | null;
};

export class GetSession {
  execute(principal: SessionPrincipal, csrfToken: string | null): SessionView {
    return {
      id: principal.userId,
      verified: principal.verified,
      csrfToken,
    };
  }
}
