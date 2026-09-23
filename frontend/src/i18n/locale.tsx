import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { en, type Messages } from "./en";
import { uk } from "./uk";
import { ERROR_UK } from "./errors";

export type Locale = "en" | "uk";
const KEY = "auteur.lang";
const catalogs: Record<Locale, Messages> = { en, uk };

function readStored(): Locale | null {
  const raw = localStorage.getItem(KEY);
  return raw === "uk" || raw === "en" ? raw : null;
}

export function detectLocale(): Locale {
  const stored = readStored();
  if (stored) return stored;
  const nav = typeof navigator !== "undefined" ? navigator.language : "en";
  return nav.toLowerCase().startsWith("uk") ? "uk" : "en";
}

export function currentLocale(): Locale {
  return detectLocale();
}

function lookup(messages: Messages, path: string): string {
  const value = path.split(".").reduce<unknown>((node, key) => {
    if (node && typeof node === "object" && key in node) return (node as Record<string, unknown>)[key];
    return undefined;
  }, messages);
  return typeof value === "string" ? value : path;
}

export function translate(locale: Locale, path: string, vars?: Record<string, string | number>) {
  let text = lookup(catalogs[locale] || en, path);
  if (vars) {
    for (const [key, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${key}}`, String(value));
    }
  }
  return text;
}

export function translateError(locale: Locale, message: string) {
  if (locale !== "uk") return message;
  return ERROR_UK[message] || message;
}

export function applyDocumentLocale(locale: Locale) {
  document.documentElement.lang = locale === "uk" ? "uk" : "en";
  document.title = translate(locale, "meta.title");
}

type Ctx = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (path: string, vars?: Record<string, string | number>) => string;
  te: (message: string) => string;
};

const LocaleContext = createContext<Ctx>({
  locale: "en",
  setLocale: () => undefined,
  t: (path, vars) => translate("en", path, vars),
  te: (message) => message,
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectLocale());
  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);
  const value = useMemo<Ctx>(() => {
    return {
      locale,
      setLocale: (next) => {
        localStorage.setItem(KEY, next);
        setLocaleState(next);
      },
      t: (path, vars) => translate(locale, path, vars),
      te: (message) => translateError(locale, message),
    };
  }, [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}

export function formatBrandHint(
  t: (path: string, vars?: Record<string, string | number>) => string,
  completeness?: { percent: number; nextKey?: string } | null
) {
  if (!completeness) return "";
  const next = completeness.nextKey ? t(`brand.next.${completeness.nextKey}`) : "";
  return next
    ? t("brand.completeNext", { percent: completeness.percent, next })
    : t("brand.complete", { percent: completeness.percent });
}
