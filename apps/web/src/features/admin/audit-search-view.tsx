"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAuditEvents } from "./admin-api";
import {
  ADMIN_AUDIT_ACTIONS,
  type AdminAuditAction,
  type AdminAuditEvent,
  type AdminAuditPage,
} from "./admin-contract";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_TARGET_LABELS,
  labelFrom,
} from "./admin-labels";
import styles from "./admin.module.css";

/**
 * EF-620 — bounded, filterable audit search over privileged admin actions.
 * Keyset pagination only («تحميل الأحدث» walks the cursor); every row shows
 * action/target identity and the recorded decision reason — no payloads.
 */
export function AuditSearchView() {
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
          <p className="eyebrow">لوحة الإدارة</p>
          <h1>البحث في سجل الإدارة</h1>
          <p>
            كل إجراءات الإدارة المميزة مسجّلة بشكل غير قابل للتعديل: الإجراء،
            الهدف، والسبب المعتمد. لا توجد حمولات خام ولا بيانات سرية.
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
      <section className="panel" aria-labelledby="audit-filters-title">
        <h2 id="audit-filters-title">تصفية</h2>
        <div className={styles.filters}>
          <label>
            الإجراء
            <select
              value={action}
              onChange={(event) =>
                setAction(event.target.value as AdminAuditAction | "")
              }
            >
              <option value="">كل الإجراءات</option>
              {ADMIN_AUDIT_ACTIONS.map((value) => (
                <option key={value} value={value}>
                  {AUDIT_ACTION_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
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
      {loading && <p role="status">جارٍ البحث…</p>}
      {error && (
        <div className="state-card" role="alert">
          <strong>تعذر البحث في السجل</strong>
          <p>تحقق من قيم التصفية ثم حاول مرة أخرى.</p>
        </div>
      )}
      {!loading && !error && (
        <section aria-labelledby="audit-results-title" className="panel">
          <div className={styles.sectionHeading}>
            <h2 id="audit-results-title">النتائج</h2>
            <span className="table-count">{items.length} حدث</span>
          </div>
          {items.length === 0 ? (
            <p>لا توجد أحداث مطابقة.</p>
          ) : (
            <ul className={styles.list}>
              {items.map((event) => (
                <li key={event.id}>
                  <div>
                    <strong>
                      {labelFrom(AUDIT_ACTION_LABELS, event.action)}
                    </strong>
                    <span>
                      النوع: {labelFrom(AUDIT_TARGET_LABELS, event.targetType)}
                    </span>
                    <span>المؤسسة: {shortId(event.organizationId)}</span>
                    <span>المنفّذ: {shortId(event.actorId)}</span>
                    <span>الهدف: {shortId(event.targetId)}</span>
                    {event.reason && <span>السبب: {event.reason}</span>}
                    <time>{formatDate(event.createdAt)}</time>
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
