export type RuntimeConfig = {
  environment: "development" | "test" | "production";
  port: number;
  apiSecret: string | null;
};

export class RuntimeConfigError extends Error {}

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
  return { environment, port, apiSecret };
}
