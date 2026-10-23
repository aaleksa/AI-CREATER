import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, saveSession } from "../lib/api";
import LanguageSwitch from "../components/LanguageSwitch";
import ThemeSwitch from "../components/ThemeSwitch";
import PasswordInput from "../components/PasswordInput";
import { useLocale } from "../i18n/locale";

/** "Forgot password?" (ask for a letter) and the page the letter's link opens (set a new password). */
export default function PasswordReset({ mode }: { mode: "forgot" | "reset" }) {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { t, te } = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "reset" && password !== repeat) {
      setError(t("reset.mismatch"));
      return;
    }
    setBusy(true);
    try {
      if (mode === "forgot") {
        await api.forgotPassword(email);
        setSent(true);
      } else {
        const res = await api.resetPassword(params.get("token") || "", password);
        saveSession(res.token);
        nav("/app");
      }
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
        <span style={{ display: "inline-flex", gap: 8 }}><ThemeSwitch /><LanguageSwitch /></span>
      </header>
      <form className="auth-card" onSubmit={onSubmit}>
        <h1 className="page-title" style={{ fontSize: 36 }}>{t(mode === "forgot" ? "reset.forgotTitle" : "reset.newTitle")}</h1>
        {mode === "forgot" && sent ? (
          <p className="lede">{t("reset.sent", { email })}</p>
        ) : (
          <>
            <p className="lede">{t(mode === "forgot" ? "reset.forgotLede" : "reset.newLede")}</p>
            {mode === "forgot" ? (
              <div className="field">
                <label htmlFor="reset-email">{t("auth.email")}</label>
                <input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  autoCapitalize="off"
                  autoCorrect="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="reset-new">{t("reset.newPassword")}</label>
                  <PasswordInput id="reset-new" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
                </div>
                <div className="field">
                  <label htmlFor="reset-repeat">{t("reset.repeat")}</label>
                  <PasswordInput id="reset-repeat" value={repeat} onChange={(e) => setRepeat(e.target.value)} required minLength={6} autoComplete="new-password" />
                </div>
              </>
            )}
            {error && <p className="err">{error}</p>}
            <button className="btn" disabled={busy}>
              {busy ? t("auth.working") : t(mode === "forgot" ? "reset.send" : "reset.save")}
            </button>
          </>
        )}
        <p className="hint" style={{ marginTop: 16 }}>
          <Link to="/login">{t("reset.backToSignIn")}</Link>
        </p>
      </form>
    </div>
  );
}
