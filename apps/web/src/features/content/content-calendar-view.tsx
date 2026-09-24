"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useT, type MessageKey } from "../../i18n";
import { useOrganizationContext } from "../organization-context/organization-context";
import type { CalendarResponse } from "./content-contract";
import { contentChannelLabels, contentStatusLabels } from "./content-labels";
import { fetchCalendar } from "./content-api";
import styles from "./content-views.module.css";

const WEEKDAY_KEYS: readonly MessageKey[] = [
  "content.weekday.monday",
  "content.weekday.tuesday",
  "content.weekday.wednesday",
  "content.weekday.thursday",
  "content.weekday.friday",
  "content.weekday.saturday",
  "content.weekday.sunday",
];

function utcDateKey(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * EF-402 — month-grid publishing calendar (UTC). Each cell lists the
 * scheduled/published/failed items whose scheduled timestamp falls on that
 * UTC day; cells link straight to the item detail.
 */
export function ContentCalendarView() {
  const t = useT();
  const { organizationId } = useOrganizationContext();
  const [month, setMonth] = useState<string>(
    new Date().toISOString().slice(0, 7),
  );
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      setError(t("content.calendar.monthValidation"));
      return;
    }
    const from = `${month}-01T00:00:00.000Z`;
    const toDate = new Date(`${month}-01T00:00:00.000Z`);
    toDate.setUTCMonth(toDate.getUTCMonth() + 1);
    const to = toDate.toISOString();
    setLoading(true);
    setError(null);
    try {
      setCalendar(await fetchCalendar({ organizationId, from, to }));
    } catch {
      setError(t("content.calendar.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [organizationId, month]);

  const byDay = new Map<string, CalendarResponse["items"][number][]>();
  for (const entry of calendar?.items ?? []) {
    const key = utcDateKey(entry.scheduledFor);
    const bucket = byDay.get(key);
    if (bucket === undefined) byDay.set(key, [entry]);
    else bucket.push(entry);
  }

  const firstDay = new Date(`${month}-01T00:00:00.000Z`);
  const daysInMonth = new Date(
    Date.UTC(firstDay.getUTCFullYear(), firstDay.getUTCMonth() + 1, 0),
  ).getUTCDate();
  // Monday-first grid offset (UTC weekday: 0 = Sunday … 6 = Saturday).
  const leadingEmpty = (firstDay.getUTCDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array.from({ length: leadingEmpty }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  return (
    <div className="workspace-stack">
      <section aria-labelledby="calendar-title">
        <p className="eyebrow">{t("content.calendar.eyebrow")}</p>
        <h1 id="calendar-title">{t("content.calendar.title")}</h1>
        <p>{t("content.calendar.subtitle")}</p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <label style={{ display: "grid", gap: "0.25rem" }}>
            {t("content.calendar.monthLabel")}
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </label>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            style={{ alignSelf: "end" }}
          >
            {loading
              ? t("content.common.loading")
              : t("content.calendar.showMonth")}
          </button>
        </div>
        {error && (
          <div role="alert" style={{ color: "#b3423a", marginTop: "0.75rem" }}>
            <span>{error}</span>
          </div>
        )}
      </section>

      <section aria-labelledby="calendar-grid-title">
        <h2 id="calendar-grid-title">{t("content.calendar.gridTitle")}</h2>
        {!calendar ? (
          <p>{t("content.calendar.pressShow")}</p>
        ) : (
          <div className={styles.calendarGrid} role="grid">
            {WEEKDAY_KEYS.map((day) => (
              <span
                key={day}
                className={styles.calendarHeadCell}
                role="columnheader"
              >
                {t(day)}
              </span>
            ))}
            {cells.map((day, index) => {
              if (day === null)
                return (
                  <span
                    key={`empty-${index}`}
                    className={`${styles.calendarCell} ${styles.calendarCellEmpty}`}
                    role="gridcell"
                  />
                );
              const key = `${month}-${String(day).padStart(2, "0")}`;
              const entries = byDay.get(key) ?? [];
              return (
                <span key={key} className={styles.calendarCell} role="gridcell">
                  <span className={styles.calendarDay}>{day}</span>
                  {entries.map((entry) => (
                    <Link
                      key={entry.id}
                      href={`/ar/organizations/${organizationId}/content/${entry.id}`}
                      className={`${styles.calendarEntry} ${
                        entry.status === "PUBLISHED"
                          ? styles.calendarPublished
                          : entry.status === "FAILED"
                            ? styles.calendarFailed
                            : styles.calendarScheduled
                      }`}
                      title={`${entry.title} — ${t(contentStatusLabels[entry.status])}`}
                    >
                      {entry.scheduledFor.slice(11, 16)}{" "}
                      {t(contentChannelLabels[entry.channel])} · {entry.title}
                    </Link>
                  ))}
                </span>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
