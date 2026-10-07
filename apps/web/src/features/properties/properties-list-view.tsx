"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createApiClient, type ApiError } from "../../lib/api-client/index";
import { createSessionCsrfProvider } from "../../lib/api-client/session";
import { useT } from "../../i18n";
import type { MessageKey } from "../../i18n/catalog";
import { useOrganizationContext } from "../organization-context/organization-context";

/**
 * EF-201 — Arabic-first properties list and create for an organization.
 * Uses the web API client (CSRF-aware session provider) against the same
 * routes the generated `PropertyController_list` / `PropertyController_create`
 * client exposes: `organizations/{organizationId}/properties` (GET with
 * `search`/`cursor`/`limit` query, POST with the property DTO). The generated
 * client itself has no CSRF support, so the features' `apiClient.request`
 * calling convention is used, as in `csv-import-workspace.tsx`.
 */

const apiClient = createApiClient();
const sessionCsrfProvider = createSessionCsrfProvider(apiClient);

export type PropertyRow = Readonly<{
  id: string;
  title: string;
  propertyType: string;
  addressText: string;
  status: string;
}>;

export type PropertyCreateInput = Readonly<{
  title: string;
  propertyType: string;
  addressText: string;
  ownerReference: string;
  latitude: string;
  longitude: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeRow(value: unknown): PropertyRow | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  if (id.length === 0) return null;
  return {
    id,
    title: text(value.title),
    propertyType: text(value.propertyType),
    addressText: text(value.addressText),
    status: text(value.status),
  };
}

export function normalizePropertyPage(value: unknown): {
  items: readonly PropertyRow[];
  nextCursor: string | null;
} {
  const record = isRecord(value) ? value : {};
  const items = Array.isArray(record.items) ? record.items : [];
  return {
    items: items
      .map(normalizeRow)
      .filter((row): row is PropertyRow => row !== null),
    nextCursor:
      typeof record.nextCursor === "string" ? record.nextCursor : null,
  };
}

/** Domain rule: latitude and longitude are optional but both-or-neither. */
export function propertyFormError(
  input: PropertyCreateInput,
): MessageKey | null {
  if (
    input.title.trim().length === 0 ||
    input.propertyType.trim().length === 0 ||
    input.addressText.trim().length === 0
  ) {
    return "properties.create.required";
  }
  const hasLatitude = input.latitude.trim().length > 0;
  const hasLongitude = input.longitude.trim().length > 0;
  if (hasLatitude !== hasLongitude) {
    return "properties.create.coordinatePair";
  }
  if (hasLatitude && hasLongitude) {
    const latitude = Number(input.latitude);
    const longitude = Number(input.longitude);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return "properties.create.coordinateInvalid";
    }
  }
  return null;
}

/** Typed error mapping — statuses only, never the response body. */
export function describePropertyCreateError(error: unknown): MessageKey {
  const status = (error as ApiError | undefined)?.status;
  if (status === 401) return "properties.create.session";
  if (status === 403) return "properties.create.forbidden";
  if (status === 400) return "properties.create.validation";
  return "properties.create.generic";
}

export function buildCreateBody(
  input: PropertyCreateInput,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: input.title.trim(),
    propertyType: input.propertyType.trim(),
    addressText: input.addressText.trim(),
  };
  const ownerReference = input.ownerReference.trim();
  if (ownerReference.length > 0) body.ownerReference = ownerReference;
  const latitude = input.latitude.trim();
  const longitude = input.longitude.trim();
  if (latitude.length > 0 && longitude.length > 0) {
    body.latitude = Number(latitude);
    body.longitude = Number(longitude);
  }
  return body;
}

const EMPTY_FORM: PropertyCreateInput = {
  title: "",
  propertyType: "",
  addressText: "",
  ownerReference: "",
  latitude: "",
  longitude: "",
};

