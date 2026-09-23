import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ApiError, api, clearSession, type Me } from "../lib/api";
import LanguageSwitch from "./LanguageSwitch";
import { useLocale } from "../i18n/locale";

export default function AppLayout() {
  const nav = useNavigate();
  const location = useLocation();
  const { t } = useLocale();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    function load() {
      api.me().then(setMe).catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          clearSession();
          nav("/login");
        }
      });
    }
    load();
    window.addEventListener("auteur:refresh", load);
    return () => window.removeEventListener("auteur:refresh", load);
  }, [nav, location.pathname]);

  return (
    <div className="app-shell">
      <aside className="side">
        <div className="brand">Aut<span>eur</span></div>
        <nav className="nav">
          <NavLink to="/app" end>{t("nav.create")}</NavLink>
          <NavLink to="/app/library">{t("nav.library")}</NavLink>
          <NavLink to="/app/brand">{t("nav.brand")}</NavLink>
          <NavLink to="/app/billing">{t("nav.credits")}</NavLink>
        </nav>
        <div className="side-foot">
          <LanguageSwitch compact />
          <div className="credits-pill">
            {t("nav.creditsLabel")} <b>{me?.credits ?? "—"}</b>
          </div>
          <div>{me?.user.name}</div>
          <div>{t("nav.plan", { name: me?.subscription?.plan_name || "Free" })}</div>
          <button
            type="button"
            className="ghost-link"
            onClick={() => {
              clearSession();
              nav("/");
            }}
          >
            {t("nav.signOut")}
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet context={{ me, setMe }} />
      </main>
    </div>
  );
}
