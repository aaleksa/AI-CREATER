import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ApiError, api, clearSession, type Me } from "../lib/api";
import LanguageSwitch from "./LanguageSwitch";
import ThemeSwitch from "./ThemeSwitch";
import { useLocale } from "../i18n/locale";

export default function AppLayout() {
  const nav = useNavigate();
  const location = useLocation();
  const { t } = useLocale();
  const [me, setMe] = useState<Me | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

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
      <aside className={`side${menuOpen ? " open" : ""}`}>
        <div className="brand">Aut<span>eur</span></div>
        <NavLink to="/app/billing" className="credits-top" aria-label={t("nav.creditsLabel")}>
          {t("nav.creditsLabel")}
          <b>{me?.credits ?? "—"}</b>
        </NavLink>
        <button
          type="button"
          className="menu-btn"
          aria-expanded={menuOpen}
          aria-label={t("nav.menu")}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? "✕" : "☰"}
        </button>
        <nav className="nav">
          <NavLink to="/app" end>{t("nav.create")}</NavLink>
          <NavLink to="/app/library">{t("nav.library")}</NavLink>
          <NavLink to="/app/brand">{t("nav.brand")}</NavLink>
          <NavLink to="/app/billing">{t("nav.credits")}</NavLink>
          {me?.isAdmin && <NavLink to="/app/admin">Database</NavLink>}
        </nav>
        <div className="side-foot">
          <NavLink to="/app/billing" className="credits-pill">
            {t("nav.creditsLabel")}
            <b>{me?.credits ?? "—"}</b>
          </NavLink>
          <div className="controls">
            <ThemeSwitch />
            <LanguageSwitch compact />
          </div>
          <NavLink to="/app/account" className="side-account" title={t("nav.account")}>
            <b>{me?.user.name}</b>
            <span>{t("nav.plan", { name: me?.subscription?.plan_name || "Free" })}</span>
            <span className="side-account-link">{t("nav.account")} →</span>
          </NavLink>
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
      <nav className="tabbar" aria-label={t("nav.menu")}>
        <NavLink to="/app" end><span aria-hidden>✦</span>{t("nav.create")}</NavLink>
        <NavLink to="/app/library"><span aria-hidden>▤</span>{t("nav.library")}</NavLink>
        <NavLink to="/app/brand"><span aria-hidden>◐</span>{t("nav.brand")}</NavLink>
        <NavLink to="/app/billing"><span aria-hidden>◈</span>{t("nav.credits")}</NavLink>
      </nav>
    </div>
  );
}
