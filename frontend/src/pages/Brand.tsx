import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fetchMedia, type BrandKitRow } from "../lib/api";
import { formatBrandHint, useLocale } from "../i18n/locale";

const TONES = [
  { id: "warm", labelKey: "brand.toneWarm", text: "Warm and friendly. Like a regular, not an ad." },
  { id: "professional", labelKey: "brand.tonePro", text: "Professional and polished. Clear, short, never stiff." },
  { id: "playful", labelKey: "brand.tonePlay", text: "Fun and playful. Light. Never try-hard." },
  { id: "calm", labelKey: "brand.toneCalm", text: "Calm and minimal. Unhurried. Quiet, not luxury-speak." },
];

const TYPES = [
  { id: "salon", labelKey: "brand.typeSalon", hintKey: "brand.typeSalonHint" },
  { id: "cafe", labelKey: "brand.typeCafe", hintKey: "brand.typeCafeHint" },
  { id: "fitness", labelKey: "brand.typeFitness", hintKey: "brand.typeFitnessHint" },
  { id: "other", labelKey: "brand.typeOther", hintKey: "brand.typeOtherHint" },
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
  const { t, te } = useLocale();
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
    setHint(formatBrandHint(t, kit.completeness));
    setOwnNote(Boolean(kit.tone_note));
  }

  useEffect(() => {
    api.brand().then((d) => {
      if (!d.brandKit) return;
      apply(d.brandKit);
    });
  }, [t]);

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
      setError(err instanceof Error ? te(err.message) : t("brand.fallbackSave"));
    }
  }

  async function onLogo(file: File | undefined) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError(t("brand.tooBig"));
      return;
    }
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setError(t("brand.badType"));
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const { brandKit } = await api.uploadLogo(String(reader.result || ""));
        apply(brandKit);
      } catch (err) {
        setError(err instanceof Error ? te(err.message) : t("brand.fallbackLogo"));
      }
    };
    reader.readAsDataURL(file);
  }

  async function removeLogo() {
    setError("");
    try {
      const { brandKit } = await api.deleteLogo();
      apply(brandKit);
      setLogoSrc("");
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("brand.fallbackRemoveLogo"));
    }
  }

  async function resetLearning() {
    if (!window.confirm(t("brand.resetConfirm"))) return;
    try {
      const { brandKit } = await api.resetLearning();
      apply(brandKit);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("brand.fallbackReset"));
    }
  }

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const tone = TONES.find((item) => item.text === form.tone_of_voice);
  const vertical = TYPES.find((item) => item.id === form.vertical);
  const verticalLabel = vertical
    ? form.vertical === "other" && form.vertical_note.trim()
      ? form.vertical_note.trim()
      : t(vertical.labelKey)
    : "";

  return (
    <div>
      <h1 className="page-title" style={{ fontSize: 48 }}>{t("brand.title")}</h1>
      <p className="lede">
        {t("brand.lede")}
      </p>
      {hint && <p className="hint" style={{ marginTop: 12 }}>{hint}</p>}

      {(learnedFrom >= 3 || readyProjects >= 3) && (
        <div className="panel" style={{ marginTop: 20, maxWidth: 920 }}>
          <p className="ok">
            {learnedFrom >= 3
              ? t("brand.learned", { n: learnedFrom })
              : t("brand.canLearn")}
          </p>
          <p className="lede" style={{ marginTop: 8 }}>
            {learnedLines.length
              ? learnedLines.join(" · ")
              : readyProjects >= 3
                ? t("brand.resetNow")
                : t("brand.keepReasons")}
          </p>
          <button className="btn ghost" type="button" style={{ marginTop: 12 }} onClick={resetLearning}>
            {t("brand.reset")}
          </button>
          <p className="hint" style={{ marginTop: 8 }}>
            {t("brand.resetHint")}
          </p>
        </div>
      )}

      <div className="brand-layout">
        <form className="panel" onSubmit={onSubmit}>
          <h2>{t("brand.looks")}</h2>
          <p className="hint">{t("brand.looksHint")}</p>
          <div className="field">
            <label>{t("brand.colours")}</label>
            <p className="hint">{t("brand.coloursHint")}</p>
            <div className="color-row">
              <div>
                <span className="hint">{t("brand.main")}</span>
                <div className="color-row">
                  <input type="color" value={form.primary_color} onChange={(e) => set("primary_color", e.target.value)} />
                  <input value={form.primary_color} onChange={(e) => set("primary_color", e.target.value)} />
                </div>
              </div>
              <div>
                <span className="hint">{t("brand.soft")}</span>
                <div className="color-row">
                  <input type="color" value={form.secondary_color} onChange={(e) => set("secondary_color", e.target.value)} />
                  <input value={form.secondary_color} onChange={(e) => set("secondary_color", e.target.value)} />
                </div>
              </div>
            </div>
          </div>
          <div className="field">
            <label htmlFor="font">{t("brand.font")}</label>
            <p className="hint">{t("brand.fontHint")}</p>
            <select id="font" value={form.font} onChange={(e) => set("font", e.target.value)}>
              {FONTS.map((font) => (
                <option key={font}>{font}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t("brand.tone")}</label>
            <p className="hint">{t("brand.toneHint")}</p>
            <div className="choice-row tones">
              {TONES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`choice ${form.tone_of_voice === item.text ? "on" : ""}`}
                  onClick={() => set("tone_of_voice", item.text)}
                >
                  <b>{t(item.labelKey)}</b>
                </button>
              ))}
            </div>
            <button className="btn ghost" type="button" onClick={() => setOwnNote((v) => !v)}>
              {ownNote ? t("brand.hideNote") : t("brand.addNote")}
            </button>
            {ownNote && (
              <textarea
                value={form.tone_note}
                onChange={(e) => set("tone_note", e.target.value)}
                rows={2}
                maxLength={400}
                placeholder={t("brand.notePh")}
                style={{ marginTop: 10 }}
              />
            )}
          </div>

          <h2 style={{ marginTop: 32 }}>{t("brand.about")}</h2>
          <p className="hint">{t("brand.aboutHint")}</p>
          <div className="field">
            <label htmlFor="business_name">{t("brand.businessName")}</label>
            <input
              id="business_name"
              value={form.business_name}
              onChange={(e) => set("business_name", e.target.value)}
              placeholder={t("brand.businessPh")}
            />
          </div>
          <div className="field">
            <label htmlFor="logo">{t("brand.logo")}</label>
            <p className="hint">{t("brand.logoHint")}</p>
            <div className="logo-pick">
              {logoSrc && <img src={logoSrc} alt="" className="logo-pick-thumb" />}
              <div>
                {logoSrc && <p className="ok">{t("brand.logoOn")}</p>}
                <label className="btn ghost" htmlFor="logo" style={{ display: "inline-block", marginTop: logoSrc ? 8 : 0 }}>
                  {logoSrc ? t("brand.replaceLogo") : t("brand.addLogo")}
                </label>
                {logoSrc && (
                  <button className="btn ghost" type="button" style={{ marginLeft: 8, marginTop: 8 }} onClick={removeLogo}>
                    {t("brand.removeLogo")}
                  </button>
                )}
                <input id="logo" className="sr-only" type="file" accept="image/png,image/jpeg" onChange={(e) => onLogo(e.target.files?.[0])} />
              </div>
            </div>
          </div>
          <div className="field">
            <label>{t("brand.vertical")}</label>
            <p className="hint">{t("brand.verticalHint")}</p>
            <div className="choice-row">
              {TYPES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`choice ${form.vertical === item.id ? "on" : ""}`}
                  onClick={() => set("vertical", form.vertical === item.id ? "" : item.id)}
                >
                  <b>{t(item.labelKey)}</b>
                  <span className="hint">{t(item.hintKey)}</span>
                </button>
              ))}
            </div>
            {form.vertical === "other" && (
              <input
                value={form.vertical_note}
                onChange={(e) => set("vertical_note", e.target.value)}
                placeholder={t("brand.verticalOther")}
                maxLength={80}
              />
            )}
          </div>
          <div className="field">
            <label htmlFor="instagram">{t("brand.instagram")}</label>
            <input
              id="instagram"
              value={form.instagram}
              onChange={(e) => set("instagram", e.target.value)}
              placeholder="@studio"
            />
          </div>
          <div className="field">
            <label htmlFor="website">{t("brand.website")}</label>
            <input id="website" value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
          </div>

          <p className="hint">{t("brand.legal")}</p>
          {error && <p className="err">{error}</p>}
          {saved && <p className="ok">{t("brand.saved")}</p>}
          <button className="btn" style={{ marginTop: 12 }}>
            {t("brand.save")}
          </button>
        </form>

        <aside>
          <p className="hint">{t("brand.previewHint")}</p>
          <div className="brand-preview" style={{ background: form.secondary_color, color: "#1a1612" }}>
            {logoSrc ? (
              <img src={logoSrc} alt="" className="brand-logo" />
            ) : (
              <p className="hint" style={{ color: "inherit", opacity: 0.55 }}>{t("brand.logo")}: {t("brand.notSet")}</p>
            )}
            <p
              style={{
                fontFamily: form.font,
                fontSize: 32,
                lineHeight: 1.1,
                margin: "8px 0 0",
                color: form.primary_color,
              }}
            >
              {form.business_name.trim() || t("brand.businessPh")}
            </p>
            <hr style={{ border: 0, borderTop: `3px solid ${form.primary_color}`, margin: "16px 0" }} />
            <div className="preview-swatches">
              <span>
                <i style={{ background: form.primary_color }} />
                {t("brand.main")} {form.primary_color}
              </span>
              <span>
                <i style={{ background: form.secondary_color, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.15)" }} />
                {t("brand.soft")} {form.secondary_color}
              </span>
            </div>
            <p style={{ marginTop: 12, fontFamily: form.font }}>
              {t("brand.previewFont")}: {form.font}
            </p>
            <p style={{ marginTop: 8 }}>“{tone ? t(tone.labelKey) : t("brand.notSet")}”</p>
            {form.tone_note && <p className="hint" style={{ color: "inherit", marginTop: 8 }}>{form.tone_note}</p>}
            <p style={{ marginTop: 12 }}>
              {t("brand.previewType")}: {verticalLabel || t("brand.notSet")}
            </p>
            <p style={{ marginTop: 6 }}>
              {t("brand.instagram")}: {form.instagram.trim() || t("brand.notSet")}
            </p>
            <p style={{ marginTop: 6 }}>
              {t("brand.website")}: {form.website.trim() || t("brand.notSet")}
            </p>
          </div>
          {learnedFrom < 3 && (
            <p className="hint" style={{ marginTop: 16 }}>
              {t("brand.afterThree")}{" "}
              <Link to="/app">{t("brand.makeOne")}</Link>
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
