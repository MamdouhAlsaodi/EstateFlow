export type AutomationRuleSummary = Readonly<{
  id: string;
  name: string;
  enabled: boolean;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
  definition: Record<string, unknown>;
}>;

export type AutomationFinanceJob = Readonly<{
  id: string;
  ruleId: string;
  ruleVersion: number;
  actionType: string;
  targetType: "RECEIVABLE" | "COMMISSION";
  targetId: string;
  status:
    "QUEUED" | "RUNNING" | "RETRYING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  attemptCount: number;
  maxAttempts: number;
  lastError: { kind: string; message: string } | null;
  scheduledFor: string;
  completedAt: string | null;
  updatedAt: string;
}>;

export type AutomationRulesResponse = Readonly<{
  rules: readonly AutomationRuleSummary[];
  failedJobs: readonly AutomationFailedJob[];
  recentFinanceJobs: readonly AutomationFinanceJob[];
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

/**
 * EF-306 — typed execution-history record. Mirrors the closed API rendering:
 * states, timestamps, attempt bookkeeping, and the typed last error only —
 * never an action payload, execution key, or provider payload.
 */
export type AutomationJobStatus =
  "QUEUED" | "RUNNING" | "RETRYING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

export type AutomationJobRecord = Readonly<{
  id: string;
  ruleId: string;
  ruleVersion: number;
  triggerKind: "DOMAIN_EVENT" | "SCHEDULE";
  eventType: string | null;
  actionType: string;
  targetType: string;
  targetId: string;
  status: AutomationJobStatus;
  attemptCount: number;
  maxAttempts: number;
  lastError: { kind: string; message: string } | null;
  scheduledFor: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type AutomationJobListResponse = Readonly<{
  jobs: readonly AutomationJobRecord[];
}>;

export type AutomationJobDetailResponse = Readonly<{
  job: AutomationJobRecord;
}>;

export type AutomationRuleVersionRecord = Readonly<{
  version: number;
  definition: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  supersedesVersion: number | null;
  note: string | null;
}>;

export type AutomationRuleDetailResponse = Readonly<{
  rule: AutomationRuleSummary;
  versions: readonly AutomationRuleVersionRecord[];
}>;

const jobFields = [
  "id",
  "ruleId",
  "ruleVersion",
  "triggerKind",
  "eventType",
  "actionType",
  "targetType",
  "targetId",
  "status",
  "attemptCount",
  "maxAttempts",
  "lastError",
  "scheduledFor",
  "startedAt",
  "completedAt",
  "createdAt",
  "updatedAt",
] as const;

const jobStatuses = [
  "QUEUED",
  "RUNNING",
  "RETRYING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
] as const;

const jobErrorKinds = [
  "action-executor-not-configured",
  "action-permanent-failure",
  "action-transient-failure",
  "unexpected-executor-error",
] as const;

function optionalIso(value: unknown): value is string | null {
  return value === null || iso(value);
}

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
  only(root, ["rules", "failedJobs", "recentFinanceJobs"]);
  if (
    !Array.isArray(root.rules) ||
    !Array.isArray(root.failedJobs) ||
    !Array.isArray(root.recentFinanceJobs)
  )
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
    recentFinanceJobs: normalizeAutomationFinanceJobs(root.recentFinanceJobs),
  };
}

function normalizeAutomationFinanceJobs(
  value: unknown,
): readonly AutomationFinanceJob[] {
  if (!Array.isArray(value))
    throw new TypeError("Invalid finance reminder jobs");
  return value.map((entry) => {
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
      "scheduledFor",
      "completedAt",
      "updatedAt",
    ]);
    const error = job.lastError === null ? null : record(job.lastError);
    if (error) {
      only(error, ["kind", "message"]);
      if (typeof error.kind !== "string" || typeof error.message !== "string")
        throw new TypeError("Invalid finance reminder error");
    }
    if (
      typeof job.id !== "string" ||
      typeof job.ruleId !== "string" ||
      typeof job.ruleVersion !== "number" ||
      !Number.isSafeInteger(job.ruleVersion) ||
      typeof job.actionType !== "string" ||
      (job.targetType !== "RECEIVABLE" && job.targetType !== "COMMISSION") ||
      typeof job.targetId !== "string" ||
      ![
        "QUEUED",
        "RUNNING",
        "RETRYING",
        "SUCCEEDED",
        "FAILED",
        "CANCELLED",
      ].includes(job.status as string) ||
      typeof job.attemptCount !== "number" ||
      !Number.isSafeInteger(job.attemptCount) ||
      typeof job.maxAttempts !== "number" ||
      !Number.isSafeInteger(job.maxAttempts) ||
      !iso(job.scheduledFor) ||
      (job.completedAt !== null && !iso(job.completedAt)) ||
      !iso(job.updatedAt)
    )
      throw new TypeError("Invalid finance reminder job");
    return job as AutomationFinanceJob;
  });
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

