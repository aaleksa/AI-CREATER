import { useLocale } from "../i18n/locale";

export default function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useLocale();
  return (
    <div className={`lang-switch${compact ? " compact" : ""}`} role="group" aria-label={t("lang.label")}>
      <button type="button" className={locale === "en" ? "on" : ""} onClick={() => setLocale("en")}>
        {t("lang.en")}
      </button>
      <button type="button" className={locale === "uk" ? "on" : ""} onClick={() => setLocale("uk")}>
        {t("lang.uk")}
      </button>
    </div>
  );
}
