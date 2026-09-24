"use client";

import { useCallback, useEffect, useState } from "react";
import { createApiClient } from "../../lib/api-client/index";
import { formatDate, labelFromKey, useT, type MessageKey } from "../../i18n";
import { useOrganizationContext } from "../organization-context/organization-context";
import {
  AGING_BUCKET_LABELS,
  AGING_STATUS_LABELS,
  agingErrorKey,
  appendAgingItems,
  type ReceivableAgingItem,
  type ReceivableAgingResponse,
} from "./receivable-aging-model";
import styles from "./receivable-reconciliation-workspace.module.css";

const apiClient = createApiClient();

export function ReceivableAgingPanel() {
  const { organizationId } = useOrganizationContext();
  const t = useT();
  const [response, setResponse] = useState<ReceivableAgingResponse | null>(
    null,
  );
  const [rows, setRows] = useState<ReceivableAgingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

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
        setError(agingErrorKey(loadError).key);
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
        <p className="eyebrow">{t("finance.aging.serverRead")}</p>
        <h2 id="aging-title">{t("finance.aging.title")}</h2>
        <p>{t("finance.aging.subtitle")}</p>
      </div>
      <div className={styles.actions}>
        <button
          className="button button-secondary"
          type="button"
          onClick={refresh}
          disabled={loading || loadingMore}
        >
          {t("finance.aging.refresh")}
        </button>
        {response?.asOf && (
          <p className={styles.technical}>
            {t("finance.aging.asOfPrefix")}{" "}
            <b dir="ltr">{formatDate(response.asOf)}</b>
          </p>
        )}
      </div>
      {loading && rows.length === 0 && (
        <p className={styles.state}>{t("finance.aging.loading")}</p>
      )}
      {error && (
        <div className={`${styles.state} ${styles.error}`} role="alert">
          <span>{t(error)}</span>
          <button
            className="button button-secondary"
            type="button"
            onClick={refresh}
          >
            {t("finance.aging.retry")}
          </button>
        </div>
      )}
      {!loading && !error && rows.length === 0 && (
        <p className={styles.state}>{t("finance.aging.empty")}</p>
      )}
      {rows.length > 0 && <AgingTable rows={rows} />}
      {response?.nextCursor && (
        <button
          className="button button-secondary"
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
        >
          {loadingMore
            ? t("finance.aging.loadingMore")
            : t("finance.aging.loadMore")}
        </button>
      )}
    </section>
  );
}

function AgingTable({
  rows,
}: Readonly<{ rows: readonly ReceivableAgingItem[] }>) {
  const t = useT();
  return (
    <div className={styles.tableWrap}>
      <table>
        <caption>{t("finance.aging.caption")}</caption>
        <thead>
          <tr>
            <th>{t("finance.aging.thInvoice")}</th>
            <th>{t("finance.aging.thOutstanding")}</th>
            <th>{t("finance.aging.thStatus")}</th>
            <th>{t("finance.aging.thBucket")}</th>
            <th>{t("finance.aging.thDue")}</th>
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
              <td>
                {labelFromKey(AGING_STATUS_LABELS, t, row.status, row.status)}
              </td>
              <td>
                {labelFromKey(AGING_BUCKET_LABELS, t, row.bucket, row.bucket)}
                <small dir="ltr">
                  {t("finance.aging.daysPastDue", { days: row.daysPastDue })}
                </small>
              </td>
              <td>
                <span dir="ltr">{formatDate(row.dueAt)}</span>
                <small dir="ltr">
                  {t("finance.aging.issuedPrefix")} {formatDate(row.issuedAt)}
                </small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
