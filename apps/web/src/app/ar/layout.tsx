import type { ReactNode } from "react";
import { AppShell } from "./_components/app-shell";

export default function ArabicLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  // Direction/lang live on <html> in the root layout; this segment layout
  // only applies the shared shell.
  return <AppShell>{children}</AppShell>;
}
