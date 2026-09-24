"use client";

/**
 * EF-630 — client locale context. The locale is decided once (middleware +
 * root layout) and shared with every client component through this provider;
 * `useT()` is the single translation hook.
 */

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { translate, type MessageKey, type TranslationVars } from "./catalog";
import { DEFAULT_LOCALE, type Locale } from "./config";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({
  locale,
  children,
}: Readonly<{ locale: Locale; children: ReactNode }>) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export type ClientTranslator = (
  key: MessageKey,
  vars?: TranslationVars,
) => string;

export function useT(): ClientTranslator {
  const locale = useLocale();
  return (key, vars) => translate(locale, key, vars);
}
