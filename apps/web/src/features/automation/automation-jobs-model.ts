import { ApiError } from "../../lib/api-client/index";
import type { MessageKey } from "../../i18n";

/**
 * EF-306 — error mapping for automation rule/job actions. Pure so the
 * authority-matrix mapping is testable without a browser. EF-630: the model
 * returns a message KEY; the views resolve it through the translator.
 */

export type AutomationActionError = Readonly<{
  kind: "forbidden" | "stale" | "missing" | "session" | "error";
  messageKey: MessageKey;
}>;

export function getAutomationActionError(
  error: unknown,
): AutomationActionError {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403)
      return {
        kind: "forbidden",
        messageKey: "automation.action.forbidden",
      };
    if (error.status === 404)
      return {
        kind: "missing",
        messageKey: "automation.action.notFound",
      };
    if (error.status === 409)
      return {
        kind: "stale",
        messageKey: "automation.action.stale",
      };
  }
  return {
    kind: "error",
    messageKey: "automation.action.generic",
  };
}
