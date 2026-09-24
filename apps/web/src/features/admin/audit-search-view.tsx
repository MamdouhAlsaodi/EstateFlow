"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAuditEvents } from "./admin-api";
import { formatDateTime, labelFromKey, useT } from "../../i18n";
import {
  ADMIN_AUDIT_ACTIONS,
  type AdminAuditAction,
  type AdminAuditEvent,
  type AdminAuditPage,
} from "./admin-contract";
import { AUDIT_ACTION_LABELS, AUDIT_TARGET_LABELS } from "./admin-labels";
import styles from "./admin.module.css";

/**
 * EF-620 — bounded, filterable audit search over privileged admin actions.
 * Keyset pagination only («تحميل الأحدث» walks the cursor); every row shows
 * action/target identity and the recorded decision reason — no payloads.
 */
export function AuditSearchView() {
  const t = useT();
  const [page, setPage] = useState<AdminAuditPage | null>(null);
  const [items, setItems] = useState<readonly AdminAuditEvent[]>([]);
  const [action, setAction] = useState<AdminAuditAction | "">("");
  const [organizationId, setOrganizationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(
    async (nextCursor: string | null, append: boolean) => {
      setLoading(true);
      setError(false);
      try {
        const result = await fetchAuditEvents({
          cursor: nextCursor,
          limit: 25,
          action: action === "" ? undefined : action,
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
    [action, organizationId],
  );

  useEffect(() => {
    void load(null, false);
  }, [load]);

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">{t("admin.common.eyebrow")}</p>
          <h1>{t("admin.audit.title")}</h1>
          <p>{t("admin.audit.subtitle")}</p>
        </div>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => void load(null, false)}
        >
          {t("admin.common.refresh")}
        </button>
      </header>
      <section className="panel" aria-labelledby="audit-filters-title">
        <h2 id="audit-filters-title">{t("admin.common.filters")}</h2>
        <div className={styles.filters}>
          <label>
            {t("admin.audit.actionLabel")}
            <select
              value={action}
              onChange={(event) =>
                setAction(event.target.value as AdminAuditAction | "")
              }
            >
              <option value="">{t("admin.audit.allActions")}</option>
              {ADMIN_AUDIT_ACTIONS.map((value) => (
                <option key={value} value={value}>
                  {t(AUDIT_ACTION_LABELS[value])}
                </option>
              ))}
            </select>
          </label>
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
      {loading && <p role="status">{t("admin.audit.searching")}</p>}
      {error && (
        <div className="state-card" role="alert">
          <strong>{t("admin.audit.loadFailed")}</strong>
          <p>{t("admin.audit.loadFailedHint")}</p>
        </div>
      )}
      {!loading && !error && (
        <section aria-labelledby="audit-results-title" className="panel">
          <div className={styles.sectionHeading}>
            <h2 id="audit-results-title">{t("admin.audit.results")}</h2>
            <span className="table-count">
              {t("admin.audit.eventCount", { count: items.length })}
            </span>
          </div>
          {items.length === 0 ? (
            <p>{t("admin.audit.empty")}</p>
          ) : (
            <ul className={styles.list}>
              {items.map((event) => (
                <li key={event.id}>
                  <div>
                    <strong>
                      {labelFromKey(
                        AUDIT_ACTION_LABELS,
                        t,
                        event.action,
                        event.action,
                      )}
                    </strong>
                    <span>
                      {t("admin.audit.targetTypePrefix")}{" "}
                      {labelFromKey(
                        AUDIT_TARGET_LABELS,
                        t,
                        event.targetType,
                        event.targetType,
                      )}
                    </span>
                    <span>
                      {t("admin.audit.orgPrefix")}{" "}
                      {shortId(event.organizationId)}
                    </span>
                    <span>
                      {t("admin.audit.actorPrefix")} {shortId(event.actorId)}
                    </span>
                    <span>
                      {t("admin.audit.targetPrefix")} {shortId(event.targetId)}
                    </span>
                    {event.reason && (
                      <span>
                        {t("admin.audit.reasonPrefix")} {event.reason}
                      </span>
                    )}
                    <time>
                      {formatDate(
                        event.createdAt,
                        t("admin.common.timeUnavailable"),
                      )}
                    </time>
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
