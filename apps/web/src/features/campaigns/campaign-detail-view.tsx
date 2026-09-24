"use client";

import { useCallback, useState } from "react";
import { labelFromKey, useT } from "../../i18n";
import { useOrganizationContext } from "../organization-context/organization-context";
import type {
  CampaignAnalyticsResponse,
  CampaignDetailResponse,
  LeadAttribution,
  PerformanceEntry,
} from "./campaign-contract";
import {
  attributionModelLabels,
  campaignChannelLabels,
  campaignStatusLabels,
  touchChannelLabels,
} from "./campaign-labels";
import {
  correctCampaignBudget,
  fetchCampaignAnalytics,
  correctLeadAttribution,
  fetchCampaignDetail,
  fetchCampaignPerformanceEntries,
  fetchLeadAttribution,
  transitionCampaign,
} from "./campaign-api";
import { BudgetProgressBar } from "./budget-progress";
import { StatusChip } from "./campaigns-list-view";
import styles from "./campaign-views.module.css";

/**
 * EF-401 — campaign detail: budget progress, audited lifecycle timeline,
 * append-only budget corrections, manual performance entries, and the
 * first/last-touch attribution view with a lead lookup.
 */
export function CampaignDetailView({
  campaignId,
}: Readonly<{ campaignId: string }>) {
  const t = useT();
  const { organizationId } = useOrganizationContext();
  const [detail, setDetail] = useState<CampaignDetailResponse | null>(null);
  const [analytics, setAnalytics] = useState<CampaignAnalyticsResponse | null>(
    null,
  );
  const [entries, setEntries] = useState<readonly PerformanceEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [correctedMinor, setCorrectedMinor] = useState("");
  const [leadLookup, setLeadLookup] = useState("");
  const [attribution, setAttribution] = useState<LeadAttribution | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detailPage, entryPage, analyticsPage] = await Promise.all([
        fetchCampaignDetail({ organizationId, campaignId }),
        fetchCampaignPerformanceEntries({ organizationId, campaignId }),
        fetchCampaignAnalytics({ organizationId, campaignId }),
      ]);
      setDetail(detailPage);
      setEntries(entryPage.items);
      setAnalytics(analyticsPage);
    } catch {
      setError(t("campaigns.detail.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [organizationId, campaignId]);

  async function act(operation: () => Promise<unknown>): Promise<void> {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await operation();
      await refresh();
    } catch {
      setError(t("campaigns.detail.actionFailed"));
    } finally {
      setPending(false);
    }
  }

  async function lookupAttribution(): Promise<void> {
    setAttribution(null);
    setError(null);
    try {
      const result = await fetchLeadAttribution({
        organizationId,
        leadId: leadLookup.trim(),
      });
      setAttribution(result.attribution);
    } catch {
      setError(t("campaigns.detail.attributionLookupFailed"));
    }
  }

  const campaign = detail?.campaign;
  const actualForCurrency = (currency: string) =>
    detail?.actualByCurrency.find((row) => row.currency === currency)
      ?.amountMinor;

  return (
    <div className="workspace-stack">
      <section aria-labelledby="campaign-detail-title">
        <p className="eyebrow">{t("campaigns.detail.eyebrow")}</p>
        <h1 id="campaign-detail-title">
          {campaign ? campaign.name : t("campaigns.detail.fallbackTitle")}
        </h1>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => void refresh()}
            disabled={loading || pending}
          >
            {loading
              ? t("campaigns.detail.loading")
              : t("campaigns.detail.refresh")}
          </button>
        </div>
        {error && (
          <div role="alert" style={{ color: "#b3423a", marginTop: "0.75rem" }}>
            <span>{error}</span>
          </div>
        )}
      </section>

      {!campaign ? (
        <p>{t("campaigns.detail.pressRefresh")}</p>
      ) : (
        <div className={styles.grid}>
          <section className={styles.panel} aria-labelledby="budget-title">
            <h2 id="budget-title">{t("campaigns.detail.budgetTitle")}</h2>
            <p>
              <StatusChip status={campaign.status} />{" "}
              <span>
                {labelFromKey(
                  campaignChannelLabels,
                  t,
                  campaign.channel,
                  campaign.channel,
                )}{" "}
                — {campaign.objective}
              </span>
            </p>
            <BudgetProgressBar
              plannedMinor={campaign.budgetPlannedMinor}
              actualMinor={actualForCurrency(campaign.currency)}
              currency={campaign.currency}
            />
            {detail && detail.actualByCurrency.length > 0 && (
              <div className={styles.tableWrap}>
                <table>
                  <caption>
                    {t("campaigns.detail.spendByCurrencyCaption")}
                  </caption>
                  <thead>
                    <tr>
                      <th>{t("campaigns.detail.thCurrency")}</th>
                      <th>{t("campaigns.detail.thExpenseCount")}</th>
                      <th>{t("campaigns.detail.thTotal")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.actualByCurrency.map((row) => (
                      <tr key={row.currency}>
                        <td dir="ltr">{row.currency}</td>
                        <td>{row.count}</td>
                        <td dir="ltr">{row.amountMinor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {campaign.status !== "CANCELLED" && (
              <div className={styles.formGrid}>
                <label>
                  {t("campaigns.detail.correctedBudgetLabel")}
                  <input
                    value={correctedMinor}
                    onChange={(event) => setCorrectedMinor(event.target.value)}
                    dir="ltr"
                  />
                </label>
                <label>
                  {t("campaigns.detail.reasonLabel")}
                  <input
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
              </div>
            )}
            {campaign.status !== "CANCELLED" && (
              <button
                className="button button-primary"
                type="button"
                disabled={pending}
                onClick={() =>
                  void act(() =>
                    correctCampaignBudget({
                      organizationId,
                      campaignId,
                      correctedMinor,
                      reason,
                    }),
                  )
                }
              >
                {t("campaigns.detail.correctBudget")}
              </button>
            )}
          </section>

          <section className={styles.panel} aria-labelledby="analytics-title">
            <h2 id="analytics-title">{t("campaigns.detail.analyticsTitle")}</h2>
            {analytics && (
              <>
                <BudgetProgressBar
                  plannedMinor={
                    analytics.analytics.plannedBudget[0]?.amountMinor ??
                    campaign.budgetPlannedMinor
                  }
                  actualMinor={
                    analytics.analytics.approvedSpend.find(
                      (row) => row.currency === campaign.currency,
                    )?.amountMinor
                  }
                  currency={campaign.currency}
                />
                <div className={styles.analyticsGrid}>
                  <div>
                    <strong>{t("campaigns.detail.touches")}</strong>
                    <p>{analytics.analytics.touchCount}</p>
                  </div>
                  <div>
                    <strong>{t("campaigns.detail.firstTouch")}</strong>
                    <p>
                      {t("campaigns.detail.leadsPerQualified", {
                        leads:
                          analytics.analytics.attribution.firstTouchLeadCount,
                        qualified:
                          analytics.analytics.attribution
                            .firstTouchQualifiedLeadCount,
                      })}
                    </p>
                  </div>
                  <div>
                    <strong>{t("campaigns.detail.lastTouch")}</strong>
                    <p>
                      {t("campaigns.detail.leadsPerQualified", {
                        leads:
                          analytics.analytics.attribution.lastTouchLeadCount,
                        qualified:
                          analytics.analytics.attribution
                            .lastTouchQualifiedLeadCount,
                      })}
                    </p>
                  </div>
                  <div>
                    <strong>{t("campaigns.detail.attributedWins")}</strong>
                    <p>
                      {analytics.analytics.attribution.firstTouchWinCount} /{" "}
                      {analytics.analytics.attribution.lastTouchWinCount}
                    </p>
                  </div>
                </div>
                <ul className={styles.analyticsChannels}>
                  {analytics.analytics.publishedContent.map((item) => (
                    <li key={item.channel}>
                      {t("campaigns.detail.publishedByChannel", {
                        channel: item.channel,
                      })}{" "}
                      <strong>{item.count}</strong>
                    </li>
                  ))}
                </ul>
                <p className={styles.muted}>
                  {t("campaigns.detail.dataUpdatedPrefix")}{" "}
                  <span dir="ltr">{analytics.asOf}</span>
                </p>
              </>
            )}
          </section>

          <section className={styles.panel} aria-labelledby="lifecycle-title">
            <h2 id="lifecycle-title">{t("campaigns.detail.lifecycleTitle")}</h2>
            <p>
              {t("campaigns.detail.currentStatusPrefix")}{" "}
              <strong>
                {labelFromKey(
                  campaignStatusLabels,
                  t,
                  campaign.status,
                  campaign.status,
                )}
              </strong>
            </p>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {campaign.status === "DRAFT" && (
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    void act(() =>
                      transitionCampaign({
                        organizationId,
                        campaignId,
                        toStatus: "ACTIVE",
                      }),
                    )
                  }
                >
                  {t("campaigns.detail.activate")}
                </button>
              )}
              {campaign.status === "ACTIVE" && (
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    void act(() =>
                      transitionCampaign({
                        organizationId,
                        campaignId,
                        toStatus: "COMPLETED",
                      }),
                    )
                  }
                >
                  {t("campaigns.detail.complete")}
                </button>
              )}
              {(campaign.status === "DRAFT" ||
                campaign.status === "ACTIVE") && (
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={pending || reason.trim().length === 0}
                  title={t("campaigns.detail.cancelRequiresReason")}
                  onClick={() =>
                    void act(() =>
                      transitionCampaign({
                        organizationId,
                        campaignId,
                        toStatus: "CANCELLED",
                        reason,
                      }),
                    )
                  }
                >
                  {t("campaigns.detail.cancel")}
                </button>
              )}
            </div>
            {detail && detail.transitions.length > 0 && (
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "grid",
                  gap: "0.4rem",
                }}
              >
                {detail.transitions.map((transition) => (
                  <li key={transition.id}>
                    {labelFromKey(
                      campaignStatusLabels,
                      t,
                      transition.fromStatus,
                      transition.fromStatus,
                    )}{" "}
                    →{" "}
                    {labelFromKey(
                      campaignStatusLabels,
                      t,
                      transition.toStatus,
                      transition.toStatus,
                    )}{" "}
                    <span dir="ltr" style={{ color: "var(--ef-ink-muted)" }}>
                      {transition.createdAt}
                    </span>
                    {transition.reason && <span> — {transition.reason}</span>}
                  </li>
                ))}
              </ul>
            )}
            {detail && detail.budgetCorrections.length > 0 && (
              <>
                <h3>{t("campaigns.detail.correctionsTitle")}</h3>
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    display: "grid",
                    gap: "0.4rem",
                  }}
                >
                  {detail.budgetCorrections.map((correction) => (
                    <li key={correction.id}>
                      <span dir="ltr">
                        {correction.previousMinor} → {correction.correctedMinor}{" "}
                        {correction.currency}
                      </span>{" "}
                      — {correction.reason}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className={styles.panel} aria-labelledby="entries-title">
            <h2 id="entries-title">{t("campaigns.detail.entriesTitle")}</h2>
            {entries.length === 0 ? (
              <p>{t("campaigns.detail.entriesEmpty")}</p>
            ) : (
              <div className={styles.tableWrap}>
                <table>
                  <caption>{t("campaigns.detail.entriesCaption")}</caption>
                  <thead>
                    <tr>
                      <th>{t("campaigns.detail.thTime")}</th>
                      <th>{t("campaigns.detail.thImpressions")}</th>
                      <th>{t("campaigns.detail.thClicks")}</th>
                      <th>{t("campaigns.detail.thLeads")}</th>
                      <th>{t("campaigns.detail.thNote")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.id}>
                        <td dir="ltr">{entry.occurredAt}</td>
                        <td>{entry.impressions}</td>
                        <td>{entry.clicks}</td>
                        <td>{entry.leadsCount}</td>
                        <td>{entry.note ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={styles.panel} aria-labelledby="attribution-title">
            <h2 id="attribution-title">
              {t("campaigns.detail.attributionTitle")}
            </h2>
            <p>{t("campaigns.detail.attributionIntro")}</p>
            <div className={styles.formGrid}>
              <label>
                {t("campaigns.detail.leadIdLabel")}
                <input
                  value={leadLookup}
                  onChange={(event) => setLeadLookup(event.target.value)}
                  dir="ltr"
                />
              </label>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                className="button button-secondary"
                type="button"
                disabled={pending || leadLookup.trim().length === 0}
                onClick={() => void lookupAttribution()}
              >
                {t("campaigns.detail.showAttribution")}
              </button>
              <button
                className="button button-secondary"
                type="button"
                disabled={
                  pending ||
                  leadLookup.trim().length === 0 ||
                  reason.trim().length === 0
                }
                title={t("campaigns.detail.correctAttributionTitle")}
                onClick={() =>
                  void act(async () => {
                    await correctLeadAttribution({
                      organizationId,
                      leadId: leadLookup.trim(),
                      correctedCampaignId: campaign.id,
                      reason,
                    });
                    await lookupAttribution();
                  })
                }
              >
                {t("campaigns.detail.attributeToCampaign")}
              </button>
            </div>
            {attribution && (
              <div style={{ display: "grid", gap: "0.5rem" }}>
                <AttributionLine
                  label={t(attributionModelLabels.FIRST_TOUCH)}
                  campaignId={attribution.firstCampaignId}
                  touch={attribution.firstTouch}
                />
                <AttributionLine
                  label={t(attributionModelLabels.LAST_TOUCH)}
                  campaignId={attribution.lastCampaignId}
                  touch={attribution.lastTouch}
                />
                {attribution.override && (
                  <p style={{ color: "var(--ef-ink-muted)" }}>
                    {t("campaigns.detail.correctedAttributionPrefix")}{" "}
                    {attribution.override.reason}
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function AttributionLine(placeholder: {
  label: string;
  campaignId?: string;
  touch?: {
    channel: keyof typeof touchChannelLabels;
    occurredAt: string;
    source?: string;
  };
}) {
  const t = useT();
  if (!placeholder.touch || !placeholder.campaignId)
    return (
      <p>
        {placeholder.label}:{" "}
        <span>{t("campaigns.detail.noAttributedTouch")}</span>
      </p>
    );
  return (
    <p style={{ margin: 0 }}>
      <strong>{placeholder.label}</strong>:{" "}
      {labelFromKey(
        touchChannelLabels,
        t,
        placeholder.touch.channel,
        placeholder.touch.channel,
      )}{" "}
      — <span dir="ltr">{placeholder.touch.occurredAt}</span>
      {placeholder.touch.source ? ` — ${placeholder.touch.source}` : ""}{" "}
      <span dir="ltr" style={{ color: "var(--ef-ink-muted)" }}>
        ({placeholder.campaignId.slice(0, 8)})
      </span>
    </p>
  );
}
