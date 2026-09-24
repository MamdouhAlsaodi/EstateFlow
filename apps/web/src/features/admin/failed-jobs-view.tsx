"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchFailedJobs } from "./admin-api";
import type { AdminFailedJob, AdminFailedJobsPage } from "./admin-contract";
import { formatDateTime, labelFromKey, useT } from "../../i18n";
import { FAILURE_KIND_LABELS } from "./admin-labels";
import styles from "./admin.module.css";

/**
 * EF-620 — cross-tenant failed automation jobs review (EF-302/EF-306 data).
 * Typed states, attempt bookkeeping, and typed failure reasons only — never
 * an execution key, event payload, or provider body. Optional organization
 * filter and keyset «تحميل الأحدث» pagination keep every query bounded.
 */
export function FailedJobsView() {
  const t = useT();
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
          <p className="eyebrow">{t("admin.common.eyebrow")}</p>
          <h1>{t("admin.jobs.title")}</h1>
          <p>{t("admin.jobs.subtitle")}</p>
        </div>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => void load(null, false)}
        >
          {t("admin.common.refresh")}
        </button>
      </header>
      <section className="panel" aria-labelledby="jobs-filters-title">
        <h2 id="jobs-filters-title">{t("admin.common.filters")}</h2>
        <div className={styles.filters}>
          <label>
            {t("admin.common.organizationIdLabel")}
            <input
              type="text"
              value={organizationId}
              placeholder={t("admin.common.organizationIdPlaceholder")}
              onChange={(event) => setOrganizationId(event.target.value)}
            />
          </label>
          <button
            className="button button-primary"
            type="button"
            disabled={loading}
            onClick={() => void load(null, false)}
          >
            {t("admin.common.applyFilters")}
          </button>
        </div>
      </section>
      {loading && <p role="status">{t("admin.jobs.loading")}</p>}
      {error && (
        <div className="state-card" role="alert">
          <strong>{t("admin.jobs.loadFailed")}</strong>
          <p>{t("admin.jobs.loadFailedHint")}</p>
        </div>
      )}
      {!loading && !error && (
        <section aria-labelledby="failed-jobs-title" className="panel">
          <div className={styles.sectionHeading}>
            <h2 id="failed-jobs-title">{t("admin.jobs.listTitle")}</h2>
            <span className="table-count">
              {t("admin.jobs.jobCount", { count: items.length })}
            </span>
          </div>
          {items.length === 0 ? (
            <p>{t("admin.jobs.empty")}</p>
          ) : (
            <ul className={styles.list}>
              {items.map((job) => (
                <li key={job.id}>
                  <div>
                    <strong>{job.actionType}</strong>
                    <span>
                      {t("admin.jobs.typePrefix")} {job.targetType} ·{" "}
                      {t("admin.jobs.orgPrefix")} {shortId(job.organizationId)}
                    </span>
                    <span className={styles.stateBad}>
                      {t("admin.jobs.attempt", {
                        attempt: job.attemptCount,
                        max: job.maxAttempts,
                      })}{" "}
                      ·{" "}
                      {formatDate(
                        job.completedAt ?? job.updatedAt,
                        t("admin.common.timeUnavailable"),
                      )}
                    </span>
                    {job.lastError && (
                      <span className={styles.stateBad}>
                        {t("admin.jobs.failureReasonPrefix")}{" "}
                        {labelFromKey(
                          FAILURE_KIND_LABELS,
                          t,
                          job.lastError.kind,
                          job.lastError.kind,
                        )}{" "}
                        · {job.lastError.message}
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
                {t("admin.common.loadNewer")}
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

function formatDate(value: string, fallback: string): string {
  try {
    return formatDateTime(value);
  } catch {
    return fallback;
  }
}
