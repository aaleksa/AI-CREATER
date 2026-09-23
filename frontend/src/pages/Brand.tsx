import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fetchMedia, type BrandKitRow } from "../lib/api";

const TONES = [
  { id: "warm", label: "Warm & friendly", text: "Warm and friendly. Like a regular, not an ad." },
  { id: "professional", label: "Professional & polished", text: "Professional and polished. Clear, short, never stiff." },
  { id: "playful", label: "Fun & playful", text: "Fun and playful. Light. Never try-hard." },
  { id: "calm", label: "Calm & minimal", text: "Calm and minimal. Unhurried. Quiet, not luxury-speak." },
];

const TYPES = [
  { id: "salon", label: "Salon", hint: "The chair, the cut — not stock hair." },
  { id: "cafe", label: "Café", hint: "The pour, the room — not a latte cliché." },
  { id: "fitness", label: "Fitness", hint: "The third set — not a gym advert." },
  { id: "other", label: "Something else", hint: "Optional. Only steers the story, not ads." },
];

const FONTS = ["Fraunces", "Outfit", "Playfair Display", "IBM Plex Sans"];

const empty = {
  business_name: "",
  logo_url: "",
  primary_color: "#C45C26",
  secondary_color: "#F4EFE8",
  font: "Fraunces",
  tone_of_voice: TONES[0].text,
  tone_note: "",
  website: "",
  instagram: "",
  vertical: "",
  vertical_note: "",
};

function applyKit(kit: BrandKitRow) {
  const hex = (value: string | undefined, fallback: string) =>
    value && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : fallback;
  return {
    business_name: kit.business_name || "",
    logo_url: kit.logo_url || "",
    primary_color: hex(kit.primary_color, "#C45C26"),
    secondary_color: hex(kit.secondary_color, "#F4EFE8"),
    font: kit.font || "Fraunces",
    tone_of_voice: kit.tone_of_voice || TONES[0].text,
    tone_note: kit.tone_note || "",
    website: kit.website || "",
    instagram: kit.instagram || "",
    vertical: kit.vertical || "",
    vertical_note: kit.vertical_note || "",
  };
}

