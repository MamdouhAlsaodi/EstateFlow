"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { labelFromKey, useT, type MessageKey } from "../../i18n";
import { useOrganizationContext } from "../organization-context/organization-context";
import { fetchViewings, requestViewing, viewingAction } from "./viewing-api";
import type { Viewing, ViewingPage } from "./viewing-contract";
import styles from "./viewing-views.module.css";

/**
 * EF-630 — status labels are catalog keys resolved through the translator.
 */
export const VIEWING_STATUS_LABELS: Readonly<
  Record<Viewing["status"], MessageKey>
> = {
  REQUESTED: "viewings.status.REQUESTED",
  CONFIRMED: "viewings.status.CONFIRMED",
  CANCELLED: "viewings.status.CANCELLED",
  COMPLETED: "viewings.status.COMPLETED",
  NO_SHOW: "viewings.status.NO_SHOW",
};

const EMPTY_FORM = {
  leadId: "",
  propertyId: "",
  brokerId: "",
  startAt: "",
  endAt: "",
};

export function ViewingsListView() {
  const t = useT();
  const { organizationId } = useOrganizationContext();
  const [page, setPage] = useState<ViewingPage | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const now = new Date();
      const from = new Date(now);
      from.setDate(now.getDate() - now.getDay());
      from.setHours(0, 0, 0, 0);
      const to = new Date(from);
      to.setDate(from.getDate() + 7);
      setPage(
        await fetchViewings({
          organizationId,
          from: from.toISOString(),
          to: to.toISOString(),
        }),
      );
    } catch {
      setError(t("viewings.list.loadFailed"));
    } finally {
      setBusy(false);
    }
  }, [organizationId, t]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function mutate(operation: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await operation();
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message.includes("VIEWING_CONFLICT")
          ? t("viewings.list.conflict")
          : t("viewings.list.actionFailed"),
      );
      setBusy(false);
    }
  }
  async function create(): Promise<void> {
    if (
      !form.leadId ||
      !form.propertyId ||
      !form.brokerId ||
      !form.startAt ||
      !form.endAt
    ) {
      setError(t("viewings.list.requiredFields"));
      return;
    }
    await mutate(async () => {
      await requestViewing({
        organizationId,
        ...form,
        startAt: new Date(form.startAt).toISOString(),
        endAt: new Date(form.endAt).toISOString(),
      });
      setForm(EMPTY_FORM);
    });
  }
  return (
    <main className={styles.grid}>
      <section aria-labelledby="viewings-title">
        <p className="eyebrow">{t("viewings.list.eyebrow")}</p>
        <h1 id="viewings-title">{t("viewings.list.title")}</h1>
        <p>{t("viewings.list.subtitle")}</p>
        <div className={styles.toolbar}>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
          >
            {busy ? t("viewings.list.pending") : t("viewings.list.refresh")}
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
      </section>
      <section aria-labelledby="calendar-title">
        <h2 id="calendar-title">{t("viewings.list.calendarTitle")}</h2>
        {!page ? (
          <p>{t("viewings.list.loading")}</p>
        ) : page.items.length === 0 ? (
          <p>{t("viewings.list.empty")}</p>
        ) : (
          <ul className={styles.cards}>
            {page.items.map((viewing) => (
              <ViewingCard
                key={viewing.id}
                organizationId={organizationId}
                viewing={viewing}
                busy={busy}
                mutate={mutate}
              />
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="request-title">
        <h2 id="request-title">{t("viewings.list.requestTitle")}</h2>
        <div className={styles.form}>
          {(["leadId", "propertyId", "brokerId"] as const).map((field) => (
            <label key={field}>
              {field === "leadId"
                ? t("viewings.list.leadIdLabel")
                : field === "propertyId"
                  ? t("viewings.list.propertyIdLabel")
                  : t("viewings.list.brokerIdLabel")}
              <input
                dir="ltr"
                value={form[field]}
                onChange={(event) =>
                  setForm({ ...form, [field]: event.target.value })
                }
              />
            </label>
          ))}
          <label>
            {t("viewings.list.startLabel")}
            <input
              dir="ltr"
              type="datetime-local"
              value={form.startAt}
              onChange={(event) =>
                setForm({ ...form, startAt: event.target.value })
              }
            />
          </label>
          <label>
            {t("viewings.list.endLabel")}
            <input
              dir="ltr"
              type="datetime-local"
              value={form.endAt}
              onChange={(event) =>
                setForm({ ...form, endAt: event.target.value })
              }
            />
          </label>
        </div>
        <button
          className="button button-primary"
          type="button"
          onClick={() => void create()}
          disabled={busy}
        >
          {t("viewings.list.submit")}
        </button>
      </section>
    </main>
  );
}
function ViewingCard({
  organizationId,
  viewing,
  busy,
  mutate,
}: {
  organizationId: string;
  viewing: Viewing;
  busy: boolean;
  mutate: (operation: () => Promise<unknown>) => Promise<void>;
}) {
  const t = useT();
  const actions: readonly {
    action: "confirm" | "cancel" | "complete" | "no-show";
    labelKey: MessageKey;
  }[] =
    viewing.status === "REQUESTED"
      ? [
          {
            action: "confirm",
            labelKey: "viewings.list.actionConfirm",
          },
          { action: "cancel", labelKey: "viewings.list.actionCancel" },
        ]
      : viewing.status === "CONFIRMED"
        ? [
            {
              action: "complete",
              labelKey: "viewings.list.actionComplete",
            },
            { action: "no-show", labelKey: "viewings.list.actionNoShow" },
            { action: "cancel", labelKey: "viewings.list.actionCancel" },
          ]
        : [];
  return (
    <li className={styles.card}>
      <strong>
        {labelFromKey(VIEWING_STATUS_LABELS, t, viewing.status, viewing.status)}
      </strong>
      <span className={styles.meta} dir="ltr">
        {viewing.startAt} — {viewing.endAt}
      </span>
      <span className={styles.meta}>
        {t("viewings.list.brokerPrefix")} <b dir="ltr">{viewing.brokerId}</b>
      </span>
      <span className={styles.meta}>
        {t("viewings.list.leadPrefix")} <b dir="ltr">{viewing.leadId}</b>
      </span>
      <div className={styles.actions}>
        <Link
          className="button button-secondary"
          href={`/ar/organizations/${organizationId}/viewings/${viewing.id}`}
        >
          {t("viewings.list.detailsLink")}
        </Link>
        {actions.map((item) => (
          <button
            className="button button-secondary"
            key={item.action}
            type="button"
            disabled={busy}
            onClick={() =>
              void mutate(() =>
                viewingAction({
                  organizationId,
                  viewingId: viewing.id,
                  action: item.action,
                }),
              )
            }
          >
            {t(item.labelKey)}
          </button>
        ))}
      </div>
    </li>
  );
}
