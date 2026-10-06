export type Theme = "light" | "dark";

const KEY = "auteur.theme";

function stored(): Theme | "" {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "";
  } catch {
    return "";
  }
}

function system(): Theme {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** The owner's choice if they made one, otherwise the device setting. */
export function currentTheme(): Theme {
  return stored() || system();
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function chooseTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Private mode: the choice lasts until reload.
  }
  applyTheme(theme);
}

/** Follow the device while the owner has not chosen. Returns an unsubscribe function. */
export function followSystem(onChange: (theme: Theme) => void) {
  if (typeof matchMedia !== "function") return () => {};
  const query = matchMedia("(prefers-color-scheme: light)");
  const handler = () => {
    if (stored()) return;
    const theme = system();
    applyTheme(theme);
    onChange(theme);
  };
  query.addEventListener("change", handler);
  return () => query.removeEventListener("change", handler);
}
