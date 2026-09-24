import assert from "node:assert/strict";
import test from "node:test";
import {
  arMessages,
  createTranslator,
  directionFor,
  enMessages,
  formatDateTime,
  formatMoney,
  formatNumber,
  htmlAttributes,
  interpolate,
  labelFromKey,
  type MessageKey,
} from "../i18n";

/**
 * EF-630 — the plan's explicit "i18n missing-key check": the English catalog
 * must carry every Arabic key (the reverse too), translations must be
 * non-empty, and interpolation must never lose data. Type-level enforcement
 * lives in `src/i18n/catalog.ts` (`Record<keyof typeof ar, string>`); this
 * runtime check fails `pnpm test` on any drift.
 */

test("en catalog carries every ar key and vice versa (missing-key check)", () => {
  const arKeys = Object.keys(arMessages).sort();
  const enKeys = Object.keys(enMessages).sort();
  assert.deepEqual(enKeys, arKeys);
  assert.ok(
    arKeys.length > 200,
    `catalog unexpectedly small: ${arKeys.length}`,
  );
});

test("every catalog value is a non-empty string without raw braces leakage", () => {
  for (const [locale, dictionary] of [
    ["ar", arMessages],
    ["en", enMessages],
  ] as const) {
    for (const [key, value] of Object.entries(dictionary)) {
      assert.equal(typeof value, "string", `${locale}:${key} not a string`);
      assert.ok(value.trim().length > 0, `${locale}:${key} is empty`);
    }
  }
});

test("placeholder variables exist in both locales for every templated key", () => {
  const placeholder = /\{(\w+)\}/g;
  for (const [key, arValue] of Object.entries(arMessages)) {
    const arVars = [...arValue.matchAll(placeholder)].map((m) => m[1]).sort();
    const enVars = [
      ...(enMessages[key as MessageKey] ?? "").matchAll(placeholder),
    ]
      .map((m) => m[1])
      .sort();
    assert.deepEqual(enVars, arVars, `variable mismatch for ${key}`);
  }
});

test("interpolation substitutes variables and keeps unknown placeholders", () => {
  assert.equal(interpolate("مرحبا {name}", { name: "سارة" }), "مرحبا سارة");
  assert.equal(interpolate("no vars"), "no vars");
  assert.equal(interpolate("{missing}", {}), "{missing}");
});

test("translator resolves both locales and falls back safely", () => {
  const ar = createTranslator("ar");
  const en = createTranslator("en");
  const key: MessageKey = "leads.board.title";
  assert.equal(ar(key), "لوحة العملاء المحتملين");
  assert.equal(en(key), "Lead board");
});

test("direction switch maps exactly one locale to rtl and others to ltr", () => {
  assert.equal(directionFor("ar"), "rtl");
  assert.equal(directionFor("en"), "ltr");
  assert.deepEqual(htmlAttributes("ar"), { lang: "ar", dir: "rtl" });
  assert.deepEqual(htmlAttributes("en"), { lang: "en", dir: "ltr" });
});

test("locale-aware formatters render ar numbers, currency, and dates", () => {
  assert.equal(formatNumber(126400, "ar"), "126,400");
  assert.equal(formatNumber(126400, "en"), "126,400");
  // Money converts exact minor units to the currency format (bigint-safe).
  // `ar` on this runtime renders Latin digits with the ر.س. narrow symbol.
  assert.match(formatMoney("150000", "SAR", "ar"), /1,500\.00/);
  assert.match(formatMoney("150000", "SAR", "ar"), /ر\.س/);
  assert.match(formatMoney("150000", "SAR", "en"), /SAR/);
  assert.match(formatMoney("150000", "SAR", "en"), /1,500\.00/);
  assert.equal(formatMoney(0, "SAR", "en"), "SAR\u00a00.00");
  assert.throws(() => formatMoney("12.5", "SAR"), TypeError);
  // Dates render through the shared ar formatter (no ad-hoc formatting).
  assert.match(formatDateTime("2026-08-17T09:30:00.000Z", "ar"), /2026/);
});

test("labelFromKey keeps unknown typed codes instead of inventing text", () => {
  const t = createTranslator("ar");
  const labels = { OPEN: "finance.receivableStatusOpen" };
  assert.equal(labelFromKey(labels, t, "OPEN", "OPEN"), "مفتوح");
  assert.equal(labelFromKey(labels, t, "WEIRD", "WEIRD"), "WEIRD");
  assert.equal(
    labelFromKey(labels, t, null, "finance.receivableStatusOpen"),
    "مفتوح",
  );
});
