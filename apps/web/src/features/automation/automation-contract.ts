export type AutomationRuleSummary = Readonly<{
  id: string;
  name: string;
  enabled: boolean;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
  definition: Record<string, unknown>;
}>;

export type AutomationRulesResponse = Readonly<{
  rules: readonly AutomationRuleSummary[];
  failedJobs: readonly AutomationFailedJob[];
}>;

export type AutomationFailedJob = Readonly<{
  id: string;
  ruleId: string;
  ruleVersion: number;
  actionType: string;
  targetType: string;
  targetId: string;
  status: "FAILED";
  attemptCount: number;
  maxAttempts: number;
  lastError: { kind: string; message: string };
  failedAt: string;
  updatedAt: string;
}>;

export type AutomationFailedJobsResponse = Readonly<{
  jobs: readonly AutomationFailedJob[];
}>;

const ruleFields = [
  "id",
  "name",
  "enabled",
  "currentVersion",
  "createdAt",
  "updatedAt",
  "definition",
] as const;

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError("Invalid automation response");
  return value as Record<string, unknown>;
}

function only(value: Record<string, unknown>, fields: readonly string[]): void {
  if (Object.keys(value).some((key) => !fields.includes(key)))
    throw new TypeError("Automation response contains an unsupported field");
}

function iso(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

export function normalizeAutomationRules(
  value: unknown,
): AutomationRulesResponse {
  const root = record(value);
  only(root, ["rules", "failedJobs"]);
  if (!Array.isArray(root.rules) || !Array.isArray(root.failedJobs))
    throw new TypeError("Invalid automation rules");
  return {
    rules: root.rules.map((entry) => {
      const rule = record(entry);
      only(rule, ruleFields);
      if (
        typeof rule.id !== "string" ||
        typeof rule.name !== "string" ||
        typeof rule.enabled !== "boolean" ||
        typeof rule.currentVersion !== "number" ||
        !Number.isSafeInteger(rule.currentVersion) ||
        rule.currentVersion < 1 ||
        !iso(rule.createdAt) ||
        !iso(rule.updatedAt)
      )
        throw new TypeError("Invalid automation rule");
      return rule as AutomationRuleSummary;
    }),
    failedJobs: normalizeAutomationFailedJobs({ jobs: root.failedJobs }).jobs,
  };
}

export function normalizeAutomationFailedJobs(
  value: unknown,
): AutomationFailedJobsResponse {
  const root = record(value);
  only(root, ["jobs"]);
  if (!Array.isArray(root.jobs))
    throw new TypeError("Invalid automation failed jobs");
  return {
    jobs: root.jobs.map((entry) => {
      const job = record(entry);
      only(job, [
        "id",
        "ruleId",
        "ruleVersion",
        "actionType",
        "targetType",
        "targetId",
        "status",
        "attemptCount",
        "maxAttempts",
        "lastError",
        "failedAt",
        "updatedAt",
      ]);
      const error = record(job.lastError);
      only(error, ["kind", "message"]);
      if (
        typeof job.id !== "string" ||
        typeof job.ruleId !== "string" ||
        typeof job.ruleVersion !== "number" ||
        !Number.isSafeInteger(job.ruleVersion) ||
        typeof job.actionType !== "string" ||
        typeof job.targetType !== "string" ||
        typeof job.targetId !== "string" ||
        job.status !== "FAILED" ||
        typeof job.attemptCount !== "number" ||
        !Number.isSafeInteger(job.attemptCount) ||
        typeof job.maxAttempts !== "number" ||
        !Number.isSafeInteger(job.maxAttempts) ||
        typeof error.kind !== "string" ||
        typeof error.message !== "string" ||
        !iso(job.failedAt) ||
        !iso(job.updatedAt)
      )
        throw new TypeError("Invalid automation failed job");
      return job as AutomationFailedJob;
    }),
  };
}
