"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createApiClient } from "../../lib/api-client/index";
import { formatDateTime, useT, type MessageKey } from "../../i18n";
import { useOrganizationContext } from "../organization-context/organization-context";
import type {
  AutomationFailedJob,
  AutomationRuleSummary,
} from "./automation-contract";
import type {
  NotificationApprovalSummary,
  NotificationSendSummary,
  NotificationTemplateSummary,
} from "./notification-contract";
import { createSessionCsrfProvider } from "../../lib/api-client/session";
import styles from "./automation-visibility.module.css";

const apiClient = createApiClient();

const eventLabels: Record<string, MessageKey> = {
  "lead.created": "automation.event.lead.created",
  "lead.stage_changed": "automation.event.lead.stage_changed",
  "lead.assignment_changed": "automation.event.lead.assignment_changed",
  "lead.response_sla_breached": "automation.event.lead.response_sla_breached",
  "lead.inactivity_breached": "automation.event.lead.inactivity_breached",
  "lead.next_action_missing": "automation.event.lead.next_action_missing",
  "receivable.due_soon": "automation.event.receivable.due_soon",
  "receivable.overdue": "automation.event.receivable.overdue",
  "commission.due": "automation.event.commission.due",
  "viewing.reminder_24h": "automation.event.viewing.reminder_24h",
  "viewing.reminder_1h": "automation.event.viewing.reminder_1h",
  "viewing.outcome_requested": "automation.event.viewing.outcome_requested",
};