export function PropertiesListView() {
  const t = useT();
  const { organizationId } = useOrganizationContext();
  const [items, setItems] = useState<readonly PropertyRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState(false);
  const [form, setForm] = useState<PropertyCreateInput>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [formMessage, setFormMessage] = useState<{
    kind: "success" | "error" | "validation";
    text: string;
  } | null>(null);

  const base = `/ar/organizations/${encodeURIComponent(organizationId)}/properties`;

  const load = useCallback(
    async (cursor?: string) => {
      if (cursor) setLoadingMore(true);
      else setLoading(true);
      setListError(false);
      try {
        const query = new URLSearchParams();
        if (cursor) query.set("cursor", cursor);
        const value = await apiClient.request(
          `organizations/${encodeURIComponent(organizationId)}/properties` +
            (query.toString() ? `?${query}` : ""),
        );
        const page = normalizePropertyPage(value);
        setItems((current) =>
          cursor ? [...current, ...page.items] : page.items,
        );
        setNextCursor(page.nextCursor);
      } catch {
        setListError(true);
      } finally {
        if (cursor) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [organizationId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function update<K extends keyof PropertyCreateInput>(
    key: K,
    value: string,
  ): void {
    setForm((current) => ({ ...current, [key]: value }));
    setFormMessage(null);
  }

  async function submit(): Promise<void> {
    if (creating) return;
    const bound = propertyFormError(form);
    if (bound) {
      setFormMessage({ kind: "validation", text: t(bound) });
      return;
    }
    setCreating(true);
    setFormMessage(null);
    try {
      const csrfToken = await sessionCsrfProvider.getToken();
      await apiClient.request(
        `organizations/${encodeURIComponent(organizationId)}/properties`,
        { method: "POST", csrfToken, body: buildCreateBody(form) },
      );
      setForm(EMPTY_FORM);
      setFormMessage({
        kind: "success",
        text: t("properties.create.success"),
      });
      await load();
    } catch (error) {
      const status = (error as ApiError | undefined)?.status;
      if (status === 401 || status === 403) sessionCsrfProvider.clear();
      setFormMessage({
        kind: "error",
        text: t(describePropertyCreateError(error)),
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="list-grid" dir="rtl">
      <header>
        <p className="eyebrow">{t("properties.list.eyebrow")}</p>
        <h1>{t("properties.list.title")}</h1>
      </header>
      <div className="list-toolbar">
        <Link className="button button-secondary" href={`${base}/import`}>
          {t("properties.list.importLink")}
        </Link>
      </div>

      {listError ? (
        <p className="list-error" role="alert">
          {t("properties.list.loadFailed")}
        </p>
      ) : loading ? (
        <p className="list-meta">{t("properties.list.loading")}</p>
      ) : items.length === 0 ? (
        <p className="list-meta">{t("properties.list.empty")}</p>
      ) : (
        <>
          <ul className="list-rows" aria-label={t("properties.list.rowsAria")}>
            {items.map((property) => (
              <li key={property.id} className="list-row">
                <Link href={`${base}/${property.id}`}>
                  <strong>{property.title}</strong>
                </Link>
                <span>{property.propertyType}</span>
                <span>{property.addressText}</span>
              </li>
            ))}
          </ul>
          {nextCursor ? (
            <button
              type="button"
              className="button button-secondary"
              disabled={loadingMore}
              onClick={() => void load(nextCursor)}
            >
              {loadingMore
                ? t("properties.list.loading")
                : t("properties.list.loadMore")}
            </button>
          ) : null}
        </>
      )}

      <section aria-labelledby="property-create-title">
        <h2 id="property-create-title">{t("properties.create.title")}</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label htmlFor="property-create-title-input">
            {t("properties.create.field.title")}
          </label>
          <input
            id="property-create-title-input"
            value={form.title}
            onChange={(event) => update("title", event.target.value)}
          />
          <label htmlFor="property-create-type-input">
            {t("properties.create.field.propertyType")}
          </label>
          <input
            id="property-create-type-input"
            value={form.propertyType}
            onChange={(event) => update("propertyType", event.target.value)}
          />
          <label htmlFor="property-create-address-input">
            {t("properties.create.field.addressText")}
          </label>
          <input
            id="property-create-address-input"
            value={form.addressText}
            onChange={(event) => update("addressText", event.target.value)}
          />
          <label htmlFor="property-create-owner-input">
            {t("properties.create.field.ownerReference")}
          </label>
          <input
            id="property-create-owner-input"
            value={form.ownerReference}
            onChange={(event) => update("ownerReference", event.target.value)}
          />
          <label htmlFor="property-create-lat-input">
            {t("properties.create.field.latitude")}
          </label>
          <input
            id="property-create-lat-input"
            dir="ltr"
            value={form.latitude}
            onChange={(event) => update("latitude", event.target.value)}
          />
          <label htmlFor="property-create-lng-input">
            {t("properties.create.field.longitude")}
          </label>
          <input
            id="property-create-lng-input"
            dir="ltr"
            value={form.longitude}
            onChange={(event) => update("longitude", event.target.value)}
          />
          <p>{t("properties.create.coordinateHint")}</p>
          <button type="submit" disabled={creating}>
            {creating
              ? t("properties.create.pending")
              : t("properties.create.submit")}
          </button>
          {formMessage ? (
            <p
              role={formMessage.kind === "success" ? "status" : "alert"}
              className={
                formMessage.kind === "error" ? "list-error" : undefined
              }
            >
              {formMessage.text}
            </p>
          ) : null}
        </form>
      </section>
    </main>
  );
}
