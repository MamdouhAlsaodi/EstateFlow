export default function Loading() {
  return (
    <section
      aria-busy="true"
      aria-label="جارٍ تحميل الواجهة"
      className="loading-grid"
    >
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-wide" />
      <div className="skeleton skeleton-wide" />
    </section>
  );
}
