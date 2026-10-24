import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import Breadcrumbs, { BreadcrumbProvider } from "./Breadcrumbs";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, api, clearSession, type Me } from "../lib/api";
import LanguageSwitch from "./LanguageSwitch";
import ThemeSwitch from "./ThemeSwitch";
import { useLocale } from "../i18n/locale";

function VerifyBanner({ email }: { email: string }) {
  const { t, te } = useLocale();
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);

  async function confirmCode(e: FormEvent) {
    e.preventDefault();
    setChecking(true);
    setError("");
    try {
      await api.verifyEmailCode(code);
      window.dispatchEvent(new Event("auteur:refresh"));
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("auth.fallback"));
    } finally {
      setChecking(false);
    }
  }

  async function resend() {
    setStatus("sending");
    setError("");
    try {
      const { verified } = await api.resendVerification();
      if (verified) window.dispatchEvent(new Event("auteur:refresh"));
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("auth.fallback"));
      setStatus("idle");
    }
  }

  return (
    <div className="verify-banner" role="status">
      <span>{t("verify.banner", { email })}</span>
      <form className="verify-code" onSubmit={confirmCode}>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          placeholder={t("verify.codePlaceholder")}
          aria-label={t("verify.codeLabel")}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^0-9 ]/g, ""))}
        />
        <button type="submit" className="btn" disabled={checking || code.replace(/\D/g, "").length !== 6}>
          {checking ? t("verify.checking") : t("verify.codeSubmit")}
        </button>
      </form>
      {status === "sent" ? (
        <span className="hint">{t("verify.sent")}</span>
      ) : (
        <button type="button" className="btn ghost" onClick={resend} disabled={status === "sending"}>
          {status === "sending" ? t("verify.sending") : t("verify.resend")}
        </button>
      )}
      {error && <span className="err">{error}</span>}
    </div>
  );
}

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

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as Element | null)?.closest?.(".side")) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menuOpen]);

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
          {me?.isAdmin && (
            <NavLink to="/app/admin" className="admin-link">
              Database
            </NavLink>
          )}
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
        {me && me.emailVerified === false && <VerifyBanner email={me.user.email} />}
        <BreadcrumbProvider>
          <Breadcrumbs />
          <Outlet context={{ me, setMe }} />
        </BreadcrumbProvider>
      </main>
      <nav className="tabbar" aria-label={t("nav.menu")}>
        <NavLink to="/app" end className={({ isActive }) => (isActive || location.pathname.startsWith("/app/studio") ? "active" : "")}>
          <span aria-hidden>✦</span>
          {t("nav.create")}
        </NavLink>
        <NavLink to="/app/library"><span aria-hidden>▤</span>{t("nav.library")}</NavLink>
        <NavLink to="/app/brand"><span aria-hidden>◐</span>{t("nav.brand")}</NavLink>
        <NavLink to="/app/billing"><span aria-hidden>◈</span>{t("nav.credits")}</NavLink>
      </nav>
    </div>
  );
}
