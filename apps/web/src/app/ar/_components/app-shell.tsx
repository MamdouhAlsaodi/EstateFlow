import Link from "next/link";
import type { ReactNode } from "react";

const navigation = [
  { label: "نظرة عامة", href: "/ar", active: true },
  { label: "الاستفسارات", href: "/ar#leads" },
  { label: "العقارات", href: "/ar#properties" },
  { label: "الصفقات والمال", href: "/ar#finance" },
  { label: "المهام والمتابعة", href: "/ar#tasks" },
];

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        تجاوز إلى المحتوى
      </a>
      <header className="topbar">
        <Link
          aria-label="EstateFlow، العودة إلى النموذج"
          className="brand"
          href="/ar"
        >
          <span aria-hidden="true" className="brand-mark">
            E
          </span>
          <span>EstateFlow</span>
        </Link>
        <div className="topbar-meta">
          <span className="environment-badge">نموذج تجريبي</span>
          <button
            aria-label="فتح الإشعارات"
            className="icon-button"
            type="button"
          >
            <span aria-hidden="true">◌</span>
          </button>
          <button
            aria-label="فتح قائمة الحساب"
            className="avatar-button"
            type="button"
          >
            م
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside aria-label="التنقل الرئيسي" className="sidebar">
          <p className="sidebar-label">مساحة المالك</p>
          <nav>
            <ul className="nav-list">
              {navigation.map((item) => (
                <li key={item.href}>
                  <Link
                    aria-current={item.active ? "page" : undefined}
                    className={
                      item.active ? "nav-link nav-link-active" : "nav-link"
                    }
                    href={item.href}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="sidebar-note">
            <strong>واجهة الأساس</strong>
            <span>بيانات توضيحية فقط، بلا اتصال تشغيلي.</span>
          </div>
        </aside>
        <main id="main-content" className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
