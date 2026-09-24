"use client";

import { useCallback, useState } from "react";
import { getPropertyClusters, searchProperties } from "./geo-search-api";
import type {
  GeoSearchInput,
  GeoSearchMode,
  GeoSearchPage,
  GeoClusterResult,
} from "./geo-search-contract";

const DEFAULT_RING = JSON.stringify(
  [
    { latitude: 30, longitude: 31 },
    { latitude: 30, longitude: 31.1 },
    { latitude: 30.1, longitude: 31.1 },
    { latitude: 30.1, longitude: 31 },
    { latitude: 30, longitude: 31 },
  ],
  null,
  2,
);

export function GeoSearchView({
  organizationId,
}: Readonly<{ organizationId: string }>) {
  const [mode, setMode] = useState<GeoSearchMode>("radius");
  const [centerLat, setCenterLat] = useState("30");
  const [centerLng, setCenterLng] = useState("31");
  const [radiusKm, setRadiusKm] = useState("10");
  const [polygon, setPolygon] = useState(DEFAULT_RING);
  const [bbox, setBbox] = useState(
    '{"minLatitude":30,"minLongitude":31,"maxLatitude":30.1,"maxLongitude":31.1}',
  );
  const [search, setSearch] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [page, setPage] = useState<GeoSearchPage | null>(null);
  const [clusters, setClusters] = useState<GeoClusterResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const input = useCallback(
    (cursor?: string): GeoSearchInput => ({
      mode,
      search: search || undefined,
      propertyType: propertyType || undefined,
      centerLat: mode === "radius" ? Number(centerLat) : undefined,
      centerLng: mode === "radius" ? Number(centerLng) : undefined,
      radiusKm: mode === "radius" ? Number(radiusKm) : undefined,
      polygon: mode === "polygon" ? polygon : undefined,
      bbox: mode === "bbox" ? bbox : undefined,
      cursor,
      limit: 12,
      cellKm: 2,
    }),
    [bbox, centerLat, centerLng, mode, polygon, propertyType, radiusKm, search],
  );

  const load = useCallback(
    async (cursor?: string) => {
      setBusy(true);
      setError(null);
      try {
        const criteria = input(cursor);
        const [nextPage, nextClusters] = await Promise.all([
          searchProperties(organizationId, criteria),
          cursor
            ? Promise.resolve(clusters)
            : getPropertyClusters(organizationId, criteria),
        ]);
        setPage(nextPage);
        if (nextClusters) setClusters(nextClusters);
      } catch {
        setError("تحقق من الإحداثيات وإغلاق حلقة المضلع ثم أعد المحاولة.");
      } finally {
        setBusy(false);
      }
    },
    [clusters, input, organizationId],
  );

  return (
    <main style={{ display: "grid", gap: "1.25rem" }}>
      <section aria-labelledby="geo-search-title">
        <p className="eyebrow">EF-510 — اكتشاف العقارات</p>
        <h1 id="geo-search-title">بحث جغرافي للخدمات المنشورة</h1>
        <p>نفس المرشحات تغذي القائمة والتجمعات على الخريطة المصغرة.</p>
        <div style={{ display: "grid", gap: "0.75rem", maxWidth: 720 }}>
          <label>
            النمط
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as GeoSearchMode)}
            >
              <option value="radius">نطاق حول نقطة</option>
              <option value="polygon">داخل مضلع</option>
              <option value="bbox">مربع الخريطة</option>
            </select>
          </label>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <label>
              بحث نصي
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label>
              نوع العقار
              <input
                value={propertyType}
                onChange={(event) => setPropertyType(event.target.value)}
              />
            </label>
          </div>
          {mode === "radius" && (
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <label>
                خط العرض
                <input
                  dir="ltr"
                  type="number"
                  value={centerLat}
                  onChange={(event) => setCenterLat(event.target.value)}
                />
              </label>
              <label>
                خط الطول
                <input
                  dir="ltr"
                  type="number"
                  value={centerLng}
                  onChange={(event) => setCenterLng(event.target.value)}
                />
              </label>
              <label>
                نصف القطر كم
                <input
                  dir="ltr"
                  type="number"
                  min="0.001"
                  value={radiusKm}
                  onChange={(event) => setRadiusKm(event.target.value)}
                />
              </label>
            </div>
          )}
          {mode === "polygon" && (
            <label>
              حلقة المضلع بصيغة JSON
              <textarea
                dir="ltr"
                rows={5}
                value={polygon}
                onChange={(event) => setPolygon(event.target.value)}
              />
            </label>
          )}
          {mode === "bbox" && (
            <label>
              المربع بصيغة JSON
              <input
                dir="ltr"
                value={bbox}
                onChange={(event) => setBbox(event.target.value)}
              />
            </label>
          )}
          <button
            className="button button-primary"
            type="button"
            onClick={() => void load()}
            disabled={busy}
          >
            {busy ? "جارٍ البحث…" : "بحث"}
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
      </section>
      <section aria-labelledby="geo-map-title">
        <h2 id="geo-map-title">خريطة مصغرة</h2>
        <div
          style={{
            minHeight: 150,
            border: "1px solid #cbd5e1",
            borderRadius: 12,
            padding: "1rem",
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {clusters?.clusters.map((cluster) => (
            <span
              key={`${cluster.latitude}-${cluster.longitude}`}
              title={`${cluster.count} عقار`}
              style={{
                borderRadius: "999px",
                background: "#0f766e",
                color: "white",
                padding: "0.6rem",
              }}
            >
              {cluster.count}
            </span>
          ))}
          {!clusters && <span>شغّل البحث لعرض تجمعات النتائج.</span>}
        </div>
      </section>
      <section aria-labelledby="geo-results-title">
        <h2 id="geo-results-title">النتائج ({page?.items.length ?? 0})</h2>
        {!page ? (
          <p>لا توجد نتائج محملة بعد.</p>
        ) : page.items.length === 0 ? (
          <p>لا توجد عقارات منشورة ضمن النطاق.</p>
        ) : (
          <ul
            style={{
              display: "grid",
              gap: "0.75rem",
              padding: 0,
              listStyle: "none",
            }}
          >
            {page.items.map((item) => (
              <li
                key={item.id}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 12,
                  padding: "0.9rem",
                }}
              >
                <strong>{item.title}</strong>
                <div>
                  {item.propertyType} — {item.addressText}
                </div>
                <small dir="ltr">
                  {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
                </small>
              </li>
            ))}
          </ul>
        )}
        {page?.nextCursor && (
          <button
            className="button button-secondary"
            type="button"
            onClick={() => void load(page.nextCursor as string)}
            disabled={busy}
          >
            النتائج التالية
          </button>
        )}
      </section>
    </main>
  );
}
