"use client";

import { useT } from "../../i18n";

export default function Loading() {
  const t = useT();
  return (
    <section
      aria-busy="true"
      aria-label={t("loading.aria")}
      className="loading-grid"
    >
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-wide" />
      <div className="skeleton skeleton-wide" />
    </section>
  );
}
