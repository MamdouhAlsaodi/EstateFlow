"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
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
      setActionError(getAutomationActionError(actionFailure).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">تفاصيل قاعدة الأتمتة</p>
          <h1>{detail ? detail.rule.name : "قاعدة الأتمتة"}</h1>
          <p>التعريف الحالي وسجل الإصدارات والتنفيذ؛ لا يوجد محرر قواعد.</p>
        </div>
        <button
          className="button button-secondary"
          onClick={() => void load()}
          type="button"
        >
          تحديث
        </button>
      </header>
      {loading && <p role="status">جارٍ تحميل القاعدة…</p>}
      {error && (
        <div className="state-card" role="alert">
          <strong>تعذر تحميل القاعدة</strong>
          <p>تحقق من الرابط والجلسة ثم حاول مرة أخرى.</p>
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
              <h2 id="rule-state-title">حالة القاعدة</h2>
              <span
                className={
                  detail.rule.enabled ? styles.enabled : styles.disabled
                }
              >
                {detail.rule.enabled ? "مفعّلة" : "متوقفة"} · الإصدار{" "}
                {detail.rule.currentVersion}
              </span>
            </div>
            <p>
              تشغيل القاعدة أو إيقافها متاح لصاحب المؤسسة أو المدير فقط. الإيقاف
              لا يحذف التاريخ ولا يعيد الوظائف السابقة.
            </p>
            <div className={styles.actions}>
              {detail.rule.enabled ? (
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => void toggleEnabled(false)}
                >
                  إيقاف القاعدة
                </button>
              ) : (
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => void toggleEnabled(true)}
                >
                  تفعيل القاعدة
                </button>
              )}
              <Link
                className={styles.ruleLink}
                href={`/ar/organizations/${organizationId}/automation/jobs`}
              >
                سجل تنفيذ المؤسسة
              </Link>
            </div>
          </section>
          <section aria-labelledby="rule-definition-title" className="panel">
            <div className={styles.sectionHeading}>
              <h2 id="rule-definition-title">التعريف الحالي</h2>
            </div>
            {describeDefinition(detail)}
          </section>
          <section aria-labelledby="rule-versions-title" className="panel">
            <div className={styles.sectionHeading}>
              <h2 id="rule-versions-title">سجل الإصدارات</h2>
              <span className="table-count">
                {detail.versions.length} إصدار
              </span>
            </div>
            <ol className={styles.timeline}>
              {[...detail.versions].reverse().map((version) => (
                <li key={version.version}>
                  <strong>الإصدار {version.version}</strong>
                  <span>
                    {formatDate(version.createdAt)}
                    {version.supersedesVersion
                      ? ` · حلّ محل الإصدار ${version.supersedesVersion}`
                      : ""}
                  </span>
                  {version.note && <span>ملاحظة: {version.note}</span>}
                </li>
              ))}
            </ol>
          </section>
          <section aria-labelledby="rule-jobs-title" className="panel">
            <div className={styles.sectionHeading}>
              <h2 id="rule-jobs-title">سجل التنفيذ لهذه القاعدة</h2>
              <span className="table-count">{jobs.length} وظيفة</span>
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

function describeDefinition(detail: AutomationRuleDetailResponse): ReactNode {
  const parsed = parseDefinition(detail.rule.definition);
  if (!parsed) return <p>تعريف غير متاح.</p>;
  const eventType = parsed.trigger.eventType;
  const scheduleTime = parsed.trigger.timeOfDayUtc;
  const actionType = parsed.action.actionType;
  return (
    <div className={styles.definitionGrid}>
      <div>
        <strong>المحفّز</strong>
        <span>
          {typeof eventType === "string"
            ? `عند ${eventType}`
            : typeof scheduleTime === "string"
              ? `يوميًا على الساعة ${scheduleTime} بتوقيت UTC`
              : "غير معروف"}
        </span>
      </div>
      <div>
        <strong>الشروط</strong>
        {parsed.conditions.length === 0 ? (
          <span>بدون شروط إضافية</span>
        ) : (
          parsed.conditions.map((condition, index) => (
            <span key={index}>{describeCondition(condition)}</span>
          ))
        )}
      </div>
      <div>
        <strong>الإجراء</strong>
        <span>
          {typeof actionType === "string"
            ? (jobActionLabels[actionType] ?? actionType)
            : "غير معروف"}
        </span>
      </div>
    </div>
  );
}

function describeCondition(condition: Record<string, unknown>): string {
  const field = typeof condition.field === "string" ? condition.field : "?";
  const op = typeof condition.op === "string" ? condition.op : "?";
  const operatorLabel = conditionOperatorLabels[op] ?? op;
  if (condition.value === undefined) return `${field} ${operatorLabel}`;
  const value = Array.isArray(condition.value)
    ? condition.value.join("، ")
    : String(condition.value);
  return `${field} ${operatorLabel} ${value}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "وقت غير متاح"
    : new Intl.DateTimeFormat("ar", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
