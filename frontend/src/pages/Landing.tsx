import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="landing">
      <header className="topbar">
        <div className="brand">Aut<span>eur</span></div>
        <div className="row">
          <Link to="/login" className="btn ghost">Sign in</Link>
          <Link to="/signup" className="btn">Start creating</Link>
        </div>
      </header>
      <h1>Tell us what you want to create. We’ll do the rest.</h1>
      <p className="lede">
        You don’t pick a model, a prompt stack, or a voice engine. You say
        “a 30-second Reel about the best places in London” — Auteur writes,
        shoots, speaks, captions, and finishes it.
      </p>
      <Link to="/signup" className="btn accent">Create a Reel</Link>
      <p className="hint" style={{ marginTop: 28 }}>
        First studio: Instagram Reels & TikTok. Posts, ads and YouTube come next.
      </p>
    </div>
  );
}
