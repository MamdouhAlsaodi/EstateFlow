"use client";

import { useCallback, useEffect, useState } from "react";
import { createApiClient } from "../../lib/api-client/index";
import { useOrganizationContext } from "../organization-context/organization-context";
import type {
  AutomationFailedJob,
  AutomationRuleSummary,
} from "./automation-contract";
import styles from "./automation-visibility.module.css";

const apiClient = createApiClient();

const eventLabels: Record<string, string> = {
  "lead.created": "إنشاء عميل",
  "lead.stage_changed": "تغيير مرحلة",
  "lead.assignment_changed": "تغيير المسؤول",
  "lead.response_sla_breached": "تجاوز مهلة الرد",
  "lead.inactivity_breached": "خمول العميل",
  "lead.next_action_missing": "غياب الإجراء التالي",
};

export function AutomationVisibility() {
  const { organizationId } = useOrganizationContext();
  const [rules, setRules] = useState<readonly AutomationRuleSummary[]>([]);
  const [jobs, setJobs] = useState<readonly AutomationFailedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [ruleResponse, jobResponse] = await Promise.all([
        apiClient.getAutomationRules({ organizationId }),
        apiClient.getAutomationFailedJobs({ organizationId }),
      ]);
      setRules(ruleResponse.rules);
      setJobs(jobResponse.jobs);
      setRefreshedAt(new Date().toISOString());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">تشغيل آلي قابل للمراجعة</p>
          <h1>الأتمتة والمتابعة</h1>
          <p>
            قائمة القواعد وحالات التنفيذ الفاشلة فقط؛ لا يوجد محرر قواعد هنا.
          </p>
        </div>
        <button
          className="button button-secondary"
          onClick={() => void load()}
          type="button"
        >
          تحديث
        </button>
      </header>
      {refreshedAt && (
        <p className={styles.freshness}>آخر تحديث: {formatDate(refreshedAt)}</p>
      )}
      {loading && <p role="status">جارٍ تحميل الأتمتة…</p>}
      {error && (
        <div className="state-card" role="alert">
          <strong>تعذر تحميل الأتمتة</strong>
          <p>تحقق من الجلسة ثم حاول مرة أخرى.</p>
        </div>
      )}
      {!loading && !error && (
        <>
          <section aria-labelledby="automation-rules-title" className="panel">
            <div className={styles.sectionHeading}>
              <h2 id="automation-rules-title">القواعد الحالية</h2>
              <span className="table-count">{rules.length} قاعدة</span>
            </div>
            {rules.length === 0 ? (
              <p>لا توجد قواعد مفعّلة أو منشأة بعد.</p>
            ) : (
              <ul className={styles.list}>
                {rules.map((rule) => (
                  <li key={rule.id}>
                    <div>
                      <strong>{rule.name}</strong>
                      <span>{describeTrigger(rule)}</span>
                    </div>
                    <span
                      className={
                        rule.enabled ? styles.enabled : styles.disabled
                      }
                    >
                      {rule.enabled ? "مفعّلة" : "متوقفة"} · الإصدار{" "}
                      {rule.currentVersion}
                    </span>
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
              <h2 id="automation-failures-title">فشل الوظائف الأخيرة</h2>
              <span className="table-count">{jobs.length} فشل</span>
            </div>
            {jobs.length === 0 ? (
              <p>لا توجد وظائف فاشلة حديثة.</p>
            ) : (
              <ul className={styles.list}>
                {jobs.map((job) => (
                  <li key={job.id}>
                    <div>
                      <strong>{job.lastError.message}</strong>
                      <span>
                        {job.actionType} · المحاولة {job.attemptCount}/
                        {job.maxAttempts}
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

function describeTrigger(rule: AutomationRuleSummary): string {
  const trigger = rule.definition.trigger;
  if (typeof trigger !== "object" || trigger === null) return "قاعدة مخصصة";
  const eventType = (trigger as { eventType?: unknown }).eventType;
  return typeof eventType === "string"
    ? (eventLabels[eventType] ?? eventType)
    : "جدول يومي";
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
