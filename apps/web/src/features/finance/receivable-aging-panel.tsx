"use client";

import { useCallback, useEffect, useState } from "react";
import { createApiClient } from "../../lib/api-client/index";
import { useOrganizationContext } from "../organization-context/organization-context";
import {
  AGING_BUCKET_LABELS,
  AGING_STATUS_LABELS,
  appendAgingItems,
  presentAgingError,
  type ReceivableAgingItem,
  type ReceivableAgingResponse,
} from "./receivable-aging-model";
import styles from "./receivable-reconciliation-workspace.module.css";

const apiClient = createApiClient();

export function ReceivableAgingPanel() {
  const { organizationId } = useOrganizationContext();
  const [response, setResponse] = useState<ReceivableAgingResponse | null>(
    null,
  );
  const [rows, setRows] = useState<ReceivableAgingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (cursor?: string, append = false): Promise<void> => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const next = await apiClient.getReceivableAging({
          organizationId,
          ...(cursor ? { cursor } : {}),
          limit: 50,
        });
        setRows((current) =>
          append ? appendAgingItems(current, next.items) : [...next.items],
        );
        setResponse(next);
      } catch (loadError) {
        setError(presentAgingError(loadError));
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [organizationId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function refresh(): void {
    void load();
  }
  function loadMore(): void {
    if (response?.nextCursor && !loadingMore)
      void load(response.nextCursor, true);
  }

  return (
    <section className={styles.panel} aria-labelledby="aging-title">
      <div className={styles.panelHeading}>
        <p className="eyebrow">قراءة من الخادم</p>
        <h2 id="aging-title">أعمار المستحقات</h2>
        <p>لا تُحذف الصفوف أو تتغير ماليًا قبل نجاح استجابة الخادم.</p>
      </div>
      <div className={styles.actions}>
        <button
          className="button button-secondary"
          type="button"
          onClick={refresh}
          disabled={loading || loadingMore}
        >
          تحديث صريح
        </button>
        {response?.asOf && (
          <p className={styles.technical}>
            حتى <b dir="ltr">{response.asOf}</b>
          </p>
        )}
      </div>
      {loading && rows.length === 0 && (
        <p className={styles.state}>جارٍ تحميل المستحقات…</p>
      )}
      {error && (
        <div className={`${styles.state} ${styles.error}`} role="alert">
          <span>{error}</span>
          <button
            className="button button-secondary"
            type="button"
            onClick={refresh}
          >
            إعادة المحاولة
          </button>
        </div>
      )}
      {!loading && !error && rows.length === 0 && (
        <p className={styles.state}>لا توجد مستحقات مفتوحة حاليًا.</p>
      )}
      {rows.length > 0 && <AgingTable rows={rows} />}
      {response?.nextCursor && (
        <button
          className="button button-secondary"
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
        >
          {loadingMore ? "جارٍ تحميل الصفحة التالية…" : "تحميل المزيد"}
        </button>
      )}
    </section>
  );
}

function AgingTable({
  rows,
}: Readonly<{ rows: readonly ReceivableAgingItem[] }>) {
  return (
    <div className={styles.tableWrap}>
      <table>
        <caption>المستحقات مرتبة حسب أقرب موعد استحقاق</caption>
        <thead>
          <tr>
            <th>الفاتورة</th>
            <th>المبلغ المتبقي</th>
            <th>الحالة</th>
            <th>الفئة</th>
            <th>الاستحقاق</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.receivableId}>
              <td>
                <span dir="ltr" className={styles.technical}>
                  {row.invoiceId}
                </span>
                <small dir="ltr">{row.receivableId}</small>
              </td>
              <td>
                <b dir="ltr" className={styles.money}>
                  {row.outstandingMinor}
                </b>{" "}
                <span dir="ltr">{row.currency}</span>
              </td>
              <td>{AGING_STATUS_LABELS[row.status]}</td>
              <td>
                {AGING_BUCKET_LABELS[row.bucket]}
                <small dir="ltr">{row.daysPastDue} days</small>
              </td>
              <td>
                <span dir="ltr">{row.dueAt}</span>
                <small dir="ltr">issued {row.issuedAt}</small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
