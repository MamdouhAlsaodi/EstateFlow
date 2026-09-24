import Link from "next/link";

/**
 * EF-620 — Arabic-first platform-admin console landing. Lean hub linking to
 * the four privileged sections; every section enforces the platform-admin
 * boundary server-side through the API.
 */
const SECTIONS = [
  {
    href: "/ar/admin/brokers",
    title: "الوسطاء العقاريون",
    description:
      "طلبات الانضمام بانتظار الموافقة، وإيقاف أو إعادة تفعيل وسيط على مستوى المنصة.",
  },
  {
    href: "/ar/admin/listings",
    title: "مراجعة الإعلانات",
    description:
      "قائمة الإعلانات المنشورة بانتظار المراجعة: اعتماد أو رفض أو تخفيض عن النشر بسبب مُسجَّل.",
  },
  {
    href: "/ar/admin/audit",
    title: "سجل الإدارة",
    description:
      "بحث محدود النطاق في كل الإجراءات الإدارية المسجّلة بشكل غير قابل للتعديل.",
  },
  {
    href: "/ar/admin/jobs",
    title: "الوظائف الفاشلة",
    description:
      "مراجعة وظائف الأتمتة الفاشلة عبر كل المؤسسات مع أسباب الفشل المكتوبة.",
  },
];

export default function AdminConsolePage() {
  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">منصة إستيت فلو</p>
          <h1>لوحة الإدارة</h1>
          <p>
            سطح الإدارة على مستوى المنصة: اعتماد الوسطاء والإيقاف، مراجعة
            الإعلانات، البحث في سجل الإدارة، ومراجعة الوظائف الفاشلة. الإجراءات
            الحساسة تتطلب سبباً وإعادة تأكيد كلمة المرور، وكلها مسجّلة.
          </p>
        </div>
      </header>
      <section aria-labelledby="admin-sections-title" className="panel">
        <h2 id="admin-sections-title">الأقسام</h2>
        <ul className="status-list">
          {SECTIONS.map((section) => (
            <li key={section.href}>
              <span className={`status-dot status-teal`} aria-hidden="true" />
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
