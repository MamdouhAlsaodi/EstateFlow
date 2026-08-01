export type RuntimeConfig = {
  environment: "development" | "test" | "production";
  port: number;
  apiSecret: string | null;
  browserOrigin: string;
  authHashKey: string;
  auditHashKey: string;
  authFakeDelivery: boolean;
};

export class RuntimeConfigError extends Error {}

const MINIMUM_HMAC_KEY_BYTES = 32;

function requiredValue(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new RuntimeConfigError(`${name} is required`);
  return value;
}

function requiredHmacKey(env: NodeJS.ProcessEnv, name: string): string {
  const value = requiredValue(env, name);
  if (Buffer.byteLength(value, "utf8") < MINIMUM_HMAC_KEY_BYTES) {
    throw new RuntimeConfigError(`${name} must be at least 32 UTF-8 bytes`);
  }
  return value;
}

function parseAuthFakeDelivery(
  env: NodeJS.ProcessEnv,
  environment: RuntimeConfig["environment"],
): boolean {
  const enabled = env.ESTATEFLOW_AUTH_FAKE_DELIVERY === "true";
  if (enabled && environment !== "test") {
    throw new RuntimeConfigError(
      "ESTATEFLOW_AUTH_FAKE_DELIVERY is allowed only in test",
    );
  }
  return enabled;
}

function parseCanonicalHttpsOrigin(rawOrigin: string): string {
  let origin: URL;
  try {
    origin = new URL(rawOrigin);
  } catch {
    throw new RuntimeConfigError(
      "ESTATEFLOW_BROWSER_ORIGIN must be an HTTPS origin",
    );
  }
  if (
    origin.protocol !== "https:" ||
    origin.hostname.includes("*") ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.origin !== rawOrigin
  ) {
    throw new RuntimeConfigError(
      "ESTATEFLOW_BROWSER_ORIGIN must be a canonical HTTPS origin",
    );
  }
  return origin.origin;
}

export function loadRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  const environment =
    env.NODE_ENV === "production"
      ? "production"
      : env.NODE_ENV === "test"
        ? "test"
        : "development";
  const rawPort = env.PORT ?? "3001";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new RuntimeConfigError("PORT must be an integer from 1 to 65535");
  const apiSecret = env.ESTATEFLOW_API_SECRET?.trim() || null;
  if (environment === "production" && !apiSecret)
    throw new RuntimeConfigError(
      "ESTATEFLOW_API_SECRET is required in production",
    );
  return {
    environment,
    port,
    apiSecret,
    browserOrigin: parseCanonicalHttpsOrigin(
      requiredValue(env, "ESTATEFLOW_BROWSER_ORIGIN"),
    ),
    authHashKey: requiredHmacKey(env, "ESTATEFLOW_AUTH_HASH_KEY"),
    auditHashKey: requiredHmacKey(env, "ESTATEFLOW_AUDIT_HASH_KEY"),
    authFakeDelivery: parseAuthFakeDelivery(env, environment),
  };
}
