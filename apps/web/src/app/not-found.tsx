"use client";

import Link from "next/link";
import { useT } from "../i18n";

export default function NotFound() {
  const t = useT();
  return (
    <main className="not-found">
      <p className="eyebrow">404 · EstateFlow</p>
      <h1>{t("notFound.title")}</h1>
      <p>{t("notFound.description")}</p>
      <Link className="button button-primary" href="/ar">
        {t("notFound.backHome")}
      </Link>
    </main>
  );
}
