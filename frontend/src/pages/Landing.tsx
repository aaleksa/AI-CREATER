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
        You run a salon, café or gym. Write what you want — one sentence is usually enough,
        add more if you need to. Auteur finishes a 30-second Reel or still photos you can post.
      </p>
      <Link to="/signup" className="btn accent">Create a Reel</Link>
      <p className="hint" style={{ marginTop: 28 }}>
        First studio: Instagram Reels, TikTok, and still images. Ads and YouTube come next.
      </p>
    </div>
  );
}
