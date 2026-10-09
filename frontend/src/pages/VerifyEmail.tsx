import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, hasSession } from "../lib/api";
import LanguageSwitch from "../components/LanguageSwitch";
import ThemeSwitch from "../components/ThemeSwitch";
import { useLocale } from "../i18n/locale";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const { t, te } = useLocale();
  const [state, setState] = useState<"checking" | "done" | "failed">("checking");
  const [error, setError] = useState("");
  const sent = useRef(false);

  useEffect(() => {
    // The link works once; StrictMode runs effects twice in dev.
    if (sent.current) return;
    sent.current = true;
    api
      .verifyEmail(params.get("token") || "")
      .then(() => setState("done"))
      .catch((err) => {
        setError(err instanceof Error ? te(err.message) : t("auth.fallback"));
        setState("failed");
      });
  }, [params, t, te]);

  const next = hasSession() ? (
    <Link to="/app" className="btn">{t("verify.openStudio")}</Link>
  ) : (
    <Link to="/login" className="btn">{t("verify.signIn")}</Link>
  );

  return (
    <div className="landing">
      <header className="topbar">
        <Link to="/" className="brand">Aut<span>eur</span></Link>
        <span style={{ display: "inline-flex", gap: 8 }}><ThemeSwitch /><LanguageSwitch /></span>
      </header>
      <div className="auth-card">
        {state === "checking" && <p className="lede">{t("verify.checking")}</p>}
        {state === "done" && (
          <>
            <h1 className="page-title" style={{ fontSize: 36 }}>{t("verify.doneTitle")}</h1>
            <p className="lede">{t("verify.done")}</p>
            {next}
          </>
        )}
        {state === "failed" && (
          <>
            <h1 className="page-title" style={{ fontSize: 36 }}>{t("verify.failTitle")}</h1>
            <p className="err">{error}</p>
            {next}
          </>
        )}
      </div>
    </div>
  );
}
