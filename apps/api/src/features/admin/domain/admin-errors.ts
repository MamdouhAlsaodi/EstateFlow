/**
 * EF-620 — typed admin/moderation errors. The controller maps each to exactly
 * one HTTP status; the UI keys on the stable `code`.
 */
export class AdminForbiddenError extends Error {
  readonly code = "ADMIN_FORBIDDEN";
  constructor() {
    super("Platform admin authority is required");
    this.name = "AdminForbiddenError";
  }
}

/** A sensitive action was attempted without a fresh step-up proof. */
export class AdminStepUpRequiredError extends Error {
  readonly code = "STEP_UP_REQUIRED";
  constructor() {
    super("A fresh password re-confirmation is required for this action");
    this.name = "AdminStepUpRequiredError";
  }
}

/** Step-up failed the bounded abuse-control gate. */
export class AdminStepUpDeniedError extends Error {
  readonly code = "STEP_UP_RATE_LIMITED";
  constructor() {
    super("Too many failed re-confirmations; try again later");
    this.name = "AdminStepUpDeniedError";
  }
}

export class AdminNotFoundError extends Error {
  readonly code = "ADMIN_NOT_FOUND";
  constructor() {
    super("Admin target not found");
    this.name = "AdminNotFoundError";
  }
}

export class AdminConflictError extends Error {
  readonly code = "ADMIN_CONFLICT";
  constructor() {
    super("Admin target is not in an actionable state");
    this.name = "AdminConflictError";
  }
}

export class AdminValidationError extends Error {
  readonly code = "ADMIN_VALIDATION";
  constructor(message = "Invalid admin request") {
    super(message);
    this.name = "AdminValidationError";
  }
}
