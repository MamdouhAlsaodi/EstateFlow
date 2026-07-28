"use client";

export default function Error({
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <section className="state-card" role="alert">
      <p className="eyebrow">تعذر تحميل الواجهة</p>
      <h1>لم نتمكن من عرض هذه الصفحة الآن</h1>
      <p>
        جرّب إعادة المحاولة. إذا استمرت المشكلة، راجع حالة الخدمة قبل إدخال أي
        بيانات.
      </p>
      <button className="button button-primary" onClick={reset} type="button">
        إعادة المحاولة
      </button>
    </section>
  );
}
