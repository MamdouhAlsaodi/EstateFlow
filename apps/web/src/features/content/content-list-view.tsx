"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useT } from "../../i18n";
import { useOrganizationContext } from "../organization-context/organization-context";
import {
  CONTENT_CHANNELS,
  CONTENT_STATUSES,
  type ContentListPage,
  type ContentStatus,
  type ContentSummary,
} from "./content-contract";
import { contentChannelLabels, contentStatusLabels } from "./content-labels";
import { createContentItem, fetchContentItems } from "./content-api";
import { ContentGenerationPanel } from "./content-generation-panel";
import styles from "./content-views.module.css";

const EMPTY_FORM = {
  title: "",
  body: "",
  channel: "INSTAGRAM",
  campaignId: "",
};

/**
 * EF-402 — content list with lifecycle badges and an inline idea
 * creation form. Every figure comes from the strict API contract.
 */
export function ContentListView() {
  const t = useT();
  const { organizationId } = useOrganizationContext();
  const [page, setPage] = useState<ContentListPage | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPage(
        await fetchContentItems({
          organizationId,
          ...(statusFilter === "" ? {} : { status: statusFilter }),
        }),
      );
    } catch {
      setError(t("content.list.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [organizationId, statusFilter]);

  async function submitCreate(): Promise<void> {
    if (
      form.title.trim().length === 0 ||
      form.body.trim().length === 0 ||
      !CONTENT_CHANNELS.includes(
        form.channel as (typeof CONTENT_CHANNELS)[number],
      )
    ) {
      setError(t("content.list.validation"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      await createContentItem(
        { organizationId },
        {
          title: form.title,
          body: form.body,
          channel: form.channel,
          ...(form.campaignId.trim() === ""
            ? {}
            : { campaignId: form.campaignId.trim() }),
        },
      );
      setForm(EMPTY_FORM);
      await refresh();
    } catch {
      setError(t("content.list.createFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="workspace-stack">
      <section aria-labelledby="content-title">
        <p className="eyebrow">{t("content.list.eyebrow")}</p>
        <h1 id="content-title">{t("content.list.title")}</h1>
        <p>{t("content.list.subtitle")}</p>
        <nav
          aria-label={t("content.list.toolsAria")}
          style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}
        >
          <Link
            className="button button-secondary"
            href={`/ar/organizations/${organizationId}/content/review-queue`}
          >
            {t("content.list.reviewQueueLink")}
          </Link>
          <Link
            className="button button-secondary"
            href={`/ar/organizations/${organizationId}/content/calendar`}
          >
            {t("content.list.calendarLink")}
          </Link>
          <Link
            className="button button-secondary"
            href={`/ar/organizations/${organizationId}/content/publishing`}
          >
            {t("content.list.publishingLink")}
          </Link>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => void refresh()}
            disabled={loading || pending}
          >
            {loading
              ? t("content.common.loading")
              : t("content.common.refreshList")}
          </button>
        </nav>
        {error && (
          <div role="alert" style={{ color: "#b3423a", marginTop: "0.75rem" }}>
            <span>{error}</span>
          </div>
        )}
      </section>

      <section aria-labelledby="content-list-title">
        <h2 id="content-list-title">{t("content.list.sectionTitle")}</h2>
        <label style={{ display: "grid", gap: "0.25rem", maxWidth: "16rem" }}>
          {t("content.list.statusFilter")}
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">{t("content.list.allStatuses")}</option>
            {CONTENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(contentStatusLabels[status])}
              </option>
            ))}
          </select>
        </label>
        {!page ? (
          <p>{t("content.common.pressRefreshList")}</p>
        ) : page.items.length === 0 ? (
          <p>{t("content.list.empty")}</p>
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              display: "grid",
              gap: "0.75rem",
            }}
          >
            {page.items.map((item) => (
              <ContentCard
                key={item.id}
                item={item}
                organizationId={organizationId}
              />
            ))}
          </ul>
        )}
        {page?.nextCursor && (
          <p style={{ color: "var(--ef-ink-muted)" }}>
            {t("content.list.morePages")}
          </p>
        )}
      </section>

      <section aria-labelledby="content-create-title">
        <h2 id="content-create-title">{t("content.list.createTitle")}</h2>
        <div className={styles.formGrid}>
          <label>
            {t("content.list.titleLabel")}
            <input
              value={form.title}
              onChange={(event) =>
                setForm({ ...form, title: event.target.value })
              }
            />
          </label>
          <label>
            {t("content.list.bodyLabel")}
            <textarea
              rows={3}
              value={form.body}
              onChange={(event) =>
                setForm({ ...form, body: event.target.value })
              }
            />
          </label>
          <label>
            {t("content.list.channelLabel")}
            <select
              value={form.channel}
              onChange={(event) =>
                setForm({ ...form, channel: event.target.value })
              }
            >
              {CONTENT_CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {t(contentChannelLabels[channel])}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("content.list.campaignIdLabel")}
            <input
              value={form.campaignId}
              onChange={(event) =>
                setForm({ ...form, campaignId: event.target.value })
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
            {pending ? t("content.list.creating") : t("content.list.create")}
          </button>
        </div>
      </section>

      <ContentGenerationPanel organizationId={organizationId} />
    </div>
  );
}

function ContentCard({
  item,
  organizationId,
}: {
  item: ContentSummary;
  organizationId: string;
}) {
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
        <Link href={`/ar/organizations/${organizationId}/content/${item.id}`}>
          <strong>{item.title}</strong>
        </Link>
        <StatusBadge status={item.status} />
        <span style={{ color: "var(--ef-ink-muted)" }}>
          {t(contentChannelLabels[item.channel])}
        </span>
        {item.variantNumber > 1 && (
          <span style={{ color: "var(--ef-ink-muted)" }}>
            {t("content.common.variantOf", { number: item.variantNumber })}
          </span>
        )}
      </div>
      <span style={{ color: "var(--ef-ink-muted)" }}>
        {item.approvedVersion === undefined
          ? t("content.list.notApproved")
          : t("content.list.approvedVersion", {
              version: item.approvedVersion,
            })}
        {item.scheduledFor === undefined
          ? ""
          : t("content.list.scheduledSuffix", {
              value: new Date(item.scheduledFor)
                .toISOString()
                .slice(0, 16)
                .replace("T", " "),
            })}
      </span>
    </li>
  );
}

export function StatusBadge({ status }: { status: ContentStatus }) {
  const t = useT();
  const className = `${styles.statusChip} ${
    status === "IDEA"
      ? styles.statusIdea
      : status === "DRAFT"
        ? styles.statusDraft
        : status === "REVIEW"
          ? styles.statusReview
          : status === "APPROVED"
            ? styles.statusApproved
            : status === "SCHEDULED"
              ? styles.statusScheduled
              : status === "PUBLISHED"
                ? styles.statusPublished
                : styles.statusFailed
  }`;
  return <span className={className}>{t(contentStatusLabels[status])}</span>;
}