export default function Brand() {
  const [form, setForm] = useState(empty);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [learnedFrom, setLearnedFrom] = useState(0);
  const [learnedLines, setLearnedLines] = useState<string[]>([]);
  const [readyProjects, setReadyProjects] = useState(0);
  const [hint, setHint] = useState("");
  const [logoSrc, setLogoSrc] = useState("");
  const [ownNote, setOwnNote] = useState(false);

  function apply(kit: BrandKitRow) {
    setForm(applyKit(kit));
    setLearnedFrom(kit.learned_summary?.basedOnProjects || 0);
    setLearnedLines(kit.learned_lines || []);
    setReadyProjects(kit.ready_projects || 0);
    setHint(kit.completeness?.hint || "");
    setOwnNote(Boolean(kit.tone_note));
  }

  useEffect(() => {
    api.brand().then((d) => {
      if (!d.brandKit) return;
      apply(d.brandKit);
    });
  }, []);

  useEffect(() => {
    if (form.logo_url !== "/brand/logo") {
      setLogoSrc(form.logo_url.startsWith("http") ? form.logo_url : "");
      return;
    }
    let url = "";
    fetchMedia("/brand/logo")
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setLogoSrc(url);
      })
      .catch(() => setLogoSrc(""));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [form.logo_url]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const instagram = form.instagram.trim().replace(/^@+/, "");
      const { brandKit } = await api.saveBrand({
        ...form,
        instagram: instagram ? `@${instagram}` : "",
        website: form.website.trim(),
      });
      apply(brandKit);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  async function onLogo(file: File | undefined) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("That file is too large. Keep it under 2 MB.");
      return;
    }
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setError("Use a PNG or JPG under 2 MB. SVG is not allowed.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const { brandKit } = await api.uploadLogo(String(reader.result || ""));
        apply(brandKit);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not upload the logo.");
      }
    };
    reader.readAsDataURL(file);
  }

  async function resetLearning() {
    if (!window.confirm("Recalculate what Auteur learned from the Reels you already finished?")) return;
    try {
      const { brandKit } = await api.resetLearning();
      apply(brandKit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset learning.");
    }
  }

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const tone = TONES.find((item) => item.text === form.tone_of_voice);

  return (
    <div>
      <h1 className="page-title" style={{ fontSize: 48 }}>Brand kit</h1>
      <p className="lede">
        Colours, type and tone change every Reel. Name, logo and Instagram can wait.
      </p>
      {hint && <p className="hint" style={{ marginTop: 12 }}>{hint}</p>}

      {(learnedFrom >= 3 || readyProjects >= 3) && (
        <div className="panel" style={{ marginTop: 20, maxWidth: 920 }}>
          <p className="ok">
            {learnedFrom >= 3
              ? `Auteur has learned from ${learnedFrom} of your Reels`
              : "Auteur can learn from the Reels you already finished"}
          </p>
          <p className="lede" style={{ marginTop: 8 }}>
            {learnedLines.length
              ? learnedLines.join(" · ")
              : readyProjects >= 3
                ? "Reset recalculates from those Reels now — you don’t wait for three new ones."
                : "Keep using Try again with a reason — that is how it learns."}
          </p>
          <button className="btn ghost" type="button" style={{ marginTop: 12 }} onClick={resetLearning}>
            Reset learning
          </button>
          <p className="hint" style={{ marginTop: 8 }}>
            Recalculates from finished Reels you already have. If you have fewer than three, the card stays empty until you do.
          </p>
        </div>
      )}

      <div className="brand-layout">
        <form className="panel" onSubmit={onSubmit}>
          <h2>How it looks & sounds</h2>
          <p className="hint">This is what Auteur uses on every Reel. Worth getting right.</p>
          <div className="field">
            <label>Colours</label>
            <p className="hint">Main colour grades the pictures. Soft colour is the paper and the quiet space.</p>
            <div className="color-row">
              <div>
                <span className="hint">Main</span>
                <div className="color-row">
                  <input type="color" value={form.primary_color} onChange={(e) => set("primary_color", e.target.value)} />
                  <input value={form.primary_color} onChange={(e) => set("primary_color", e.target.value)} />
                </div>
              </div>
              <div>
                <span className="hint">Soft</span>
                <div className="color-row">
                  <input type="color" value={form.secondary_color} onChange={(e) => set("secondary_color", e.target.value)} />
                  <input value={form.secondary_color} onChange={(e) => set("secondary_color", e.target.value)} />
                </div>
              </div>
            </div>
          </div>
          <div className="field">
            <label htmlFor="font">Title type</label>
            <p className="hint">Steers how titles are imagined. The mp4 does not embed the font file yet.</p>
            <select id="font" value={form.font} onChange={(e) => set("font", e.target.value)}>
              {FONTS.map((font) => (
                <option key={font}>{font}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Tone</label>
            <p className="hint">One click. This is what the AI hears — you do not have to write a brief.</p>
            <div className="choice-row tones">
              {TONES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`choice ${form.tone_of_voice === item.text ? "on" : ""}`}
                  onClick={() => set("tone_of_voice", item.text)}
                >
                  <b>{item.label}</b>
                </button>
              ))}
            </div>
            <button className="btn ghost" type="button" onClick={() => setOwnNote((v) => !v)}>
              {ownNote ? "Hide extra note" : "+ Add your own note"}
            </button>
            {ownNote && (
              <textarea
                value={form.tone_note}
                onChange={(e) => set("tone_note", e.target.value)}
                rows={2}
                maxLength={400}
                placeholder="Never say ‘limited time’. We are a neighbourhood shop."
                style={{ marginTop: 10 }}
              />
            )}
          </div>

          <h2 style={{ marginTop: 32 }}>About your business</h2>
          <p className="hint">Optional. Skip anything you do not have. None of this blocks Create.</p>
          <div className="field">
            <label htmlFor="business_name">Business name</label>
            <input
              id="business_name"
              value={form.business_name}
              onChange={(e) => set("business_name", e.target.value)}
              placeholder="Your coffee shop"
            />
          </div>
          <div className="field">
            <label htmlFor="logo">Logo</label>
            <p className="hint">From your phone is fine. PNG or JPG, under 2 MB. Not SVG.</p>
            <input id="logo" type="file" accept="image/png,image/jpeg" onChange={(e) => onLogo(e.target.files?.[0])} />
          </div>
          <div className="field">
            <label>What do you run? — optional</label>
            <p className="hint">Only picks the kind of scenes (chair / pour / floor). Not a category for ads. Skip if none fit.</p>
            <div className="choice-row">
              {TYPES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`choice ${form.vertical === item.id ? "on" : ""}`}
                  onClick={() => set("vertical", form.vertical === item.id ? "" : item.id)}
                >
                  <b>{item.label}</b>
                  <span className="hint">{item.hint}</span>
                </button>
              ))}
            </div>
            {form.vertical === "other" && (
              <input
                value={form.vertical_note}
                onChange={(e) => set("vertical_note", e.target.value)}
                placeholder="What kind of business is this?"
                maxLength={80}
              />
            )}
          </div>
          <div className="field">
            <label htmlFor="instagram">Instagram</label>
            <input
              id="instagram"
              value={form.instagram}
              onChange={(e) => set("instagram", e.target.value)}
              placeholder="@studio"
            />
          </div>
          <div className="field">
            <label htmlFor="website">Website</label>
            <input id="website" value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
          </div>

          <p className="hint">The name and logo you enter are treated as yours. Auteur does not check trademarks.</p>
          {error && <p className="err">{error}</p>}
          {saved && <p className="ok">Saved. The next Idea, pictures and voice will use this.</p>}
          <button className="btn" style={{ marginTop: 12 }}>
            Save brand kit
          </button>
        </form>

        <aside>
          <p className="hint">Not the Reel. Just how your brand feels — colours, type, tone.</p>
          <div className="brand-preview" style={{ background: form.secondary_color, color: "#1a1612" }}>
            {logoSrc && <img src={logoSrc} alt="" className="brand-logo" />}
            <p
              style={{
                fontFamily: form.font,
                fontSize: 32,
                lineHeight: 1.1,
                margin: "8px 0 0",
                color: form.primary_color,
              }}
            >
              {form.business_name.trim() || "Your coffee shop"}
            </p>
            <hr style={{ border: 0, borderTop: `3px solid ${form.primary_color}`, margin: "16px 0" }} />
            <p>“{tone?.label || "Your tone"}”</p>
            {form.tone_note && <p className="hint" style={{ color: "inherit", marginTop: 8 }}>{form.tone_note}</p>}
          </div>
          {learnedFrom < 3 && (
            <p className="hint" style={{ marginTop: 16 }}>
              After three finished Reels, Auteur will write what usually works for you at the top of this page.{" "}
              <Link to="/app">Make one</Link>
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
