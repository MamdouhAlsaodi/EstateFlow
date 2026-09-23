import type {
  AutomationJob,
  AutomationJobStatus,
} from "../domain/execution.js";

/**
 * Durable job persistence. Every method is organization-scoped; the unique
 * (organizationId, executionKey) constraint created by migration fourteen is
 * what makes schedule evaluation replay-safe.
 */
export interface AutomationJobRepository {
  findJobByExecutionKey(
    organizationId: string,
    executionKey: string,
  ): Promise<AutomationJob | null>;
  /**
   * Idempotent insert: a concurrent or replayed insert of the same execution
   * key resolves to "duplicate" and never creates a second job row.
   */
  insertJob(
    job: AutomationJob,
  ): Promise<Readonly<{ kind: "inserted" }> | Readonly<{ kind: "duplicate" }>>;
  /**
   * Atomically claim the oldest due queued/retrying job (FOR UPDATE SKIP
   * LOCKED), so two concurrent ticks can never run the same job.
   */
  claimNextDueJob(now: Date): Promise<AutomationJob | null>;
  /**
   * Persist the outcome of a claimed run. Guarded on the job still being in
   * RUNNING state at the exact attempt count that was claimed.
   */
  saveJobOutcome(job: AutomationJob): Promise<boolean>;
  listJobsByStatus(input: {
    organizationId: string;
    status: AutomationJobStatus;
    limit: number;
  }): Promise<AutomationJob[]>;
  listJobsForRule(input: {
    organizationId: string;
    ruleId: string;
    limit: number;
  }): Promise<AutomationJob[]>;
  listRecentFinanceJobs(input: {
    organizationId: string;
    limit: number;
  }): Promise<AutomationJob[]>;
}
