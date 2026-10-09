import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, clearSession, fetchMedia, refreshMe, saveSession, type Me } from "../lib/api";
import { useLocale } from "../i18n/locale";
import PasswordInput from "../components/PasswordInput";

type Note = { kind: "ok" | "err"; text: string } | null;

function NoteLine({ note }: { note: Note }) {
  if (!note) return null;
  return <p className={note.kind === "ok" ? "ok" : "err"} role={note.kind === "ok" ? "status" : "alert"}>{note.text}</p>;
}

export default function Account() {
  const nav = useNavigate();
  const { t, te, locale } = useLocale();
  const [me, setMe] = useState<Me | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [profileNote, setProfileNote] = useState<Note>(null);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [passwordNote, setPasswordNote] = useState<Note>(null);

  const [dataNote, setDataNote] = useState<Note>(null);
  const [sessionNote, setSessionNote] = useState<Note>(null);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteNote, setDeleteNote] = useState<Note>(null);
  const [busy, setBusy] = useState("");

  function load() {
    return api.me().then((data) => {
      setMe(data);
      setName(data.user.name);
      setEmail(data.user.email);
    });
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  const emailChanged = me ? email.trim().toLowerCase() !== me.user.email : false;
  const profileDirty = me ? name.trim() !== me.user.name || emailChanged : false;

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileNote(null);
    setBusy("profile");
    try {
      const { token, user } = await api.updateProfile({
        name: name.trim(),
        email: email.trim(),
        currentPassword: emailChanged ? emailPassword : undefined,
      });
      saveSession(token);
      setEmailPassword("");
      setMe((m) => (m ? { ...m, user: { ...m.user, ...user } } : m));
      setName(user.name);
      setEmail(user.email);
      refreshMe();
      setProfileNote({ kind: "ok", text: t("account.profileSaved") });
    } catch (err) {
      setProfileNote({ kind: "err", text: err instanceof Error ? te(err.message) : t("account.fallback") });
    } finally {
      setBusy("");
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordNote(null);
    if (next !== again) {
      setPasswordNote({ kind: "err", text: t("account.passwordMismatch") });
      return;
    }
    setBusy("password");
    try {
      const { token } = await api.changePassword(current, next);
      saveSession(token);
      setCurrent("");
      setNext("");
      setAgain("");
      setPasswordNote({ kind: "ok", text: t("account.passwordSaved") });
    } catch (err) {
      setPasswordNote({ kind: "err", text: err instanceof Error ? te(err.message) : t("account.fallback") });
    } finally {
      setBusy("");
    }
  }

  async function downloadData() {
    setDataNote(null);
    setBusy("data");
    try {
      const blob = await fetchMedia("/auth/export");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "auteur-export.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDataNote({ kind: "ok", text: t("account.dataReady") });
    } catch (err) {
      setDataNote({ kind: "err", text: err instanceof Error ? te(err.message) : t("account.fallback") });
    } finally {
      setBusy("");
    }
  }

  function signOut() {
    clearSession();
    nav("/");
  }

  async function signOutEverywhere() {
    if (!window.confirm(t("account.everywhereConfirm"))) return;
    setSessionNote(null);
    setBusy("everywhere");
    try {
      await api.logoutAll();
      clearSession();
      nav("/login");
    } catch (err) {
      setSessionNote({ kind: "err", text: err instanceof Error ? te(err.message) : t("account.fallback") });
      setBusy("");
    }
  }

  async function removeAccount(e: FormEvent) {
    e.preventDefault();
    setDeleteNote(null);
    if (!window.confirm(t("account.deleteConfirm"))) return;
    setBusy("delete");
    try {
      await api.deleteAccount(deletePassword);
      clearSession();
      nav("/");
    } catch (err) {
      setDeleteNote({ kind: "err", text: err instanceof Error ? te(err.message) : t("account.deleteFail") });
      setBusy("");
    }
  }

  const since = me?.user.created_at
    ? new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", { dateStyle: "long" }).format(
        new Date(me.user.created_at.replace(" ", "T") + "Z")
      )
    : "";

  return (
    <div className="account">
      <h1 className="page-title" style={{ fontSize: 48 }}>{t("account.title")}</h1>
      <p className="lede">{t("account.lede")}</p>

      <section className="panel account-panel">
        <h2>{t("account.plan")}</h2>
        <p>
          <b>{t("nav.plan", { name: me?.subscription?.plan_name || "Free" })}</b> · {me?.credits ?? "—"} {t("account.credits")}
        </p>
        {since && <p className="hint">{t("account.since", { date: since })}</p>}
        <Link className="btn ghost" style={{ marginTop: 12 }} to="/app/billing">{t("account.openBilling")}</Link>
      </section>

      <form className="panel account-panel" onSubmit={saveProfile}>
        <h2>{t("account.profile")}</h2>
        <div className="field">
          <label htmlFor="acc-name">{t("account.name")}</label>
          <input id="acc-name" value={name} maxLength={80} autoComplete="name" onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="acc-email">{t("account.email")}</label>
          <input id="acc-email" type="email" value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
        </div>
        {emailChanged && (
          <div className="field">
            <label htmlFor="acc-email-pass">{t("account.currentPassword")}</label>
            <p className="hint">{t("account.emailNeedsPassword")}</p>
            <PasswordInput
              id="acc-email-pass"
              value={emailPassword}
              autoComplete="current-password"
              onChange={(e) => setEmailPassword(e.target.value)}
            />
          </div>
        )}
        <NoteLine note={profileNote} />
        <button className="btn" disabled={!profileDirty || busy === "profile" || (emailChanged && !emailPassword)}>
          {t("account.saveProfile")}
        </button>
      </form>

      <form className="panel account-panel" onSubmit={savePassword}>
        <h2>{t("account.password")}</h2>
        <p className="hint">{t("account.passwordHint")}</p>
        <div className="field">
          <label htmlFor="acc-cur">{t("account.currentPassword")}</label>
          <PasswordInput id="acc-cur" value={current} autoComplete="current-password" onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="acc-new">{t("account.newPassword")}</label>
          <PasswordInput id="acc-new" value={next} minLength={6} autoComplete="new-password" onChange={(e) => setNext(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="acc-again">{t("account.repeatPassword")}</label>
          <PasswordInput id="acc-again" value={again} minLength={6} autoComplete="new-password" onChange={(e) => setAgain(e.target.value)} />
        </div>
        <NoteLine note={passwordNote} />
        <button className="btn" disabled={!current || !next || !again || busy === "password"}>
          {t("account.savePassword")}
        </button>
      </form>

      <section className="panel account-panel">
        <h2>{t("account.data")}</h2>
        <p className="hint">{t("account.dataHint")}</p>
        <NoteLine note={dataNote} />
        <button className="btn ghost" type="button" style={{ marginTop: 12 }} disabled={busy === "data"} onClick={downloadData}>
          {t("account.download")}
        </button>
      </section>

      <section className="panel account-panel">
        <h2>{t("account.sessions")}</h2>
        <p className="hint">{t("account.sessionsHint")}</p>
        <NoteLine note={sessionNote} />
        <div className="action-row" style={{ marginTop: 12 }}>
          <button className="btn ghost" type="button" onClick={signOut}>{t("nav.signOut")}</button>
          <button className="btn ghost" type="button" disabled={busy === "everywhere"} onClick={signOutEverywhere}>
            {t("account.signOutEverywhere")}
          </button>
        </div>
      </section>

      <form className="panel account-panel danger-zone" onSubmit={removeAccount}>
        <h2>{t("account.danger")}</h2>
        <p className="hint">{t("account.deleteHint")}</p>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="acc-del">{t("account.deletePassword")}</label>
          <PasswordInput
            id="acc-del"
            value={deletePassword}
            autoComplete="current-password"
            onChange={(e) => setDeletePassword(e.target.value)}
          />
        </div>
        <NoteLine note={deleteNote} />
        <button className="btn ghost danger" disabled={!deletePassword || busy === "delete"}>
          {t("account.delete")}
        </button>
      </form>
    </div>
  );
}
