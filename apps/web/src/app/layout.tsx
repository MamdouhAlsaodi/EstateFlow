import "@estateflow/design-tokens/styles.css";
import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { htmlAttributes, LocaleProvider } from "../i18n";
import { getRequestLocale, getServerT } from "../i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("meta.title"),
    description: t("meta.description"),
  };
}

/**
 * EF-630 — the single direction switch. The middleware derives the locale
 * from the URL segment; this layout is the only place that renders
 * `<html lang dir>`, so Arabic renders RTL and any future locale renders
 * LTR through `htmlAttributes(locale)` alone.
 */
export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const locale = await getRequestLocale();
  return (
    <html lang={htmlAttributes(locale).lang} dir={htmlAttributes(locale).dir}>
      <body>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