/** Strict closed-world normalization of an EF-306 execution-history page. */
export function normalizeAutomationJobList(
  value: unknown,
): AutomationJobListResponse {
  const root = record(value);
  only(root, ["jobs"]);
  if (!Array.isArray(root.jobs))
    throw new TypeError("Invalid automation job list");
  return { jobs: root.jobs.map(normalizeAutomationJobRecord) };
}

export function normalizeAutomationJobDetail(
  value: unknown,
): AutomationJobDetailResponse {
  const root = record(value);
  only(root, ["job"]);
  return { job: normalizeAutomationJobRecord(root.job) };
}

function normalizeAutomationJobRecord(value: unknown): AutomationJobRecord {
  const job = record(value);
  only(job, jobFields);
  if (
    typeof job.id !== "string" ||
    typeof job.ruleId !== "string" ||
    typeof job.ruleVersion !== "number" ||
    !Number.isSafeInteger(job.ruleVersion) ||
    job.ruleVersion < 1 ||
    (job.triggerKind !== "DOMAIN_EVENT" && job.triggerKind !== "SCHEDULE") ||
    (job.eventType !== null && typeof job.eventType !== "string") ||
    typeof job.actionType !== "string" ||
    typeof job.targetType !== "string" ||
    typeof job.targetId !== "string" ||
    job.targetId.length < 1 ||
    !jobStatuses.includes(job.status as never) ||
    typeof job.attemptCount !== "number" ||
    !Number.isSafeInteger(job.attemptCount) ||
    job.attemptCount < 0 ||
    typeof job.maxAttempts !== "number" ||
    !Number.isSafeInteger(job.maxAttempts) ||
    job.maxAttempts < 1 ||
    !iso(job.scheduledFor) ||
    !optionalIso(job.startedAt) ||
    !optionalIso(job.completedAt) ||
    !iso(job.createdAt) ||
    !iso(job.updatedAt)
  )
    throw new TypeError("Invalid automation job record");
  if (job.lastError === null) return job as AutomationJobRecord;
  const error = record(job.lastError);
  only(error, ["kind", "message"]);
  if (
    !jobErrorKinds.includes(error.kind as never) ||
    typeof error.message !== "string"
  )
    throw new TypeError("Invalid automation job error");
  return job as AutomationJobRecord;
}

const ruleDetailFields = ["rule", "versions"] as const;
const ruleVersionFields = [
  "version",
  "definition",
  "createdBy",
  "createdAt",
  "supersedesVersion",
  "note",
] as const;

/** Strict closed-world normalization of an EF-301 rule detail response. */
export function normalizeAutomationRuleDetail(
  value: unknown,
): AutomationRuleDetailResponse {
  const root = record(value);
  only(root, ruleDetailFields);
  const rule = normalizeAutomationRules({
    rules: [root.rule],
    failedJobs: [],
    recentFinanceJobs: [],
  }).rules[0];
  if (!Array.isArray(root.versions) || root.versions.length < 1)
    throw new TypeError("Invalid automation rule versions");
  const versions = root.versions.map((entry) => {
    const version = record(entry);
    only(version, ruleVersionFields);
    if (
      typeof version.version !== "number" ||
      !Number.isSafeInteger(version.version) ||
      version.version < 1 ||
      typeof version.definition !== "object" ||
      version.definition === null ||
      Array.isArray(version.definition) ||
      typeof version.createdBy !== "string" ||
      !iso(version.createdAt) ||
      !(
        version.supersedesVersion === null ||
        (typeof version.supersedesVersion === "number" &&
          Number.isSafeInteger(version.supersedesVersion))
      ) ||
      !(version.note === null || typeof version.note === "string")
    )
      throw new TypeError("Invalid automation rule version");
    return version as AutomationRuleVersionRecord;
  });
  return { rule, versions };
}
