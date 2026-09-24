"use client";

import styles from "./campaign-views.module.css";
import { useT } from "../../i18n";

/**
 * EF-401 — budget planned vs actual progress. Money never leaves the exact
 * minor-unit strings of the API contract; the percentage is display-only.
 * Label text is localized (EF-630), the numbers stay verbatim contract data.
 */
export function BudgetProgressBar(placeholder: {
  plannedMinor: string;
  actualMinor?: string;
  currency: string;
}) {
  const t = useT();
  const planned = BigInt(placeholder.plannedMinor);
  const actual =
    placeholder.actualMinor === undefined
      ? undefined
      : BigInt(placeholder.actualMinor);
  const percent =
    actual === undefined || planned === 0n
      ? null
      : Number((actual * 10000n) / planned) / 100;
  const width = percent === null ? 0 : Math.max(0, Math.min(100, percent));
  const over = percent !== null && percent > 100;
  return (
    <div>
      <div
        className={styles.progressTrack}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        {...(percent === null
          ? {}
          : { "aria-valuenow": Math.min(100, Math.round(percent)) })}
        aria-label={t("campaigns.budgetProgressAria")}
      >
        <div
          className={over ? styles.progressFillOver : styles.progressFill}
          style={{ width: `${width}%` }}
        />
      </div>
      <p className={styles.progressLabel}>
        {placeholder.actualMinor === undefined
          ? t("campaigns.budgetPlannedOnly", {
              plannedMinor: placeholder.plannedMinor,
              currency: placeholder.currency,
            })
          : over
            ? t("campaigns.budgetOver", {
                actualMinor: placeholder.actualMinor,
                plannedMinor: placeholder.plannedMinor,
                currency: placeholder.currency,
              })
            : t("campaigns.budgetSpent", {
                actualMinor: placeholder.actualMinor,
                plannedMinor: placeholder.plannedMinor,
                currency: placeholder.currency,
                percent: percent ?? 0,
              })}
      </p>
    </div>
  );
}
