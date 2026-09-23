"use client";

import { useCallback, useEffect, useState } from "react";
import { createApiClient } from "../../lib/api-client/index";
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

const eventLabels: Record<string, string> = {
  "lead.created": "إنشاء عميل",
  "lead.stage_changed": "تغيير مرحلة",
  "lead.assignment_changed": "تغيير المسؤول",
  "lead.response_sla_breached": "تجاوز مهلة الرد",
  "lead.inactivity_breached": "خمول العميل",
  "lead.next_action_missing": "غياب الإجراء التالي",
  "receivable.due_soon": "استحقاق ذمة قريب",
  "receivable.overdue": "ذمة متأخرة",
  "commission.due": "عمولة مستحقة",
};

export function AutomationVisibility() {
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
        const reason = window.prompt("سبب الرفض")?.trim() ?? "";
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
          <section aria-labelledby="finance-reminders-title" className="panel">
            <div className={styles.sectionHeading}>
              <h2 id="finance-reminders-title">وظائف التذكير المالي الأخيرة</h2>
              <span className="table-count">{financeJobs.length} وظيفة</span>
            </div>
            {financeJobs.length === 0 ? (
              <p>لا توجد وظائف تذكير مالي حديثة.</p>
            ) : (
              <ul className={styles.list}>
                {financeJobs.map((job) => (
                  <li key={job.id}>
                    <div>
                      <strong>
                        {job.targetType === "RECEIVABLE"
                          ? "ذمة مدينة"
                          : "عمولة"}
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
              <h2 id="notification-templates-title">قوالب الإشعارات</h2>
              <span className="table-count">{templates.length} إصدار</span>
            </div>
            {templates.length === 0 ? (
              <p>لا توجد قوالب بعد.</p>
            ) : (
              <ul className={styles.list}>
                {templates.map((template) => (
                  <li key={template.id}>
                    <div>
                      <strong>
                        {template.templateKey} · {template.locale}
                      </strong>
                      <span>
                        {template.status} · الإصدار {template.version}
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
              <h2 id="notification-approvals-title">طلبات الموافقة المعلقة</h2>
              <span className="table-count">{approvals.length} طلب</span>
            </div>
            {approvals.length === 0 ? (
              <p>لا توجد طلبات معلقة.</p>
            ) : (
              <ul className={styles.list}>
                {approvals.map((approval) => (
                  <li key={approval.id}>
                    <div>
                      <strong>
                        {approval.channel} · {approval.locale}
                      </strong>
                      <span>المستلم: {approval.recipientUserId}</span>
                    </div>
                    <div>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => void decide(approval.id, "approve")}
                      >
                        اعتماد
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => void decide(approval.id, "reject")}
                      >
                        رفض
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="notification-sends-title" className="panel">
            <div className={styles.sectionHeading}>
              <h2 id="notification-sends-title">الإرسالات الأخيرة</h2>
              <span className="table-count">{sends.length} إرسال</span>
            </div>
            {sends.length === 0 ? (
              <p>لا توجد إرسالات بعد.</p>
            ) : (
              <ul className={styles.list}>
                {sends.map((send) => (
                  <li key={send.id}>
                    <div>
                      <strong>{send.templateKey}</strong>
                      <span>
                        {send.status}
                        {send.suppressionReason
                          ? ` · سبب الحجب: ${send.suppressionReason}`
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
