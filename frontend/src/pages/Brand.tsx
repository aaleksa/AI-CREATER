import { FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";

const empty = {
  business_name: "",
  logo_url: "",
  primary_color: "#C45C26",
  secondary_color: "#F4EFE8",
  font: "Fraunces",
  tone_of_voice: "Warm, confident, cinematic",
  website: "",
  instagram: "",
};

export default function Brand() {
  const [form, setForm] = useState(empty);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.brand().then((d) => {
      if (!d.brandKit) return;
      const kit = d.brandKit;
      const hex = (value: string | undefined, fallback: string) =>
        value && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : fallback;
      setForm({
        business_name: kit.business_name || "",
        logo_url: kit.logo_url || "",
        primary_color: hex(kit.primary_color, "#C45C26"),
        secondary_color: hex(kit.secondary_color, "#F4EFE8"),
        font: kit.font || "Fraunces",
        tone_of_voice: kit.tone_of_voice || empty.tone_of_voice,
        website: kit.website || "",
        instagram: kit.instagram || "",
      });
    });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const { brandKit } = await api.saveBrand(form);
      const kit = brandKit;
      setForm({
        business_name: kit.business_name || "",
        logo_url: kit.logo_url || "",
        primary_color: kit.primary_color || "#C45C26",
        secondary_color: kit.secondary_color || "#F4EFE8",
        font: kit.font || "Fraunces",
        tone_of_voice: kit.tone_of_voice || empty.tone_of_voice,
        website: kit.website || "",
        instagram: kit.instagram || "",
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div>
      <h1 className="page-title" style={{ fontSize: 48 }}>My Brand</h1>
      <p className="lede">
        Set this once. Then write “Create a Reel promoting my coffee shop” —
        Auteur already knows the colours, type, and tone of voice.
      </p>
      <form className="panel" style={{ maxWidth: 640, marginTop: 28 }} onSubmit={onSubmit}>
        <div className="field">
          <label>Business name</label>
          <input value={form.business_name} onChange={(e) => set("business_name", e.target.value)} />
        </div>
        <div className="field">
          <label>Logo URL</label>
          <input value={form.logo_url} onChange={(e) => set("logo_url", e.target.value)} placeholder="https://" />
        </div>
        <div className="field">
          <label>Brand colours</label>
          <div className="color-row">
            <input type="color" value={form.primary_color} onChange={(e) => set("primary_color", e.target.value)} />
            <input value={form.primary_color} onChange={(e) => set("primary_color", e.target.value)} />
            <input type="color" value={form.secondary_color} onChange={(e) => set("secondary_color", e.target.value)} />
            <input value={form.secondary_color} onChange={(e) => set("secondary_color", e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Font</label>
          <select value={form.font} onChange={(e) => set("font", e.target.value)}>
            <option>Fraunces</option>
            <option>Outfit</option>
            <option>Playfair Display</option>
            <option>IBM Plex Sans</option>
          </select>
        </div>
        <div className="field">
          <label>Tone of voice</label>
          <textarea value={form.tone_of_voice} onChange={(e) => set("tone_of_voice", e.target.value)} />
        </div>
        <div className="field">
          <label>Website</label>
          <input value={form.website} onChange={(e) => set("website", e.target.value)} />
        </div>
        <div className="field">
          <label>Instagram</label>
          <input value={form.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@studio" />
        </div>
        {error && <p className="err">{error}</p>}
        {saved && <p className="ok">Brand kit saved. Every new Reel will use it.</p>}
        <button className="btn">Save brand kit</button>
      </form>
    </div>
  );
}
