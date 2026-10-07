import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { arMessages, enMessages } from "../i18n/catalog";
import {
  describePropertyCreateError,
  propertyFormError,
} from "../features/properties/properties-list-view";

const root = new URL("../", import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, root), "utf8");
}

test("properties list route is organization-scoped without fallback identity", async () => {
  const route = await source(
    "app/ar/organizations/[organizationId]/properties/page.tsx",
  );
  assert.match(route, /params/);
  assert.match(route, /organizationId/);
  assert.match(route, /PropertiesListView/);
  assert.doesNotMatch(
    route,
    /fallback|demo-org|defaultOrganization|organizationId\s*\|\|/i,
  );
});

test("list view follows the sibling client-feature pattern (api client + CSRF + i18n)", async () => {
  const view = await source("features/properties/properties-list-view.tsx");
  assert.match(view, /"use client"/);
  assert.match(view, /createApiClient/);
  assert.match(view, /createSessionCsrfProvider/);
  assert.match(view, /useOrganizationContext/);
  assert.match(view, /useT/);
  // No raw fetch, no destructive flows (non-goals).
  assert.doesNotMatch(view, /fetch\s*\(/);
  assert.doesNotMatch(
    view,
    /\bDELETE\b|archive|updateProperty|PropertyController_update/i,
  );
});

test("list view calls the properties collection route matching the generated client contract", async () => {
  const view = await source("features/properties/properties-list-view.tsx");
  assert.match(
    view,
    /organizations\/\$\{encodeURIComponent\(organizationId\)\}\/properties/,
  );
  assert.match(view, /method: "POST"/);
  assert.match(view, /csrfToken/);
});

test("rows link to the detail page and import page relative to the org route", async () => {
  const view = await source("features/properties/properties-list-view.tsx");
  assert.match(view, /Link/);
  assert.match(view, /\/import/);
  assert.match(
    view,
    /\/ar\/organizations\/\$\{encodeURIComponent\(organizationId\)\}\/properties/,
  );
  assert.match(view, /\$\{property\.id\}/);
});

test("create form renders title, propertyType, addressText, ownerReference, and coordinates", async () => {
  const view = await source("features/properties/properties-list-view.tsx");
  assert.match(view, /propertyFormError/);
  for (const field of [
    "title",
    "propertyType",
    "addressText",
    "ownerReference",
    "latitude",
    "longitude",
  ]) {
    assert.ok(
      view.includes(field),
      `expected create form to reference ${field}`,
    );
  }
});

test("coordinate guard requires both latitude and longitude or neither", () => {
  assert.equal(
    propertyFormError({
      title: "villa",
      propertyType: "VILLA",
      addressText: "Riyadh",
      ownerReference: "",
      latitude: "",
      longitude: "",
    }),
    null,
  );
  assert.equal(
    propertyFormError({
      title: "villa",
      propertyType: "VILLA",
      addressText: "Riyadh",
      ownerReference: "",
      latitude: "24.7",
      longitude: "",
    }),
    "properties.create.coordinatePair",
  );
  assert.equal(
    propertyFormError({
      title: "villa",
      propertyType: "VILLA",
      addressText: "Riyadh",
      ownerReference: "",
      latitude: "",
      longitude: "46.7",
    }),
    "properties.create.coordinatePair",
  );
});

test("create form validation rejects missing required fields", () => {
  assert.equal(
    propertyFormError({
      title: "  ",
      propertyType: "VILLA",
      addressText: "Riyadh",
      ownerReference: "",
      latitude: "",
      longitude: "",
    }),
    "properties.create.required",
  );
  assert.equal(
    propertyFormError({
      title: "villa",
      propertyType: "",
      addressText: "Riyadh",
      ownerReference: "",
      latitude: "",
      longitude: "",
    }),
    "properties.create.required",
  );
  assert.equal(
    propertyFormError({
      title: "villa",
      propertyType: "VILLA",
      addressText: " ",
      ownerReference: "",
      latitude: "",
      longitude: "",
    }),
    "properties.create.required",
  );
  assert.equal(
    propertyFormError({
      title: "villa",
      propertyType: "VILLA",
      addressText: "Riyadh",
      ownerReference: "",
      latitude: "abc",
      longitude: "46.7",
    }),
    "properties.create.coordinateInvalid",
  );
});

test("typed error mapping by status only — never the payload", () => {
  assert.equal(
    describePropertyCreateError({ status: 403 }),
    "properties.create.forbidden",
  );
  assert.equal(
    describePropertyCreateError({ status: 401 }),
    "properties.create.session",
  );
  assert.equal(
    describePropertyCreateError({ status: 400 }),
    "properties.create.validation",
  );
  assert.equal(
    describePropertyCreateError({ status: 500 }),
    "properties.create.generic",
  );
  assert.equal(
    describePropertyCreateError(undefined),
    "properties.create.generic",
  );
});

test("error mapping never echoes the response payload", async () => {
  const view = await source("features/properties/properties-list-view.tsx");
  assert.doesNotMatch(view, /error\.message|String\(error\)|error\.details/i);
});

test("arabic catalog keys for the properties list/create flow are complete in ar and en", () => {
  const prefixes = ["properties.list.", "properties.create."];
  const keys = Object.keys(arMessages).filter((key) =>
    prefixes.some((prefix) => key.startsWith(prefix)),
  );
  assert.ok(
    keys.length >= 12,
    `expected a real catalog set, got ${keys.length}`,
  );
  for (const key of keys) {
    assert.ok(key in enMessages, `missing en catalog key for ${key}`);
    assert.ok(arMessages[key] && arMessages[key].length > 0);
    assert.ok(enMessages[key] && enMessages[key].length > 0);
  }
});
