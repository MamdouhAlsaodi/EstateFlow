"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "../../i18n";
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

/** EF-404 — publishing operations: upcoming deliveries and outcomes. */
export function ContentPublishingView() {
  const t = useT();
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
      setError(t("content.publishing.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function cancel(itemId: string): Promise<void> {
    const reason = window.prompt(
      t("content.publishing.cancelPrompt"),
      t("content.publishing.cancelDefaultReason"),
    );
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
      setNotice(t("content.publishing.cancelledNotice"));
      await refresh();
    } catch {
      setError(t("content.publishing.cancelFailed"));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="workspace-stack">
      <section aria-labelledby="publishing-title">
        <p className="eyebrow">{t("content.publishing.eyebrow")}</p>
        <h1 id="publishing-title">{t("content.publishing.title")}</h1>
        <p>{t("content.publishing.subtitle")}</p>
        <nav
          className={styles.publishingTabs}
          aria-label={t("content.publishing.tabsAria")}
        >
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
            {t("content.publishing.tabScheduled")}
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
            {t("content.publishing.tabResults")}
          </button>
          <Link
            className="button button-secondary"
            href={`/ar/organizations/${organizationId}/content`}
          >
            {t("content.publishing.backToContent")}
          </Link>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => void refresh()}
            disabled={loading || pendingId !== null}
          >
            {loading
              ? t("content.common.loading")
              : t("content.publishing.refresh")}
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
  const t = useT();
  return (
    <section className={styles.panel} aria-labelledby="scheduled-title">
      <h2 id="scheduled-title">{t("content.publishing.scheduledTitle")}</h2>
      {response === null ? (
        <p>{t("content.publishing.loadingScheduled")}</p>
      ) : response.items.length === 0 ? (
        <p>{t("content.publishing.noScheduled")}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>{t("content.publishing.thContent")}</th>
                <th>{t("content.publishing.thChannel")}</th>
                <th>{t("content.publishing.thScheduledFor")}</th>
                <th>{t("content.publishing.thAttempt")}</th>
                <th>{t("content.publishing.thAction")}</th>
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
                      {t("content.common.approvedVersion", {
                        version: item.approvedVersion,
                      })}
                    </small>
                  </td>
                  <td>{t(contentChannelLabels[item.channel])}</td>
                  <td dir="ltr">{item.scheduledFor.replace("T", " ")}</td>
                  <td>
                    {item.attemptCount} / {item.maxAttempts}
                    {item.lastErrorKind && (
                      <small className={styles.failureNote}>
                        <br />
                        {t(contentFailureKindLabels[item.lastErrorKind])}
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
                        ? t("content.publishing.cancelling")
                        : t("content.publishing.cancelButton")}
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
  const t = useT();
  return (
    <section className={styles.panel} aria-labelledby="results-title">
      <h2 id="results-title">{t("content.publishing.tabResults")}</h2>
      {response === null ? (
        <p>{t("content.publishing.loadingResults")}</p>
      ) : response.items.length === 0 ? (
        <p>{t("content.publishing.noResults")}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>{t("content.publishing.thContent")}</th>
                <th>{t("content.publishing.thChannel")}</th>
                <th>{t("content.publishing.thOutcome")}</th>
                <th>{t("content.publishing.thFailure")}</th>
                <th>{t("content.publishing.thCompletedAt")}</th>
              </tr>
            </thead>
            <tbody>
              {response.items.map((item) => (
                <tr key={`${item.contentItemId}-${item.completedAt}`}>
                  <td>{item.title}</td>
                  <td>{t(contentChannelLabels[item.channel])}</td>
                  <td>
                    {item.outcome === "DELIVERED"
                      ? t("content.publishing.outcomeDelivered")
                      : item.outcome === "CANCELLED"
                        ? t("content.publishing.outcomeCancelled")
                        : t("content.publishing.outcomeFailed")}
                  </td>
                  <td>
                    {item.failureKind
                      ? t(contentFailureKindLabels[item.failureKind])
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
