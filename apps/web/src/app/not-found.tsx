import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found">
      <p className="eyebrow">404 · EstateFlow</p>
      <h1>هذه الصفحة غير موجودة</h1>
      <p>قد يكون الرابط غير صحيح أو أن هذه القدرة لم تُبنَ بعد.</p>
      <Link className="button button-primary" href="/ar">
        العودة إلى نموذج الواجهة
      </Link>
    </main>
  );
}
