import { useEffect, useState } from "react";
import { chooseTheme, currentTheme, followSystem, type Theme } from "../lib/theme";
import { useLocale } from "../i18n/locale";

export default function ThemeSwitch() {
  const { t } = useLocale();
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => followSystem(setTheme), []);

  function pick(next: Theme) {
    chooseTheme(next);
    setTheme(next);
  }

  return (
    <div className="theme-switch" role="group" aria-label={t("theme.label")}>
      <button
        type="button"
        className={theme === "light" ? "on" : ""}
        aria-pressed={theme === "light"}
        aria-label={t("theme.light")}
        title={t("theme.light")}
        onClick={() => pick("light")}
      >
        ☀
      </button>
      <button
        type="button"
        className={theme === "dark" ? "on" : ""}
        aria-pressed={theme === "dark"}
        aria-label={t("theme.dark")}
        title={t("theme.dark")}
        onClick={() => pick("dark")}
      >
        ☾
      </button>
    </div>
  );
}
