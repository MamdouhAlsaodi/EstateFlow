"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchPropertySummary } from "./media-api";
import type { PropertySummary } from "./media-contract";
import { MediaWorkspace } from "./media-workspace";
import styles from "./property-views.module.css";

export function PropertyDetailView({
  organizationId,
  propertyId,
}: Readonly<{ organizationId: string; propertyId: string }>) {
  const [property, setProperty] = useState<PropertySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const summary = await fetchPropertySummary(organizationId, propertyId);
      setProperty(summary);
      setError(null);
    } catch {
      setError("تعذر تحميل بيانات العقار — تحقق من الجلسة والصلاحيات.");
    }
  }, [organizationId, propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className={styles.grid} dir="rtl">
      <h1>تفاصيل العقار</h1>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {property ? (
        <section>
          <dl className={styles.details}>
            <dt>العنوان</dt>
            <dd>{property.title}</dd>
            <dt>النوع</dt>
            <dd>{property.propertyType}</dd>
            <dt>العنوان النصي</dt>
            <dd>{property.addressText}</dd>
            <dt>الحالة</dt>
            <dd>{property.status === "ACTIVE" ? "نشط" : "مؤرشف"}</dd>
            <dt>الإحداثيات</dt>
            <dd>
              {property.latitude !== null && property.longitude !== null
                ? `${property.latitude}, ${property.longitude}`
                : "غير محددة"}
            </dd>
          </dl>
        </section>
      ) : !error ? (
        <p className={styles.meta}>جارٍ التحميل…</p>
      ) : null}
      <MediaWorkspace organizationId={organizationId} propertyId={propertyId} />
    </main>
  );
}
