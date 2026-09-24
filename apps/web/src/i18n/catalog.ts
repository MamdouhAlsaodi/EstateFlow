/**
 * EF-630 — merged translation catalog.
 *
 * Each `messages/*` module declares the Arabic source strings (`ar`) and the
 * complete English counterpart (`en`) with keys typed to match exactly:
 *
 *   en: Record<keyof typeof ar, string>
 *
 * so a missing English key is a TYPE-CHECK failure (`pnpm typecheck`, and
 * therefore `pnpm build`), and the runtime completeness of both maps is
 * enforced by `src/test/i18n.test.ts` (the plan's "i18n missing-key check").
 */

import type { Locale } from "./config";
import { adminMessages } from "./messages/admin";
import { automationMessages } from "./messages/automation";
import { campaignsMessages } from "./messages/campaigns";
import { commonMessages } from "./messages/common";
import { contentMessages } from "./messages/content";
import { contractsMessages } from "./messages/contracts";
import { financeMessages } from "./messages/finance";
import { leadsMessages } from "./messages/leads";
import { propertiesMessages } from "./messages/properties";
import { searchMessages } from "./messages/search";
import { viewingsMessages } from "./messages/viewings";

const ar = {
  ...commonMessages.ar,
  ...leadsMessages.ar,
  ...financeMessages.ar,
  ...contractsMessages.ar,
  ...contentMessages.ar,
  ...campaignsMessages.ar,
  ...automationMessages.ar,
  ...adminMessages.ar,
  ...viewingsMessages.ar,
  ...propertiesMessages.ar,
  ...searchMessages.ar,
};

/**
 * English catalog typed against the merged Arabic keys: any missing or
 * misspelled key across any feature namespace fails `pnpm typecheck`.
 */
const en: Record<keyof typeof ar, string> = {
  ...commonMessages.en,
  ...leadsMessages.en,
  ...financeMessages.en,
  ...contractsMessages.en,
  ...contentMessages.en,
  ...campaignsMessages.en,
  ...automationMessages.en,
  ...adminMessages.en,
  ...viewingsMessages.en,
  ...propertiesMessages.en,
  ...searchMessages.en,
};

export const arMessages: Readonly<Record<string, string>> = Object.freeze(ar);

export const enMessages: Readonly<Record<string, string>> = Object.freeze(en);

export type MessageKey = keyof typeof arMessages;

export type TranslationVars = Readonly<Record<string, string | number>>;

/** Substitutes `{name}` placeholders; unknown placeholders stay verbatim. */
export function interpolate(template: string, vars?: TranslationVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/**
 * Resolves a key in a locale. Missing keys fall back to the Arabic value,
 * then the key itself, and are reported in dev — never silently invented.
 */
export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: TranslationVars,
): string {
  const dictionary = locale === "en" ? enMessages : arMessages;
  const template = dictionary[key];
  if (typeof template === "string") return interpolate(template, vars);
  const fallback = arMessages[key];
  if (typeof fallback === "string") return interpolate(fallback, vars);
  if (process.env.NODE_ENV !== "production")
    console.error(`[i18n] missing message key: ${key}`);
  return key;
}

export type Translator = (key: MessageKey, vars?: TranslationVars) => string;

export function createTranslator(locale: Locale): Translator {
  return (key, vars) => translate(locale, key, vars);
}

/**
 * Resolves a typed-code label map (e.g. status enum -> message key) with a
 * catalog fallback; unknown codes keep the raw typed code so nothing is
 * ever invented.
 */
export function labelFromKey(
  labels: Readonly<Record<string, MessageKey>>,
  t: Translator,
  value: string | null | undefined,
  fallbackKey: MessageKey,
): string {
  if (!value) return t(fallbackKey);
  const key = labels[value];
  return key ? t(key) : value;
}
