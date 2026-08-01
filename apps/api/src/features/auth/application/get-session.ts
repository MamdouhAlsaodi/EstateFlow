import type { SessionPrincipal } from "./session-bundle.js";

export type SessionView = {
  id: string;
  verified: boolean;
};

export class GetSession {
  execute(principal: SessionPrincipal): SessionView {
    return { id: principal.userId, verified: principal.verified };
  }
}
