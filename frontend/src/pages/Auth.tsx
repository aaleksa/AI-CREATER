import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, saveSession } from "../lib/api";
import LanguageSwitch from "../components/LanguageSwitch";
import { useLocale } from "../i18n/locale";

export default function Auth({ mode }: { mode: "login" | "signup" }) {
  const nav = useNavigate();
  const { t, te } = useLocale();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res =
        mode === "signup"
          ? await api.signup({ name, email, password })
          : await api.login({ email, password });
      saveSession(res.token);
      nav("/app");
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("auth.fallback"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="landing">
      <header className="topbar">
        <Link to="/" className="brand">Aut<span>eur</span></Link>
        <LanguageSwitch />
      </header>
      <form className="auth-card" onSubmit={onSubmit}>
        <h1 className="page-title" style={{ fontSize: 36 }}>
          {mode === "signup" ? t("auth.signupTitle") : t("auth.loginTitle")}
        </h1>
        <p className="lede">{t("auth.lede")}</p>
        {mode === "signup" && (
          <div className="field">
            <label>{t("auth.name")}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
        )}
        <div className="field">
          <label>{t("auth.email")}</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>{t("auth.password")}</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </div>
        {error && <p className="err">{error}</p>}
        <button className="btn" disabled={busy}>
          {busy ? t("auth.working") : mode === "signup" ? t("auth.createAccount") : t("auth.signIn")}
        </button>
        <p className="hint" style={{ marginTop: 16 }}>
          {mode === "signup" ? (
            <>{t("auth.haveAccount")} <Link to="/login">{t("auth.signIn")}</Link></>
          ) : (
            <>{t("auth.newHere")} <Link to="/signup">{t("auth.createLink")}</Link></>
          )}
        </p>
      </form>
    </div>
  );
}
