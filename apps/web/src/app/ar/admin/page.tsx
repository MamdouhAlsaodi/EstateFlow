import Link from "next/link";
import { getServerT } from "../../../i18n/server";

/**
 * EF-620 — Arabic-first platform-admin console landing. Lean hub linking to
 * the four privileged sections; every section enforces the platform-admin
 * boundary server-side through the API.
 */
export default async function AdminConsolePage() {
  const t = await getServerT();
  const sections = [
    {
      href: "/ar/admin/brokers",
      title: t("adminLanding.brokersTitle"),
      description: t("adminLanding.brokersDescription"),
    },
    {
      href: "/ar/admin/listings",
      title: t("adminLanding.listingsTitle"),
      description: t("adminLanding.listingsDescription"),
    },
    {
      href: "/ar/admin/audit",
      title: t("adminLanding.auditTitle"),
      description: t("adminLanding.auditDescription"),
    },
    {
      href: "/ar/admin/jobs",
      title: t("adminLanding.jobsTitle"),
      description: t("adminLanding.jobsDescription"),
    },
  ];
  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">{t("adminLanding.eyebrow")}</p>
          <h1>{t("adminLanding.title")}</h1>
          <p>{t("adminLanding.intro")}</p>
        </div>
      </header>
      <section aria-labelledby="admin-sections-title" className="panel">
        <h2 id="admin-sections-title">{t("adminLanding.sectionsTitle")}</h2>
        <ul className="status-list">
          {sections.map((section) => (
            <li key={section.href}>
              <span aria-hidden="true" className="status-dot status-teal" />
              <div>
                <Link href={section.href}>{section.title}</Link>
                <p>{section.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
