"use client";

import { useT } from "../../i18n";

export default function Error({
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const t = useT();
  return (
    <section className="state-card" role="alert">
      <p className="eyebrow">{t("error.eyebrow")}</p>
      <h1>{t("error.title")}</h1>
      <p>{t("error.description")}</p>
      <button className="button button-primary" onClick={reset} type="button">
        {t("error.retry")}
      </button>
    </section>
  );
}
