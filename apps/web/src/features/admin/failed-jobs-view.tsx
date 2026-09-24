"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchFailedJobs } from "./admin-api";
import type { AdminFailedJob, AdminFailedJobsPage } from "./admin-contract";
import { FAILURE_KIND_LABELS, labelFrom } from "./admin-labels";
import styles from "./admin.module.css";

/**
 * EF-620 — cross-tenant failed automation jobs review (EF-302/EF-306 data).
 * Typed states, attempt bookkeeping, and typed failure reasons only — never
 * an execution key, event payload, or provider body. Optional organization
 * filter and keyset «تحميل الأحدث» pagination keep every query bounded.
 */
export function FailedJobsView() {
  const [page, setPage] = useState<AdminFailedJobsPage | null>(null);
  const [items, setItems] = useState<readonly AdminFailedJob[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(
    async (cursor: string | null, append: boolean) => {
      setLoading(true);
      setError(false);
      try {
        const result = await fetchFailedJobs({
          cursor,
          limit: 25,
          organizationId:
            organizationId.trim() === "" ? undefined : organizationId.trim(),
        });
        setPage(result);
        setItems((current) =>
          append ? [...current, ...result.items] : result.items,
        );
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [organizationId],
  );

  useEffect(() => {
    void load(null, false);
  }, [load]);

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">لوحة الإدارة</p>
          <h1>الوظائف الفاشلة والأتمتة</h1>
          <p>
            وظائف الأتمتة الفاشلة عبر كل المؤسسات مع أسباب الفشل المكتوبة وعدد
            المحاولات؛ بدون أي حمولات خام أو مفاتيح تنفيذ.
          </p>
        </div>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => void load(null, false)}
        >
          تحديث
        </button>
      </header>
      <section className="panel" aria-labelledby="jobs-filters-title">
        <h2 id="jobs-filters-title">تصفية</h2>
        <div className={styles.filters}>
          <label>
            معرّف المؤسسة (اختياري)
            <input
              type="text"
              value={organizationId}
              placeholder="اتركه فارغاً لكل المؤسسات"
              onChange={(event) => setOrganizationId(event.target.value)}
            />
          </label>
          <button
            className="button button-primary"
            type="button"
            disabled={loading}
            onClick={() => void load(null, false)}
          >
            تطبيق التصفية
          </button>
        </div>
      </section>
      {loading && <p role="status">جارٍ تحميل الوظائف…</p>}
      {error && (
        <div className="state-card" role="alert">
          <strong>تعذر تحميل الوظائف الفاشلة</strong>
          <p>تحقق من قيم التصفية ثم حاول مرة أخرى.</p>
        </div>
      )}
      {!loading && !error && (
        <section aria-labelledby="failed-jobs-title" className="panel">
          <div className={styles.sectionHeading}>
            <h2 id="failed-jobs-title">وظائف فاشلة</h2>
            <span className="table-count">{items.length} وظيفة</span>
          </div>
          {items.length === 0 ? (
            <p>لا توجد وظائف فاشلة مطابقة.</p>
          ) : (
            <ul className={styles.list}>
              {items.map((job) => (
                <li key={job.id}>
                  <div>
                    <strong>{job.actionType}</strong>
                    <span>
                      النوع: {job.targetType} · المؤسسة:{" "}
                      {shortId(job.organizationId)}
                    </span>
                    <span className={styles.stateBad}>
                      المحاولة {job.attemptCount}/{job.maxAttempts} ·{" "}
                      {formatDate(job.completedAt ?? job.updatedAt)}
                    </span>
                    {job.lastError && (
                      <span className={styles.stateBad}>
                        سبب الفشل:{" "}
                        {labelFrom(FAILURE_KIND_LABELS, job.lastError.kind)} ·{" "}
                        {job.lastError.message}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {page?.nextCursor && (
            <div className="button-row">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  void load(page.nextCursor, true);
                }}
              >
                تحميل الأحدث
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function shortId(value: string): string {
  return value.length > 12 ? `…${value.slice(-8)}` : value;
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