export function AutomationVisibility() {
  const t = useT();
  const { organizationId } = useOrganizationContext();
  const [rules, setRules] = useState<readonly AutomationRuleSummary[]>([]);
  const [jobs, setJobs] = useState<readonly AutomationFailedJob[]>([]);
  const [financeJobs, setFinanceJobs] = useState<
    readonly {
      id: string;
      targetType: "RECEIVABLE" | "COMMISSION";
      status: string;
      scheduledFor: string;
      updatedAt: string;
    }[]
  >([]);
  const [templates, setTemplates] = useState<
    readonly NotificationTemplateSummary[]
  >([]);
  const [approvals, setApprovals] = useState<
    readonly NotificationApprovalSummary[]
  >([]);
  const [sends, setSends] = useState<readonly NotificationSendSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const ruleResponse = await apiClient.getAutomationRules({
        organizationId,
      });
      setRules(ruleResponse.rules);
      setJobs(ruleResponse.failedJobs);
      setFinanceJobs(ruleResponse.recentFinanceJobs);
      const [templateItems, approvalItems, sendItems] = await Promise.all([
        apiClient.getNotificationTemplates({ organizationId }),
        apiClient.getNotificationApprovals({ organizationId }),
        apiClient.getNotificationSends({ organizationId }),
      ]);
      setTemplates(templateItems);
      setApprovals(approvalItems);
      setSends(sendItems);
      setRefreshedAt(new Date().toISOString());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  async function decide(approvalId: string, decision: "approve" | "reject") {
    try {
      const csrfToken = await createSessionCsrfProvider(apiClient).getToken();
      if (decision === "approve") {
        await apiClient.approveNotification({
          organizationId,
          approvalId,
          csrfToken,
        });
      } else {
        const reason =
          window
            .prompt(t("automation.visibility.rejectReasonPrompt"))
            ?.trim() ?? "";
        if (!reason) return;
        await apiClient.rejectNotification({
          organizationId,
          approvalId,
          reason,
          csrfToken,
        });
      }
      await load();
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">{t("automation.visibility.eyebrow")}</p>
          <h1>{t("automation.visibility.title")}</h1>
          <p>{t("automation.visibility.subtitle")}</p>
        </div>
        <button
          className="button button-secondary"
          onClick={() => void load()}
          type="button"
        >
          {t("automation.common.refresh")}
        </button>
      </header>
      {refreshedAt && (
        <p className={styles.freshness}>
          {t("automation.common.lastUpdatePrefix")} {formatDate(refreshedAt)}
        </p>
      )}
      {loading && <p role="status">{t("automation.visibility.loading")}</p>}
      {error && (
        <div className="state-card" role="alert">
          <strong>{t("automation.visibility.loadFailed")}</strong>
          <p>{t("automation.visibility.loadFailedHint")}</p>
        </div>
      )}
      {!loading && !error && (
        <>
          <section aria-labelledby="automation-rules-title" className="panel">
            <div className={styles.sectionHeading}>
              <h2 id="automation-rules-title">
                {t("automation.visibility.currentRules")}
              </h2>
              <span className="table-count">
                {t("automation.common.countRules", { count: rules.length })}
              </span>
            </div>
            {rules.length === 0 ? (
              <p>{t("automation.visibility.rulesEmpty")}</p>
            ) : (
              <ul className={styles.list}>
                {rules.map((rule) => (
                  <li key={rule.id}>
                    <div>
                      <strong>{rule.name}</strong>
                      <span>{describeTrigger(rule, t)}</span>
                    </div>
                    <div className={styles.actions}>
                      <span
                        className={
                          rule.enabled ? styles.enabled : styles.disabled
                        }
                      >
                        {rule.enabled
                          ? t("automation.visibility.enabled")
                          : t("automation.visibility.disabled")}{" "}
                        · {t("automation.common.versionPrefix")}{" "}
                        {rule.currentVersion}
                      </span>
                      <Link
                        className={styles.ruleLink}
                        href={`/ar/organizations/${organizationId}/automation/rules/${rule.id}`}
                      >
                        {t("automation.visibility.details")}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="automation-history-title" className="panel">
            <div className={styles.sectionHeading}>
              <h2 id="automation-history-title">
                {t("automation.visibility.historyTitle")}
              </h2>
            </div>
            <p>{t("automation.visibility.historyBody")}</p>
            <Link
              className={styles.ruleLink}
              href={`/ar/organizations/${organizationId}/automation/jobs`}
            >
              {t("automation.visibility.historyLink")}
            </Link>
          </section>
          <section aria-labelledby="finance-reminders-title" className="panel">
            <div className={styles.sectionHeading}>
              <h2 id="finance-reminders-title">
                {t("automation.visibility.financeReminders")}
              </h2>
              <span className="table-count">
                {t("automation.common.countJobs", {
                  count: financeJobs.length,
                })}
              </span>
            </div>
            {financeJobs.length === 0 ? (
              <p>{t("automation.visibility.financeEmpty")}</p>
            ) : (
              <ul className={styles.list}>
                {financeJobs.map((job) => (
                  <li key={job.id}>
                    <div>
                      <strong>
                        {job.targetType === "RECEIVABLE"
                          ? t("automation.target.RECEIVABLE")
                          : t("automation.target.COMMISSION")}
                      </strong>
                      <span>
                        {job.status} · {job.targetType}
                      </span>
                    </div>
                    <time dateTime={job.scheduledFor}>
                      {formatDate(job.updatedAt)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section
            aria-labelledby="notification-templates-title"
            className="panel"
          >
            <div className={styles.sectionHeading}>
              <h2 id="notification-templates-title">
                {t("automation.visibility.templates")}
              </h2>
              <span className="table-count">
                {t("automation.common.countVersions", {
                  count: templates.length,
                })}
              </span>
            </div>
            {templates.length === 0 ? (
              <p>{t("automation.visibility.templatesEmpty")}</p>
            ) : (
              <ul className={styles.list}>
                {templates.map((template) => (
                  <li key={template.id}>
                    <div>
                      <strong>
                        {template.templateKey} · {template.locale}
                      </strong>
                      <span>
                        {template.status} ·{" "}
                        {t("automation.visibility.templateVersionPrefix")}{" "}
                        {template.version}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section
            aria-labelledby="notification-approvals-title"
            className="panel"
          >
            <div className={styles.sectionHeading}>
              <h2 id="notification-approvals-title">
                {t("automation.visibility.approvals")}
              </h2>
              <span className="table-count">
                {t("automation.common.countRequests", {
                  count: approvals.length,
                })}
              </span>
            </div>
            {approvals.length === 0 ? (
              <p>{t("automation.visibility.approvalsEmpty")}</p>
            ) : (
              <ul className={styles.list}>
                {approvals.map((approval) => (
                  <li key={approval.id}>
                    <div>
                      <strong>
                        {approval.channel} · {approval.locale}
                      </strong>
                      <span>
                        {t("automation.visibility.recipientPrefix")}{" "}
                        {approval.recipientUserId}
                      </span>
                    </div>
                    <div>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => void decide(approval.id, "approve")}
                      >
                        {t("automation.visibility.approve")}
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => void decide(approval.id, "reject")}
                      >
                        {t("automation.visibility.reject")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="notification-sends-title" className="panel">
            <div className={styles.sectionHeading}>
              <h2 id="notification-sends-title">
                {t("automation.visibility.sends")}
              </h2>
              <span className="table-count">
                {t("automation.common.countSends", { count: sends.length })}
              </span>
            </div>
            {sends.length === 0 ? (
              <p>{t("automation.visibility.sendsEmpty")}</p>
            ) : (
              <ul className={styles.list}>
                {sends.map((send) => (
                  <li key={send.id}>
                    <div>
                      <strong>{send.templateKey}</strong>
                      <span>
                        {send.status}
                        {send.suppressionReason
                          ? ` · ${t("automation.visibility.suppressionPrefix")} ${send.suppressionReason}`
                          : ""}
                      </span>
                    </div>
                    <time dateTime={send.createdAt}>
                      {formatDate(send.createdAt)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section
            aria-labelledby="automation-failures-title"
            className="panel"
          >
            <div className={styles.sectionHeading}>
              <h2 id="automation-failures-title">
                {t("automation.visibility.failures")}
              </h2>
              <span className="table-count">
                {t("automation.common.countFailures", { count: jobs.length })}
              </span>
            </div>
            {jobs.length === 0 ? (
              <p>{t("automation.visibility.failuresEmpty")}</p>
            ) : (
              <ul className={styles.list}>
                {jobs.map((job) => (
                  <li key={job.id}>
                    <div>
                      <strong>{job.lastError.message}</strong>
                      <span>
                        {job.actionType} ·{" "}
                        {t("automation.common.attemptPrefix")}{" "}
                        {job.attemptCount}/{job.maxAttempts}
                      </span>
                    </div>
                    <time dateTime={job.failedAt}>
                      {formatDate(job.failedAt)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function describeTrigger(
  rule: AutomationRuleSummary,
  t: ReturnType<typeof useT>,
): string {
  const trigger = rule.definition.trigger;
  if (typeof trigger !== "object" || trigger === null)
    return t("automation.visibility.customRule");
  const eventType = (trigger as { eventType?: unknown }).eventType;
  return typeof eventType === "string"
    ? eventLabels[eventType]
      ? t(eventLabels[eventType])
      : eventType
    : t("automation.visibility.dailySchedule");
}

function formatDate(value: string): string {
  return formatDateTime(value);
}
