import "@estateflow/design-tokens/styles.css";
import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "EstateFlow | منصة تشغيل العقار",
  description: "واجهة EstateFlow العربية التجريبية لإدارة عمليات العقار.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html dir="rtl" lang="ar">
      <body>{children}</body>
    </html>
  );
}
