import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
};

const IMAGE_KINDS = [
  {
    id: "photo",
    label: "Just a photo",
    hint: "Say what should be in the picture — we’ll add a bit of life around it.",
    example: "A quiet morning table at my café — steam, warm light, one empty chair.",
  },
  {
    id: "invite",
    label: "Invitation",
    hint: "Write the event as you would send it. We keep your words and make interesting pictures from them.",
    example: "Invite to Saturday 11am colour workshop at the salon. Friends welcome.",
  },
  {
    id: "info",
    label: "Information",
    hint: "Say the fact — and anything else you want in the pictures.",
    example: "We’re closed Monday 6 May. Back Tuesday 9am.",
  },
  {
    id: "offer",
    label: "Offer",
    hint: "Say the offer — and the look, the place, who it’s for.",
    example: "A warm photo post for my salon’s Tuesday walk-in offer.",
  },
] as const;

const IMAGE_EXAMPLES = IMAGE_KINDS.map((kind) => kind.example);

export default function Home() {
  const nav = useNavigate();
  const [type, setType] = useState("instagram_reel");
  const [imageIntent, setImageIntent] = useState("photo");
  const [prompt, setPrompt] = useState(EXAMPLES.instagram_reel);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [kitHint, setKitHint] = useState("");
  const selected = useMemo(() => FORMATS.find((f) => f.id === type), [type]);
  const kind = IMAGE_KINDS.find((item) => item.id === imageIntent) || IMAGE_KINDS[0];
  const isImage = type === "image_post";

  useEffect(() => {
    api
      .brand()
      .then((d) => {
        const progress = d.brandKit?.completeness;
        setKitHint(progress && progress.percent < 70 ? progress.hint : "");
      })
      .catch(() => setKitHint(""));
  }, []);

  async function start() {
    if (!selected?.ready) {
      setError("This format is next. Start with a Reel, TikTok, or still images.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { project } = await api.createProject(type, prompt, isImage ? imageIntent : undefined);
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
      <p className="lede">
        Pick a format. Write what you want. A sentence can be enough — but if the offer, the place or who it’s for
        matters, say that too.
      </p>
      {kitHint && (
        <p className="hint">
          {kitHint}. <Link to="/app/brand">Open brand kit</Link>
        </p>
      )}

      <div className="format-grid">
        {FORMATS.map((format) => (
          <button
            key={format.id}
            className={`format-card ${format.ready ? "" : "soon"} ${type === format.id ? "on" : ""}`}
            onClick={() => {
              setType(format.id);
              setError("");
              if (format.id === "image_post") {
                setImageIntent("photo");
                setPrompt(IMAGE_KINDS[0].example);
                return;
              }
              setPrompt(EXAMPLES[format.id] || prompt);
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

      {isImage && (
        <div className="image-kinds">
          <p className="hint">What kind of post?</p>
          <div className="choice-row kinds">
            {IMAGE_KINDS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`choice ${imageIntent === item.id ? "on" : ""}`}
                onClick={() => {
                  setImageIntent(item.id);
                  if (IMAGE_EXAMPLES.includes(prompt) || !prompt.trim()) {
                    setPrompt(item.example);
                  }
                }}
              >
                <b>{item.label}</b>
                <span>{item.hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="prompt-stage">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={2000}
          placeholder={
            isImage
              ? kind.hint
              : "Create a 30-second Reel about… Add the offer, the street, or who it’s for when a sentence isn’t enough."
          }
        />
        <div className="row">
          <span className="hint">
            {isImage
              ? `${kind.hint} We send the whole brief to OpenAI and get one finished picture. 13 credits · Free starts with 200`
              : "A sentence can be enough. Add more when you need to — offer, place, who it’s for (up to 2,000 characters). A Reel is 150 credits · image 13 · Free starts with 200"}
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
