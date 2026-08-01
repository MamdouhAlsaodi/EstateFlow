export class OrganizationNotFoundError extends Error {
  constructor() {
    super("Organization resource not found");
    this.name = "OrganizationNotFoundError";
  }
}

export class OrganizationForbiddenError extends Error {
  constructor() {
    super("Organization access forbidden");
    this.name = "OrganizationForbiddenError";
  }
}

export class OrganizationConflictError extends Error {
  constructor() {
    super("Organization conflict");
    this.name = "OrganizationConflictError";
  }
}
