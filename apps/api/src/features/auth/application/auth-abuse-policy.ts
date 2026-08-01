export type AuthRateLimitPolicy = Readonly<{
  accountLimit: number;
  clientSourceLimit: number;
}>;

export type AuthAbusePolicy = Readonly<{
  windowMs: number;
  lockoutThreshold: number;
  lockoutMs: number;
  registration: AuthRateLimitPolicy;
  login: AuthRateLimitPolicy;
  passwordRecovery: AuthRateLimitPolicy;
  passwordReset: AuthRateLimitPolicy;
  refresh: AuthRateLimitPolicy;
}>;

export const DEFAULT_AUTH_ABUSE_POLICY = createAuthAbusePolicy({
  windowMs: 900_000,
  lockoutThreshold: 10,
  lockoutMs: 900_000,
  registration: { accountLimit: 3, clientSourceLimit: 20 },
  login: { accountLimit: 10, clientSourceLimit: 50 },
  passwordRecovery: { accountLimit: 3, clientSourceLimit: 20 },
  passwordReset: { accountLimit: 5, clientSourceLimit: 20 },
  refresh: { accountLimit: 60, clientSourceLimit: 200 },
});

export function createAuthAbusePolicy(policy: AuthAbusePolicy): AuthAbusePolicy {
  validatePositiveSafeInteger(policy.windowMs);
  validatePositiveSafeInteger(policy.lockoutThreshold);
  validatePositiveSafeInteger(policy.lockoutMs);
  validateRateLimitPolicy(policy.registration);
  validateRateLimitPolicy(policy.login);
  validateRateLimitPolicy(policy.passwordRecovery);
  validateRateLimitPolicy(policy.passwordReset);
  validateRateLimitPolicy(policy.refresh);

  return Object.freeze({
    windowMs: policy.windowMs,
    lockoutThreshold: policy.lockoutThreshold,
    lockoutMs: policy.lockoutMs,
    registration: Object.freeze({ ...policy.registration }),
    login: Object.freeze({ ...policy.login }),
    passwordRecovery: Object.freeze({ ...policy.passwordRecovery }),
    passwordReset: Object.freeze({ ...policy.passwordReset }),
    refresh: Object.freeze({ ...policy.refresh }),
  });
}

function validateRateLimitPolicy(policy: AuthRateLimitPolicy): void {
  validatePositiveSafeInteger(policy.accountLimit);
  validatePositiveSafeInteger(policy.clientSourceLimit);
}

function validatePositiveSafeInteger(candidate: number): void {
  if (!Number.isSafeInteger(candidate) || candidate <= 0) {
    throw new Error("Auth abuse policy values must be positive safe integers");
  }
}
