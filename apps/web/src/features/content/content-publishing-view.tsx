"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useOrganizationContext } from "../organization-context/organization-context";
import {
  cancelScheduledPublishing,
  fetchPublishResults,
  fetchScheduledDeliveries,
} from "./content-api";
import type {
  PublishResultsResponse,
  ScheduledDeliveriesResponse,
} from "./content-contract";
import {
  contentChannelLabels,
  contentFailureKindLabels,
} from "./content-labels";
import styles from "./content-views.module.css";

type PublishingTab = "scheduled" | "results";

/** EF-404 — Arabic publishing operations: upcoming deliveries and outcomes. */
export function ContentPublishingView() {
  const { organizationId } = useOrganizationContext();
  const [tab, setTab] = useState<PublishingTab>("scheduled");
  const [scheduled, setScheduled] =
    useState<ScheduledDeliveriesResponse | null>(null);
  const [results, setResults] = useState<PublishResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextScheduled, nextResults] = await Promise.all([
        fetchScheduledDeliveries({ organizationId }),
        fetchPublishResults({ organizationId }),
      ]);
      setScheduled(nextScheduled);
      setResults(nextResults);
    } catch {
      setError("تعذر تحميل حالة النشر. حاول مرة أخرى.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function cancel(itemId: string): Promise<void> {
    const reason = window.prompt("سبب الإلغاء قبل النشر:", "تغيير خطة الحملة");
    if (reason === null || reason.trim().length === 0) return;
    setPendingId(itemId);
    setError(null);
    setNotice(null);
    try {
      await cancelScheduledPublishing({
        organizationId,
        contentItemId: itemId,
        reason,
      });
      setNotice("تم إلغاء التسليم قبل موعده وتوثيق السبب.");
      await refresh();
    } catch {
      setError("تعذر إلغاء التسليم؛ قد يكون قد بدأ أو اكتمل بالفعل.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="workspace-stack">
      <section aria-labelledby="publishing-title">
        <p className="eyebrow">EF-404 — تشغيل النشر</p>
        <h1 id="publishing-title">تسليمات النشر ونتائجها</h1>
        <p>
          هذه شاشة تشغيل داخلية للتسليمات المجدولة. القنوات الحالية تجريبية
          deterministic فقط؛ لا توجد حسابات خارجية أو أسرار أو نشر حقيقي.
        </p>
        <nav className={styles.publishingTabs} aria-label="تبويبات النشر">
          <button
            type="button"
            className={
              tab === "scheduled"
                ? "button button-primary"
                : "button button-secondary"
            }
            aria-selected={tab === "scheduled"}
            onClick={() => setTab("scheduled")}
          >
            التسليمات المجدولة
          </button>
          <button
            type="button"
            className={
              tab === "results"
                ? "button button-primary"
                : "button button-secondary"
            }
            aria-selected={tab === "results"}
            onClick={() => setTab("results")}
          >
            نتائج النشر
          </button>
          <Link
            className="button button-secondary"
            href={`/ar/organizations/${organizationId}/content`}
          >
            العودة إلى المحتوى
          </Link>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => void refresh()}
            disabled={loading || pendingId !== null}
          >
            {loading ? "جارٍ التحميل…" : "تحديث"}
          </button>
        </nav>
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p role="alert" style={{ color: "#b3423a" }}>
            {error}
          </p>
        )}
      </section>

      {tab === "scheduled" ? (
        <ScheduledPanel
          organizationId={organizationId}
          response={scheduled}
          pendingId={pendingId}
          onCancel={(itemId) => void cancel(itemId)}
        />
      ) : (
        <ResultsPanel response={results} />
      )}
    </div>
  );
}

function ScheduledPanel({
  organizationId,
  response,
  pendingId,
  onCancel,
}: {
  organizationId: string;
  response: ScheduledDeliveriesResponse | null;
  pendingId: string | null;
  onCancel: (itemId: string) => void;
}) {
  return (
    <section className={styles.panel} aria-labelledby="scheduled-title">
      <h2 id="scheduled-title">التسليمات القادمة</h2>
      {response === null ? (
        <p>جارٍ تحميل التسليمات…</p>
      ) : response.items.length === 0 ? (
        <p>لا توجد تسليمات مفتوحة حاليًا.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>المحتوى</th>
                <th>القناة</th>
                <th>الموعد UTC</th>
                <th>المحاولة</th>
                <th>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {response.items.map((item) => (
                <tr key={item.publishJobId}>
                  <td>
                    <Link
                      href={`/ar/organizations/${organizationId}/content/${item.contentItemId}`}
                    >
                      {item.title}
                    </Link>
                    <small>
                      <br />
                      النسخة المعتمدة v{item.approvedVersion}
                    </small>
                  </td>
                  <td>{contentChannelLabels[item.channel]}</td>
                  <td dir="ltr">{item.scheduledFor.replace("T", " ")}</td>
                  <td>
                    {item.attemptCount} / {item.maxAttempts}
                    {item.lastErrorKind && (
                      <small className={styles.failureNote}>
                        <br />
                        {contentFailureKindLabels[item.lastErrorKind]}
                        {item.lastErrorMessage
                          ? `: ${item.lastErrorMessage}`
                          : ""}
                      </small>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={pendingId !== null}
                      onClick={() => onCancel(item.contentItemId)}
                    >
                      {pendingId === item.contentItemId
                        ? "جارٍ الإلغاء…"
                        : "إلغاء قبل النشر"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ResultsPanel({
  response,
}: {
  response: PublishResultsResponse | null;
}) {
  return (
    <section className={styles.panel} aria-labelledby="results-title">
      <h2 id="results-title">نتائج النشر</h2>
      {response === null ? (
        <p>جارٍ تحميل النتائج…</p>
      ) : response.items.length === 0 ? (
        <p>لم تُسجل نتائج نشر بعد.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>المحتوى</th>
                <th>القناة</th>
                <th>النتيجة</th>
                <th>سبب الفشل المطبّع</th>
                <th>وقت الاكتمال UTC</th>
              </tr>
            </thead>
            <tbody>
              {response.items.map((item) => (
                <tr key={`${item.contentItemId}-${item.completedAt}`}>
                  <td>{item.title}</td>
                  <td>{contentChannelLabels[item.channel]}</td>
                  <td>
                    {item.outcome === "DELIVERED"
                      ? "تم التسليم"
                      : item.outcome === "CANCELLED"
                        ? "أُلغي"
                        : "فشل"}
                  </td>
                  <td>
                    {item.failureKind
                      ? contentFailureKindLabels[item.failureKind]
                      : "—"}
                    {item.reason && (
                      <small className={styles.failureNote}>
                        <br />
                        {item.reason}
                      </small>
                    )}
                  </td>
                  <td dir="ltr">{item.completedAt.replace("T", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
