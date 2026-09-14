import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, saveSession } from "../lib/api";

export default function Auth({ mode }: { mode: "login" | "signup" }) {
  const nav = useNavigate();
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
      setError(err instanceof Error ? err.message : "Could not continue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="landing">
      <header className="topbar">
        <Link to="/" className="brand">Aut<span>eur</span></Link>
      </header>
      <form className="auth-card" onSubmit={onSubmit}>
        <h1 className="page-title" style={{ fontSize: 36 }}>
          {mode === "signup" ? "Open the studio" : "Welcome back"}
        </h1>
        <p className="lede">No model names. No settings. Just what you want to make.</p>
        {mode === "signup" && (
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
        )}
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </div>
        {error && <p className="err">{error}</p>}
        <button className="btn" disabled={busy}>
          {busy ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
        </button>
        <p className="hint" style={{ marginTop: 16 }}>
          {mode === "signup" ? (
            <>Already here? <Link to="/login">Sign in</Link></>
          ) : (
            <>New? <Link to="/signup">Create an account</Link></>
          )}
        </p>
      </form>
    </div>
  );
}
