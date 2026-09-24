"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { formatDateTime, labelFromKey, useT } from "../../i18n";
import { useOrganizationContext } from "../organization-context/organization-context";
import type {
  AutomationJobRecord,
  AutomationRuleDetailResponse,
} from "./automation-contract";
import { conditionOperatorLabels, jobActionLabels } from "./automation-labels";
import {
  fetchAutomationRuleDetail,
  fetchAutomationRuleJobs,
  setAutomationRuleEnabled,
} from "./automation-jobs-api";
import { getAutomationActionError } from "./automation-jobs-model";
import { AutomationJobList } from "./automation-job-list";
import styles from "./automation-visibility.module.css";

/**
 * EF-306 — Arabic rule detail: current definition, the immutable version
 * timeline, enable/disable (the only rule editor action), and this rule's
 * execution history with retry/cancel. No other editor UI exists here.
 */
export function RuleDetailView({ ruleId }: Readonly<{ ruleId: string }>) {
  const t = useT();
  const { organizationId } = useOrganizationContext();
  const [detail, setDetail] = useState<AutomationRuleDetailResponse | null>(
    null,
  );
  const [jobs, setJobs] = useState<readonly AutomationJobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [ruleDetail, ruleJobs] = await Promise.all([
        fetchAutomationRuleDetail({ organizationId, ruleId }),
        fetchAutomationRuleJobs({ organizationId, ruleId }),
      ]);
      setDetail(ruleDetail);
      setJobs(ruleJobs.jobs);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [organizationId, ruleId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleEnabled(enabled: boolean) {
    setBusy(true);
    setActionError(null);
    try {
      await setAutomationRuleEnabled({
        organizationId,
        ruleId,
        enabled,
      });
      await load();
    } catch (actionFailure) {
      setActionError(t(getAutomationActionError(actionFailure).messageKey));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">{t("automation.rule.eyebrow")}</p>
          <h1>
            {detail ? detail.rule.name : t("automation.rule.fallbackTitle")}
          </h1>
          <p>{t("automation.rule.subtitle")}</p>
        </div>
        <button
          className="button button-secondary"
          onClick={() => void load()}
          type="button"
        >
          {t("automation.common.refresh")}
        </button>
      </header>
      {loading && <p role="status">{t("automation.rule.loading")}</p>}
      {error && (
        <div className="state-card" role="alert">
          <strong>{t("automation.rule.loadFailed")}</strong>
          <p>{t("automation.rule.loadFailedHint")}</p>
        </div>
      )}
      {actionError && (
        <div className="state-card" role="alert">
          {actionError}
        </div>
      )}
      {!loading && !error && detail && (
        <>
          <section aria-labelledby="rule-state-title" className="panel">
            <div className={styles.sectionHeading}>
              <h2 id="rule-state-title">{t("automation.rule.stateTitle")}</h2>
              <span
                className={
                  detail.rule.enabled ? styles.enabled : styles.disabled
                }
              >
                {detail.rule.enabled
                  ? t("automation.visibility.enabled")
                  : t("automation.visibility.disabled")}{" "}
                · {t("automation.common.versionPrefix")}{" "}
                {detail.rule.currentVersion}
              </span>
            </div>
            <p>{t("automation.rule.stateNote")}</p>
            <div className={styles.actions}>
              {detail.rule.enabled ? (
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => void toggleEnabled(false)}
                >
                  {t("automation.rule.disable")}
                </button>
              ) : (
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => void toggleEnabled(true)}
                >
                  {t("automation.rule.enable")}
                </button>
              )}
              <Link
                className={styles.ruleLink}
                href={`/ar/organizations/${organizationId}/automation/jobs`}
              >
                {t("automation.rule.orgHistory")}
              </Link>
            </div>
          </section>
          <section aria-labelledby="rule-definition-title" className="panel">
            <div className={styles.sectionHeading}>
              <h2 id="rule-definition-title">
                {t("automation.rule.definitionTitle")}
              </h2>
            </div>
            {describeDefinition(detail, t)}
          </section>
          <section aria-labelledby="rule-versions-title" className="panel">
            <div className={styles.sectionHeading}>
              <h2 id="rule-versions-title">
                {t("automation.rule.versionsTitle")}
              </h2>
              <span className="table-count">
                {t("automation.common.countVersions", {
                  count: detail.versions.length,
                })}
              </span>
            </div>
            <ol className={styles.timeline}>
              {[...detail.versions].reverse().map((version) => (
                <li key={version.version}>
                  <strong>
                    {t("automation.rule.versionLabel", {
                      version: version.version,
                    })}
                  </strong>
                  <span>
                    {formatDate(version.createdAt)}
                    {version.supersedesVersion
                      ? ` · ${t("automation.rule.supersedes", { version: version.supersedesVersion })}`
                      : ""}
                  </span>
                  {version.note && (
                    <span>
                      {t("automation.rule.notePrefix")} {version.note}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </section>
          <section aria-labelledby="rule-jobs-title" className="panel">
            <div className={styles.sectionHeading}>
              <h2 id="rule-jobs-title">{t("automation.rule.jobsTitle")}</h2>
              <span className="table-count">
                {t("automation.common.countJobs", { count: jobs.length })}
              </span>
            </div>
            <AutomationJobList
              organizationId={organizationId}
              jobs={jobs}
              onChanged={load}
              onActionError={setActionError}
            />
          </section>
        </>
      )}
    </div>
  );
}

type ParsedDefinition = Readonly<{
  trigger: Record<string, unknown>;
  conditions: readonly Record<string, unknown>[];
  action: Record<string, unknown>;
}>;

function parseDefinition(
  definition: Record<string, unknown>,
): ParsedDefinition | null {
  const trigger = definition.trigger;
  const conditions = definition.conditions;
  const action = definition.action;
  if (
    typeof trigger !== "object" ||
    trigger === null ||
    !Array.isArray(conditions) ||
    typeof action !== "object" ||
    action === null
  )
    return null;
  return {
    trigger: trigger as Record<string, unknown>,
    conditions: conditions as readonly Record<string, unknown>[],
    action: action as Record<string, unknown>,
  };
}

function describeDefinition(
  detail: AutomationRuleDetailResponse,
  t: ReturnType<typeof useT>,
): ReactNode {
  const parsed = parseDefinition(detail.rule.definition);
  if (!parsed) return <p>{t("automation.rule.definitionUnavailable")}</p>;
  const eventType = parsed.trigger.eventType;
  const scheduleTime = parsed.trigger.timeOfDayUtc;
  const actionType = parsed.action.actionType;
  return (
    <div className={styles.definitionGrid}>
      <div>
        <strong>{t("automation.rule.trigger")}</strong>
        <span>
          {typeof eventType === "string"
            ? t("automation.rule.triggerOnEvent", { eventType })
            : typeof scheduleTime === "string"
              ? t("automation.rule.triggerDailyAt", { time: scheduleTime })
              : t("automation.rule.unknown")}
        </span>
      </div>
      <div>
        <strong>{t("automation.rule.conditions")}</strong>
        {parsed.conditions.length === 0 ? (
          <span>{t("automation.rule.noConditions")}</span>
        ) : (
          parsed.conditions.map((condition, index) => (
            <span key={index}>{describeCondition(condition, t)}</span>
          ))
        )}
      </div>
      <div>
        <strong>{t("automation.rule.action")}</strong>
        <span>
          {typeof actionType === "string"
            ? labelFromKey(jobActionLabels, t, actionType, actionType)
            : t("automation.rule.unknown")}
        </span>
      </div>
    </div>
  );
}

function describeCondition(
  condition: Record<string, unknown>,
  t: ReturnType<typeof useT>,
): string {
  const field = typeof condition.field === "string" ? condition.field : "?";
  const op = typeof condition.op === "string" ? condition.op : "?";
  const operatorLabel = labelFromKey(conditionOperatorLabels, t, op, op);
  if (condition.value === undefined) return `${field} ${operatorLabel}`;
  const value = Array.isArray(condition.value)
    ? condition.value.join(t("common.listSeparator"))
    : String(condition.value);
  return `${field} ${operatorLabel} ${value}`;
}

function formatDate(value: string): string {
  return formatDateTime(value);
}
