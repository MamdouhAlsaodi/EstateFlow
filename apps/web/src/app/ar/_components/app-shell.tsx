"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useT } from "../../../i18n";

const NAVIGATION = [
  { labelKey: "shell.navOverview", href: "/ar", active: true },
  { labelKey: "shell.navLeads", href: "/ar#leads", active: false },
  { labelKey: "shell.navProperties", href: "/ar#properties", active: false },
  { labelKey: "shell.navFinance", href: "/ar#finance", active: false },
  { labelKey: "shell.navTasks", href: "/ar#tasks", active: false },
] as const;

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const t = useT();
  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        {t("shell.skipToContent")}
      </a>
      <header className="topbar">
        <Link aria-label={t("shell.brandAria")} className="brand" href="/ar">
          <span aria-hidden="true" className="brand-mark">
            E
          </span>
          <span>EstateFlow</span>
        </Link>
        <div className="topbar-meta">
          <span className="environment-badge">{t("shell.envBadge")}</span>
          <button
            aria-label={t("shell.notificationsAria")}
            className="icon-button"
            type="button"
          >
            <span aria-hidden="true">◌</span>
          </button>
          <button
            aria-label={t("shell.accountMenuAria")}
            className="avatar-button"
            type="button"
          >
            {t("shell.avatarInitial")}
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside aria-label={t("shell.mainNavAria")} className="sidebar">
          <p className="sidebar-label">{t("shell.workspaceLabel")}</p>
          <nav>
            <ul className="nav-list">
              {NAVIGATION.map((item) => (
                <li key={item.href}>
                  <Link
                    aria-current={item.active ? "page" : undefined}
                    className={
                      item.active ? "nav-link nav-link-active" : "nav-link"
                    }
                    href={item.href}
                  >
                    {t(item.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="sidebar-note">
            <strong>{t("shell.sidebarNoteTitle")}</strong>
            <span>{t("shell.sidebarNoteBody")}</span>
          </div>
        </aside>
        <main id="main-content" className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
