import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import BrandToggle from "../components/BrandToggle";
import { detectLocale, formatBrandHint, translate, useLocale } from "../i18n/locale";

const FORMAT_IDS = ["video", "instagram_reel", "tiktok", "image_post", "advertisement", "social_post"] as const;
const READY = new Set(["instagram_reel", "tiktok", "image_post"]);
const EMOJI: Record<string, string> = {
  video: "🎬",
  instagram_reel: "📱",
  tiktok: "🎵",
  image_post: "🖼️",
  advertisement: "📢",
  social_post: "✍️",
};
const KIND_IDS = ["photo", "invite", "info", "offer"] as const;

export default function Home() {
  const nav = useNavigate();
  const { t, te, locale } = useLocale();
  const [type, setType] = useState("instagram_reel");
  const [imageIntent, setImageIntent] = useState("photo");
  const [prompt, setPrompt] = useState(() => translate(detectLocale(), "examples.instagram_reel"));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [kitHint, setKitHint] = useState("");
  const [useBrand, setUseBrand] = useState(true);
  const isImage = type === "image_post";
  const selectedReady = READY.has(type);
  const selectedTitle = t(`formats.${type}.title`);
  const kindHint = t(`kinds.${imageIntent}.hint`);

  const examples = useMemo(
    () => ({
      instagram_reel: t("examples.instagram_reel"),
      tiktok: t("examples.tiktok"),
    }),
    [t, locale]
  );
  const kindExamples = useMemo(
    () => Object.fromEntries(KIND_IDS.map((id) => [id, t(`kinds.${id}.example`)])) as Record<string, string>,
    [t, locale]
  );

  useEffect(() => {
    const sample = isImage ? kindExamples[imageIntent] : examples[type as keyof typeof examples];
    const samples = [...Object.values(examples), ...Object.values(kindExamples)];
    if (sample && (samples.includes(prompt) || !prompt.trim())) setPrompt(sample);
  }, [locale]); // keep the user's own brief when they switch language

  useEffect(() => {
    api
      .brand()
      .then((d) => {
        const progress = d.brandKit?.completeness;
        setKitHint(progress && progress.percent < 70 ? formatBrandHint(t, progress) : "");
      })
      .catch(() => setKitHint(""));
  }, [t, locale]);

  async function start() {
    if (!selectedReady) {
      setError(t("home.formatBlocked"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { project } = await api.createProject(type, prompt, isImage ? imageIntent : undefined, useBrand);
      nav(`/app/studio/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("home.fallback"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hero-home">
      <p className="hint">{t("home.kicker")}</p>
      <h1 style={{ fontSize: "clamp(40px, 6vw, 64px)" }}>{t("home.title")}</h1>
      <p className="lede">{t("home.lede")}</p>
      {kitHint && useBrand && (
        <p className="hint">
          {kitHint}. <Link to="/app/brand">{t("home.openKit")}</Link>
        </p>
      )}

      <div className="format-grid">
        {FORMAT_IDS.map((id) => {
          const ready = READY.has(id);
          return (
            <button
              key={id}
              className={`format-card ${ready ? "" : "soon"} ${type === id ? "on" : ""}`}
              onClick={() => {
                setType(id);
                setError("");
                if (id === "image_post") {
                  setImageIntent("photo");
                  setPrompt(kindExamples.photo);
                  return;
                }
                setPrompt(examples[id as keyof typeof examples] || prompt);
              }}
              style={type === id && ready ? { borderColor: "var(--accent-2)" } : undefined}
            >
              <div className="emoji">{EMOJI[id]}</div>
              <div>
                <h3>{t(`formats.${id}.title`)}</h3>
                <p>{ready ? t(`formats.${id}.blurb`) : t("home.soon")}</p>
              </div>
            </button>
          );
        })}
      </div>

      {isImage && (
        <div className="image-kinds">
          <p className="hint">{t("home.kindAsk")}</p>
          <div className="choice-row kinds">
            {KIND_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className={`choice ${imageIntent === id ? "on" : ""}`}
                onClick={() => {
                  setImageIntent(id);
                  if (Object.values(kindExamples).includes(prompt) || !prompt.trim()) {
                    setPrompt(kindExamples[id]);
                  }
                }}
              >
                <b>{t(`kinds.${id}.label`)}</b>
                <span>{t(`kinds.${id}.hint`)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <BrandToggle
        value={useBrand}
        onChange={setUseBrand}
        ask={t("home.useBrandAsk")}
        onLabel={t("home.useBrand")}
        onHint={t("home.useBrandHint")}
        offLabel={t("home.skipBrand")}
        offHint={t("home.skipBrandHint")}
      />

      <div className="prompt-stage">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={2000}
          placeholder={isImage ? kindHint : t("home.placeholderReel")}
        />
        <div className="row">
          <span className="hint">
            {isImage ? t("home.hintImage", { hint: kindHint }) : t("home.hintReel")}
          </span>
          <button className="btn accent" onClick={start} disabled={busy}>
            {busy ? t("home.opening") : t("home.continue", { title: selectedTitle })}
          </button>
        </div>
        {error && <p className="err">{error}</p>}
      </div>
    </div>
  );
}
