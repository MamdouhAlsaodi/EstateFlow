"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { labelFromKey, useT, type MessageKey } from "../../i18n";
import { useOrganizationContext } from "../organization-context/organization-context";
import { fetchViewingDetail } from "./viewing-api";
import type { ViewingDetail } from "./viewing-contract";
import { VIEWING_STATUS_LABELS } from "./viewings-list-view";
import styles from "./viewing-views.module.css";

/**
 * EF-630 — reminder labels come from the translation catalog.
 */
const REMINDER_LABELS: Readonly<
  Record<ViewingDetail["upcomingReminders"][number]["kind"], MessageKey>
> = {
  REMINDER_24H: "viewings.reminder.REMINDER_24H",
  REMINDER_1H: "viewings.reminder.REMINDER_1H",
  OUTCOME_REQUEST: "viewings.reminder.OUTCOME_REQUEST",
};

export function ViewingDetailView({ viewingId }: { viewingId: string }) {
  const t = useT();
  const { organizationId } = useOrganizationContext();
  const [detail, setDetail] = useState<ViewingDetail | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    try {
      setError(false);
      setDetail(await fetchViewingDetail({ organizationId, viewingId }));
    } catch {
      setError(true);
    }
  }, [organizationId, viewingId]);
  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p role="alert">{t("viewings.detail.loadFailed")}</p>;
  if (!detail) return <p role="status">{t("viewings.detail.loading")}</p>;
  return (
    <main className={styles.grid}>
      <section aria-labelledby="viewing-detail-title">
        <p className="eyebrow">{t("viewings.detail.eyebrow")}</p>
        <h1 id="viewing-detail-title">{t("viewings.detail.title")}</h1>
        <p dir="ltr">
          {detail.viewing.startAt} — {detail.viewing.endAt}
        </p>
        <p>
          {t("viewings.detail.statusPrefix")}{" "}
          {labelFromKey(
            VIEWING_STATUS_LABELS,
            t,
            detail.viewing.status,
            detail.viewing.status,
          )}
        </p>
        <p>
          {t("viewings.detail.brokerPrefix")} {detail.viewing.brokerId}
        </p>
        <p>
          {t("viewings.detail.leadPrefix")} {detail.viewing.leadId}
        </p>
        <Link
          className="button button-secondary"
          href={`/ar/organizations/${organizationId}/viewings`}
        >
          {t("viewings.detail.backToList")}
        </Link>
      </section>
      <section aria-labelledby="upcoming-reminders-title">
        <h2 id="upcoming-reminders-title">
          {t("viewings.detail.remindersTitle")}
        </h2>
        {detail.upcomingReminders.length === 0 ? (
          <p>{t("viewings.detail.remindersEmpty")}</p>
        ) : (
          <ul className={styles.cards}>
            {detail.upcomingReminders.map((reminder) => (
              <li
                className={styles.card}
                key={`${reminder.kind}:${reminder.occurrenceKey}`}
              >
                <strong>{t(REMINDER_LABELS[reminder.kind])}</strong>
                <time
                  className={styles.meta}
                  dateTime={reminder.scheduledFor}
                  dir="ltr"
                >
                  {reminder.scheduledFor}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
