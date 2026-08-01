import type { Request } from "express";
import type { SessionPrincipal } from "../application/session-bundle.js";

export type AuthenticatedPrincipal = SessionPrincipal;

export type RefreshAuthentication = {
  refreshCredential: string;
  csrfToken: string;
};

declare module "express" {
  interface Request {
    requestId?: string;
    auth?: AuthenticatedPrincipal;
    refreshAuth?: RefreshAuthentication;
  }
}

export type AuthenticatedRequest = Request & {
  auth: AuthenticatedPrincipal;
};

export type RefreshAuthenticatedRequest = Request & {
  refreshAuth: RefreshAuthentication;
};
