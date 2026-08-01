export class InvalidRegistrationInputError extends Error {
  constructor() {
    super("Invalid registration input");
  }
}

export class GenericAuthenticationError extends Error {
  constructor() {
    super("Invalid credentials");
  }
}

export class AuthRateLimitExceededError extends Error {
  constructor() {
    super("Authentication rate limit exceeded");
  }
}

export class InvalidSessionError extends Error {
  constructor() {
    super("Invalid session");
  }
}

export class InvalidRefreshError extends Error {
  constructor() {
    super("Invalid refresh");
  }
}

export class InvalidPasswordResetError extends Error {
  constructor() {
    super("Invalid password reset");
  }
}
