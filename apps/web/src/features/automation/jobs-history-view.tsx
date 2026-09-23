"use client";

import { useCallback, useEffect, useState } from "react";
import { useOrganizationContext } from "../organization-context/organization-context";
import type { AutomationJobRecord } from "./automation-contract";
import { fetchAutomationJobs } from "./automation-jobs-api";
import { AutomationJobList } from "./automation-job-list";
import styles from "./automation-visibility.module.css";

/**
 * EF-306 — organization-wide execution history. Typed job states, timestamps,
 * retry counts, and typed failure reasons only; never a raw provider payload
 * or secret. Retry/cancel appear per state and follow the Owner/Manager
 * authority matrix enforced by the API.
 */
export function JobsHistoryView() {
  const { organizationId } = useOrganizationContext();
  const [jobs, setJobs] = useState<readonly AutomationJobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetchAutomationJobs({ organizationId });
      setJobs(response.jobs);
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
          <p className="eyebrow">سجل التنفيذ الآلي</p>
          <h1>سجل تنفيذ الأتمتة</h1>
          <p>
            كل وظائف المؤسسة الأخيرة بحالاتها وأسباب الفشل المكتوبة؛ بدون أي
            حمولات خام.
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
      {loading && <p role="status">جارٍ تحميل سجل التنفيذ…</p>}
      {error && (
        <div className="state-card" role="alert">
          <strong>تعذر تحميل سجل التنفيذ</strong>
          <p>تحقق من الجلسة ثم حاول مرة أخرى.</p>
        </div>
      )}
      {actionError && (
        <div className="state-card" role="alert">
          {actionError}
        </div>
      )}
      {!loading && !error && (
        <section aria-labelledby="org-jobs-title" className="panel">
          <div className={styles.sectionHeading}>
            <h2 id="org-jobs-title">الوظائف الأخيرة</h2>
            <span className="table-count">{jobs.length} وظيفة</span>
          </div>
          <AutomationJobList
            organizationId={organizationId}
            jobs={jobs}
            onChanged={load}
            onActionError={setActionError}
          />
        </section>
      )}
    </div>
  );
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
