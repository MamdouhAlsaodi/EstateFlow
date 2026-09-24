"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "../../i18n";
import { fetchPropertySummary } from "./media-api";
import type { PropertySummary } from "./media-contract";
import { MediaWorkspace } from "./media-workspace";
import styles from "./property-views.module.css";

export function PropertyDetailView({
  organizationId,
  propertyId,
}: Readonly<{ organizationId: string; propertyId: string }>) {
  const t = useT();
  const [property, setProperty] = useState<PropertySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const summary = await fetchPropertySummary(organizationId, propertyId);
      setProperty(summary);
      setError(null);
    } catch {
      setError(t("properties.detail.loadFailed"));
    }
  }, [organizationId, propertyId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className={styles.grid} dir="rtl">
      <h1>{t("properties.detail.title")}</h1>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {property ? (
        <section>
          <dl className={styles.details}>
            <dt>{t("properties.detail.dtTitle")}</dt>
            <dd>{property.title}</dd>
            <dt>{t("properties.detail.dtType")}</dt>
            <dd>{property.propertyType}</dd>
            <dt>{t("properties.detail.dtAddress")}</dt>
            <dd>{property.addressText}</dd>
            <dt>{t("properties.detail.dtStatus")}</dt>
            <dd>
              {property.status === "ACTIVE"
                ? t("properties.detail.statusActive")
                : t("properties.detail.statusArchived")}
            </dd>
            <dt>{t("properties.detail.dtCoordinates")}</dt>
            <dd>
              {property.latitude !== null && property.longitude !== null
                ? `${property.latitude}, ${property.longitude}`
                : t("properties.detail.coordinatesMissing")}
            </dd>
          </dl>
        </section>
      ) : !error ? (
        <p className={styles.meta}>{t("properties.detail.loading")}</p>
      ) : null}
      <MediaWorkspace organizationId={organizationId} propertyId={propertyId} />
    </main>
  );
}
