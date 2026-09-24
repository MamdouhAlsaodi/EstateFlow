"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDateTime, labelFromKey, useT } from "../../i18n";
import type { AutomationJobRecord } from "./automation-contract";
import {
  canCancelAutomationJob,
  canRetryAutomationJob,
  jobActionLabels,
  jobErrorKindLabels,
  jobStatusLabels,
  jobTargetLabels,
  jobTriggerKindLabels,
} from "./automation-labels";
import { cancelAutomationJob, retryAutomationJob } from "./automation-jobs-api";
import { getAutomationActionError } from "./automation-jobs-model";
import styles from "./automation-visibility.module.css";

/**
 * EF-306 — typed execution-history rendering shared by the rule detail and
 * organization history views. Only typed states, timestamps, attempt counts,
 * and typed failure reasons are shown; no payload, execution key, or secret
 * is ever rendered. Retry/cancel buttons follow the same authority matrix as
 * the API (Owner/Manager) and only appear for actionable states: retry for
 * FAILED jobs, cancel for QUEUED/RETRYING jobs.
 */
export function AutomationJobList({
  organizationId,
  jobs,
  onChanged,
  onActionError,
}: {
  organizationId: string;
  jobs: readonly AutomationJobRecord[];
  onChanged: () => Promise<void> | void;
  onActionError: (message: string | null) => void;
}) {
  const t = useT();
  const [busyJobId, setBusyJobId] = useState<string | null>(null);

  async function act(job: AutomationJobRecord, action: "retry" | "cancel") {
    setBusyJobId(job.id);
    onActionError(null);
    try {
      if (action === "retry") {
        await retryAutomationJob({ organizationId, jobId: job.id });
      } else {
        await cancelAutomationJob({ organizationId, jobId: job.id });
      }
      await onChanged();
    } catch (error) {
      onActionError(t(getAutomationActionError(error).messageKey));
    } finally {
      setBusyJobId(null);
    }
  }

  if (jobs.length === 0) return <p>{t("automation.jobs.empty")}</p>;

  return (
    <ul className={styles.list}>
      {jobs.map((job) => (
        <li key={job.id}>
          <div>
            <strong>
              {labelFromKey(jobActionLabels, t, job.actionType, job.actionType)}{" "}
              ·{" "}
              {labelFromKey(jobTargetLabels, t, job.targetType, job.targetType)}
            </strong>
            <span>
              {labelFromKey(
                jobTriggerKindLabels,
                t,
                job.triggerKind,
                job.triggerKind,
              )}
              {job.eventType ? ` · ${job.eventType}` : ""} ·{" "}
              {t("automation.common.versionPrefix")} {job.ruleVersion}
            </span>
            <span>
              {t("automation.common.scheduledPrefix")}{" "}
              {formatDate(job.scheduledFor)} ·{" "}
              {t("automation.common.updatedPrefix")} {formatDate(job.updatedAt)}
            </span>
            <span
              className={
                job.status === "SUCCEEDED"
                  ? styles.enabled
                  : job.status === "FAILED"
                    ? styles.failed
                    : styles.disabled
              }
            >
              {labelFromKey(jobStatusLabels, t, job.status, job.status)} ·{" "}
              {t("automation.common.attemptPrefix")} {job.attemptCount}/
              {job.maxAttempts}
            </span>
            {job.lastError && (
              <span className={styles.failed}>
                {t("automation.common.failureReasonPrefix")}{" "}
                {labelFromKey(
                  jobErrorKindLabels,
                  t,
                  job.lastError.kind,
                  job.lastError.kind,
                )}{" "}
                · {job.lastError.message}
              </span>
            )}
          </div>
          <div className={styles.actions}>
            {canRetryAutomationJob(job.status) && (
              <button
                className="button button-secondary"
                type="button"
                disabled={busyJobId === job.id}
                onClick={() => void act(job, "retry")}
              >
                {t("automation.common.retry")}
              </button>
            )}
            {canCancelAutomationJob(job.status) && (
              <button
                className="button button-secondary"
                type="button"
                disabled={busyJobId === job.id}
                onClick={() => void act(job, "cancel")}
              >
                {t("automation.common.cancel")}
              </button>
            )}
            <Link
              className={styles.ruleLink}
              href={`/ar/organizations/${organizationId}/automation/rules/${job.ruleId}`}
            >
              {t("automation.common.rule")}
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

function formatDate(value: string): string {
  return formatDateTime(value);
}
