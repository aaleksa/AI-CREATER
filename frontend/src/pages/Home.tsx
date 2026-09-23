import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

const FORMATS = [
  { id: "video", emoji: "🎬", title: "Video", blurb: "A short film, decided for you.", ready: false },
  { id: "instagram_reel", emoji: "📱", title: "Instagram Reel", blurb: "30 seconds, vertical, finished.", ready: true },
  { id: "tiktok", emoji: "🎵", title: "TikTok", blurb: "Same studio, native pacing.", ready: true },
  { id: "image_post", emoji: "🖼️", title: "Image / Post", blurb: "Still photos. No voice, no video.", ready: true },
  { id: "advertisement", emoji: "📢", title: "Advertisement", blurb: "Coming after Reels.", ready: false },
  { id: "social_post", emoji: "✍️", title: "Social media post", blurb: "Coming after Reels.", ready: false },
];

const EXAMPLES: Record<string, string> = {
  instagram_reel: "Create a 30-second Reel about the best places to visit in London.",
  tiktok: "Make a TikTok promoting my coffee shop’s morning ritual.",
  image_post: "A warm photo post for my salon’s Tuesday walk-in offer.",
};

export default function Home() {
  const nav = useNavigate();
  const [type, setType] = useState("instagram_reel");
  const [prompt, setPrompt] = useState(EXAMPLES.instagram_reel);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = useMemo(() => FORMATS.find((f) => f.id === type), [type]);

  async function start() {
    if (!selected?.ready) {
      setError("This format is next. Start with a Reel, TikTok, or still images.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { project } = await api.createProject(type, prompt);
      nav(`/app/studio/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hero-home">
      <p className="hint">The studio</p>
      <h1 style={{ fontSize: "clamp(40px, 6vw, 64px)" }}>What do you want to create?</h1>
      <p className="lede">Pick a format. Write what you want. A sentence can be enough — but if the offer, the place or who it’s for matters, say that too.</p>

      <div className="format-grid">
        {FORMATS.map((format) => (
          <button
            key={format.id}
            className={`format-card ${format.ready ? "" : "soon"} ${type === format.id ? "on" : ""}`}
            onClick={() => {
              setType(format.id);
              setPrompt(EXAMPLES[format.id] || prompt);
              setError("");
            }}
            style={type === format.id && format.ready ? { borderColor: "var(--accent-2)" } : undefined}
          >
            <div className="emoji">{format.emoji}</div>
            <div>
              <h3>{format.title}</h3>
              <p>{format.ready ? format.blurb : "Not in the first studio"}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="prompt-stage">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={2000}
          placeholder="Create a 30-second Reel about… Add the offer, the street, or who it’s for when a sentence isn’t enough."
        />
        <div className="row">
          <span className="hint">
            A sentence can be enough. Add more when you need to — offer, place, who it’s for (up to 2,000 characters). A Reel is 150 credits · stills are 37 · Free starts with 200
          </span>
          <button className="btn accent" onClick={start} disabled={busy}>
            {busy ? "Opening studio…" : `Continue with ${selected?.title}`}
          </button>
        </div>
        {error && <p className="err">{error}</p>}
      </div>
    </div>
  );
}
