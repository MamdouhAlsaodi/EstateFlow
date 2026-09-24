/**
 * EF-630 — search catalog. `ar` is the source of truth; `en` must carry
 * every key (typechecked) and the runtime check lives in
 * `src/test/i18n.test.ts`.
 */

const ar = {
  "search.apiLoadFailed": "تعذر تحميل نتائج البحث الجغرافي",
  "search.inputError":
    "تحقق من الإحداثيات وإغلاق حلقة المضلع ثم أعد المحاولة.",
  "search.eyebrow": "EF-510 — اكتشاف العقارات",
  "search.title": "بحث جغرافي للخدمات المنشورة",
  "search.subtitle": "نفس المرشحات تغذي القائمة والتجمعات على الخريطة المصغرة.",
  "search.modeLabel": "النمط",
  "search.modeRadius": "نطاق حول نقطة",
  "search.modePolygon": "داخل مضلع",
  "search.modeBbox": "مربع الخريطة",
  "search.textSearchLabel": "بحث نصي",
  "search.propertyTypeLabel": "نوع العقار",
  "search.latLabel": "خط العرض",
  "search.lngLabel": "خط الطول",
  "search.radiusLabel": "نصف القطر كم",
  "search.polygonLabel": "حلقة المضلع بصيغة JSON",
  "search.bboxLabel": "المربع بصيغة JSON",
  "search.search": "بحث",
  "search.searching": "جارٍ البحث…",
  "search.mapTitle": "خريطة مصغرة",
  "search.clusterTitle": "{count} عقار",
  "search.mapEmpty": "شغّل البحث لعرض تجمعات النتائج.",
  "search.resultsTitle": "النتائج ({count})",
  "search.resultsNotLoaded": "لا توجد نتائج محملة بعد.",
  "search.resultsEmpty": "لا توجد عقارات منشورة ضمن النطاق.",
  "search.nextResults": "النتائج التالية",
};

const en: Record<keyof typeof ar, string> = {
  "search.apiLoadFailed": "Could not load geo search results",
  "search.inputError":
    "Check the coordinates and close the polygon ring, then try again.",
  "search.eyebrow": "EF-510 — Property discovery",
  "search.title": "Geo search for published listings",
  "search.subtitle":
    "The same filters feed the list and the clusters on the mini map.",
  "search.modeLabel": "Mode",
  "search.modeRadius": "Radius around a point",
  "search.modePolygon": "Inside a polygon",
  "search.modeBbox": "Map bounding box",
  "search.textSearchLabel": "Text search",
  "search.propertyTypeLabel": "Property type",
  "search.latLabel": "Latitude",
  "search.lngLabel": "Longitude",
  "search.radiusLabel": "Radius (km)",
  "search.polygonLabel": "Polygon ring as JSON",
  "search.bboxLabel": "Bounding box as JSON",
  "search.search": "Search",
  "search.searching": "Searching…",
  "search.mapTitle": "Mini map",
  "search.clusterTitle": "{count} properties",
  "search.mapEmpty": "Run a search to display result clusters.",
  "search.resultsTitle": "Results ({count})",
  "search.resultsNotLoaded": "No results loaded yet.",
  "search.resultsEmpty": "No published properties within the area.",
  "search.nextResults": "Next results",
};

export const searchMessages = { ar, en };
