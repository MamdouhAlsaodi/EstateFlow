"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { labelFromKey, useT } from "../../i18n";
import { useOrganizationContext } from "../organization-context/organization-context";
import {
  CAMPAIGN_CHANNELS,
  type CampaignAnalyticsResponse,
  type CampaignListPage,
  type CampaignSummary,
} from "./campaign-contract";
import { campaignChannelLabels, campaignStatusLabels } from "./campaign-labels";
import {
  createCampaign,
  fetchCampaigns,
  fetchOrganizationCampaignAnalytics,
} from "./campaign-api";
import { BudgetProgressBar } from "./budget-progress";
import styles from "./campaign-views.module.css";

const EMPTY_FORM = {
  name: "",
  objective: "",
  channel: "META",
  startsAt: "",
  endsAt: "",
  budgetPlannedMinor: "",
  currency: "SAR",
  utmSource: "",
  utmMedium: "",
  utmCampaign: "",
};

/**
 * EF-401 — Arabic campaign list with budget progress. Creation is a plain
 * guarded command; every figure comes from the strict API contract.
 */
export function CampaignsListView() {
  const t = useT();
  const { organizationId } = useOrganizationContext();
  const [page, setPage] = useState<CampaignListPage | null>(null);
  const [analytics, setAnalytics] = useState<CampaignAnalyticsResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [campaignPage, organizationAnalytics] = await Promise.all([
        fetchCampaigns({ organizationId }),
        fetchOrganizationCampaignAnalytics({ organizationId }),
      ]);
      setPage(campaignPage);
      setAnalytics(organizationAnalytics);
    } catch {
      setError(t("campaigns.list.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  async function submitCreate(): Promise<void> {
    if (
      form.name.trim().length === 0 ||
      form.objective.trim().length === 0 ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(form.startsAt) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(form.endsAt) ||
      !/^[1-9]\d*$/.test(form.budgetPlannedMinor) ||
      !/^[A-Z]{3}$/.test(form.currency)
    ) {
      setError(t("campaigns.list.validation"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      await createCampaign({ organizationId }, { ...form });
      setForm(EMPTY_FORM);
      await refresh();
    } catch {
      setError(t("campaigns.list.createFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="workspace-stack">
      <section aria-labelledby="campaigns-title">
        <p className="eyebrow">{t("campaigns.list.eyebrow")}</p>
        <h1 id="campaigns-title">{t("campaigns.list.title")}</h1>
        <p>{t("campaigns.list.subtitle")}</p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => void run(refresh)}
            disabled={loading || pending}
          >
            {loading
              ? t("campaigns.list.loading")
              : t("campaigns.list.refresh")}
          </button>
        </div>
        {error && (
          <div role="alert" style={{ color: "#b3423a", marginTop: "0.75rem" }}>
            <span>{error}</span>
          </div>
        )}
      </section>

      {analytics && <CampaignAnalyticsSummary response={analytics} />}

      <section aria-labelledby="campaign-list-title">
        <h2 id="campaign-list-title">{t("campaigns.list.sectionTitle")}</h2>
        {!page ? (
          <p>{t("campaigns.list.pressRefresh")}</p>
        ) : page.items.length === 0 ? (
          <p>{t("campaigns.list.empty")}</p>
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              display: "grid",
              gap: "1rem",
            }}
          >
            {page.items.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </ul>
        )}
        {page?.nextCursor && (
          <p style={{ color: "var(--ef-ink-muted)" }}>
            {t("campaigns.list.morePages")}
          </p>
        )}
      </section>

      <section aria-labelledby="campaign-create-title">
        <h2 id="campaign-create-title">{t("campaigns.list.createTitle")}</h2>
        <div className={styles.formGrid}>
          <label>
            {t("campaigns.list.nameLabel")}
            <input
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </label>
          <label>
            {t("campaigns.list.objectiveLabel")}
            <input
              value={form.objective}
              onChange={(event) =>
                setForm({ ...form, objective: event.target.value })
              }
            />
          </label>
          <label>
            {t("campaigns.list.channelLabel")}
            <select
              value={form.channel}
              onChange={(event) =>
                setForm({ ...form, channel: event.target.value })
              }
            >
              {CAMPAIGN_CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {labelFromKey(campaignChannelLabels, t, channel, channel)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("campaigns.list.startsLabel")}
            <input
              placeholder="2026-10-01T00:00:00.000Z"
              value={form.startsAt}
              onChange={(event) =>
                setForm({ ...form, startsAt: event.target.value })
              }
              dir="ltr"
            />
          </label>
          <label>
            {t("campaigns.list.endsLabel")}
            <input
              placeholder="2026-10-31T23:59:59.999Z"
              value={form.endsAt}
              onChange={(event) =>
                setForm({ ...form, endsAt: event.target.value })
              }
              dir="ltr"
            />
          </label>
          <label>
            {t("campaigns.list.budgetLabel")}
            <input
              value={form.budgetPlannedMinor}
              onChange={(event) =>
                setForm({ ...form, budgetPlannedMinor: event.target.value })
              }
              dir="ltr"
            />
          </label>
          <label>
            {t("campaigns.list.currencyLabel")}
            <input
              value={form.currency}
              onChange={(event) =>
                setForm({ ...form, currency: event.target.value.toUpperCase() })
              }
              dir="ltr"
            />
          </label>
          <label>
            utm_source
            <input
              value={form.utmSource}
              onChange={(event) =>
                setForm({ ...form, utmSource: event.target.value })
              }
              dir="ltr"
            />
          </label>
          <label>
            utm_medium
            <input
              value={form.utmMedium}
              onChange={(event) =>
                setForm({ ...form, utmMedium: event.target.value })
              }
              dir="ltr"
            />
          </label>
          <label>
            utm_campaign
            <input
              value={form.utmCampaign}
              onChange={(event) =>
                setForm({ ...form, utmCampaign: event.target.value })
              }
              dir="ltr"
            />
          </label>
        </div>
        <div style={{ marginTop: "0.75rem" }}>
          <button
            className="button button-primary"
            type="button"
            disabled={pending}
            onClick={() => void submitCreate()}
          >
            {pending
              ? t("campaigns.list.creating")
              : t("campaigns.list.create")}
          </button>
        </div>
      </section>
    </div>
  );

  async function run(operation: () => Promise<void>): Promise<void> {
    if (pending) return;
    setPending(true);
    try {
      await operation();
    } finally {
      setPending(false);
    }
  }
}

function CampaignCard({ campaign }: { campaign: CampaignSummary }) {
  const t = useT();
  return (
    <li
      style={{
        border: "1px solid var(--ef-line)",
        borderRadius: "var(--ef-radius)",
        padding: "1rem",
        display: "grid",
        gap: "0.5rem",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <Link href={`campaigns/${campaign.id}`}>
          <strong>{campaign.name}</strong>
        </Link>
        <StatusChip status={campaign.status} />
        <span style={{ color: "var(--ef-ink-muted)" }}>
          {labelFromKey(
            campaignChannelLabels,
            t,
            campaign.channel,
            campaign.channel,
          )}
        </span>
      </div>
      <p style={{ margin: 0 }}>{campaign.objective}</p>
      <BudgetProgressBar
        plannedMinor={campaign.budgetPlannedMinor}
        actualMinor={campaign.budgetActualMinor}
        currency={campaign.currency}
      />
      <span style={{ color: "var(--ef-ink-muted)" }}>
        {t("campaigns.list.touches", { count: campaign.touchCount })}
      </span>
    </li>
  );
}

function CampaignAnalyticsSummary({
  response,
}: Readonly<{ response: CampaignAnalyticsResponse }>) {
  const t = useT();
  const { analytics } = response;
  const planned = analytics.plannedBudget[0];
  const spend = planned
    ? analytics.approvedSpend.find((row) => row.currency === planned.currency)
    : undefined;
  return (
    <section
      className={styles.panel}
      aria-labelledby="campaign-analytics-title"
    >
      <h2 id="campaign-analytics-title">{t("campaigns.analytics.title")}</h2>
      {planned ? (
        <BudgetProgressBar
          plannedMinor={planned.amountMinor}
          actualMinor={spend?.amountMinor}
          currency={planned.currency}
        />
      ) : (
        <p>{t("campaigns.analytics.noBudgets")}</p>
      )}
      <div className={styles.analyticsGrid}>
        <div>
          <strong>{t("campaigns.analytics.touches")}</strong>
          <p>{analytics.touchCount}</p>
        </div>
        <div>
          <strong>{t("campaigns.analytics.firstTouchLeads")}</strong>
          <p>{analytics.attribution.firstTouchLeadCount}</p>
        </div>
        <div>
          <strong>{t("campaigns.analytics.lastTouchLeads")}</strong>
          <p>{analytics.attribution.lastTouchLeadCount}</p>
        </div>
        <div>
          <strong>{t("campaigns.analytics.attributedWins")}</strong>
          <p>
            {analytics.attribution.firstTouchWinCount} /{" "}
            {analytics.attribution.lastTouchWinCount}
          </p>
        </div>
      </div>
      <p className={styles.muted}>
        {t("campaigns.analytics.lastUpdatePrefix")}{" "}
        <span dir="ltr">{response.asOf}</span>
      </p>
      {analytics.publishedContent.length > 0 && (
        <ul className={styles.analyticsChannels}>
          {analytics.publishedContent.map((item) => (
            <li key={item.channel}>
              {t("campaigns.analytics.publishedByChannel", {
                channel: item.channel,
              })}{" "}
              <strong>{item.count}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function StatusChip({ status }: { status: CampaignSummary["status"] }) {
  const t = useT();
  const className =
    status === "ACTIVE"
      ? `${styles.statusChip} ${styles.statusActive}`
      : status === "COMPLETED"
        ? `${styles.statusChip} ${styles.statusCompleted}`
        : status === "CANCELLED"
          ? `${styles.statusChip} ${styles.statusCancelled}`
          : `${styles.statusChip} ${styles.statusDraft}`;
  return (
    <span className={className}>
      {labelFromKey(campaignStatusLabels, t, status, status)}
    </span>
  );
}
