import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SHAPE_RATIO, api, fetchMedia, type Project } from "../lib/api";
import { useLocale } from "../i18n/locale";
import MoreHint from "./MoreHint";

const SHAPES = ["square", "portrait", "portrait34", "story", "wide", "a5", "a5p"] as const;
const PAPERS = ["a4", "a5", "a6"] as const;
const BACKGROUNDS = ["blur", "white", "black"] as const;

/** The preview box in the shape's proportions, within 360 × 460 px (a tall story gets narrower, not stretched). */
function frameStyle(shape: string) {
  const ratio = SHAPE_RATIO[shape] || "1 / 1";
  const [w, h] = ratio.split("/").map((n) => Number(n.trim()) || 1);
  return { aspectRatio: ratio, width: `min(100%, ${Math.round(Math.min(360, (460 * w) / h))}px)` };
}

/**
 * Free tools for a picture you brought (or copied from another project): another shape without AI, a print PDF,
 * and a gift certificate with this picture as its design. Every change is a new take, so nothing is lost.
 */
export default function OwnPictureTools({
  project,
  onSaved,
  disabled,
}: {
  project: Project;
  onSaved: (project: Project) => void;
  disabled: boolean;
}) {
  const { t, te } = useLocale();
  const nav = useNavigate();
  const [shape, setShape] = useState<(typeof SHAPES)[number] | "">("");
  const [mode, setMode] = useState<"crop" | "fit">("crop");
  const [focus, setFocus] = useState({ x: 50, y: 50 });
  const [background, setBackground] = useState<string>("blur");
  const [paper, setPaper] = useState<(typeof PAPERS)[number]>("a5");
  const [fill, setFill] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const off = disabled || Boolean(busy);
  const current = project.imageFormat || "";
  const [preview, setPreview] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const previewSeq = useRef(0);

  // The result before it is saved: drawn on the server by the same code as "Save", a moment after the last change.
  useEffect(() => {
    if (!shape) {
      setPreview("");
      return;
    }
    const seq = ++previewSeq.current;
    setPreviewing(true);
    const timer = window.setTimeout(() => {
      api
        .reshapePreview(project.id, { format: shape, mode, background, focusX: focus.x / 100, focusY: focus.y / 100 })
        .then((blob) => {
          if (seq !== previewSeq.current) return;
          setPreview(URL.createObjectURL(blob));
        })
        .catch((err) => seq === previewSeq.current && setError(err instanceof Error ? te(err.message) : t("auth.fallback")))
        .finally(() => seq === previewSeq.current && setPreviewing(false));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [shape, mode, background, focus.x, focus.y, project.id, project.updatedAt]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function run(key: string, job: () => Promise<void>) {
    setBusy(key);
    setError("");
    try {
      await job();
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("auth.fallback"));
    } finally {
      setBusy("");
    }
  }

  const reshape = () =>
    run("reshape", async () => {
      if (!shape) return;
      const { project: next } = await api.reshapePicture(project.id, {
        format: shape,
        mode,
        background,
        focusX: focus.x / 100,
        focusY: focus.y / 100,
      });
      onSaved(next);
      setShape("");
    });

  const print = () =>
    run("print", async () => {
      const blob = await fetchMedia(`/projects/${project.id}/print?paper=${paper}&fill=${fill ? 1 : 0}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const name = (project.idea?.title || project.prompt || "picture").replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 60) || "picture";
      a.download = `${name}-${paper.toUpperCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    });

  const certificate = () =>
    run("certificate", async () => {
      const { project: made } = await api.makeCertificate(project.id, { mode, background });
      nav(`/app/studio/${made.id}`);
    });

  return (
    <details className="edit-block own-tools" open>
      <summary className="edit-block-head">
        <h3>{t("own.toolsTitle")}</h3>
        <p className="hint">{t("own.toolsHint")}</p>
      </summary>

      <p className="pane-title" style={{ marginTop: 14 }}>{t("own.shapeTitle")}</p>
      <MoreHint short={t("own.shapeHintShort")} full={t("own.shapeHint")} />
      <div className="pills" role="group" aria-label={t("own.shapeTitle")}>
        {SHAPES.filter((id) => id !== current).map((id) => (
          <button
            key={id}
            type="button"
            className={`pill shape ${shape === id ? "on" : ""}`}
            aria-pressed={shape === id}
            disabled={off}
            onClick={() => setShape(shape === id ? "" : id)}
          >
            <span className={`shape-icon ${id}`} aria-hidden />
            {t(`own.shapes.${id}`)}
          </button>
        ))}
      </div>
      <div className="pill-row" role="group" aria-label={t("own.modeAsk")}>
        <span className="hint">{t("own.modeAsk")}</span>
        {(["crop", "fit"] as const).map((id) => (
          <button key={id} type="button" className={`btn ghost tiny${mode === id ? " on" : ""}`} aria-pressed={mode === id} disabled={off} onClick={() => setMode(id)}>
            {t(`own.modes.${id}`)}
          </button>
        ))}
      </div>
      {mode === "crop" ? (
        <div className="own-focus">
          <label className="hint">
            {t("own.focusX")}
            <input type="range" min={0} max={100} value={focus.x} disabled={off} onChange={(e) => setFocus({ ...focus, x: Number(e.target.value) })} />
          </label>
          <label className="hint">
            {t("own.focusY")}
            <input type="range" min={0} max={100} value={focus.y} disabled={off} onChange={(e) => setFocus({ ...focus, y: Number(e.target.value) })} />
          </label>
        </div>
      ) : (
        <div className="pill-row" role="group" aria-label={t("own.bandAsk")}>
          <span className="hint">{t("own.bandAsk")}</span>
          {BACKGROUNDS.map((id) => (
            <button key={id} type="button" className={`btn ghost tiny${background === id ? " on" : ""}`} aria-pressed={background === id} disabled={off} onClick={() => setBackground(id)}>
              {t(`own.bands.${id}`)}
            </button>
          ))}
          <label className={`cert-swatch cert-swatch-own${background.startsWith("#") ? " on" : ""}`} title={t("own.bandOwn")}>
            <input
              type="color"
              value={background.startsWith("#") ? background : "#f6f1ea"}
              disabled={off}
              aria-label={t("own.bandOwn")}
              onChange={(e) => setBackground(e.target.value)}
            />
          </label>
        </div>
      )}
      {shape && (
        <div className="own-preview">
          <p className="hint">{previewing ? t("own.previewMaking") : t("own.previewNote")}</p>
          <div className="own-preview-frame" style={frameStyle(shape)}>
            {preview && <img src={preview} alt={t("own.previewAlt")} className={previewing ? "stale" : ""} />}
          </div>
          <div className="action-row">
            <button type="button" className="btn accent" disabled={off || !preview} onClick={reshape}>
              {busy === "reshape" ? t("own.working") : t("own.shapeApply", { shape: t(`own.shapes.${shape}`) })}
            </button>
            <button type="button" className="btn ghost" disabled={Boolean(busy)} onClick={() => setShape("")}>
              {t("own.previewCancel")}
            </button>
          </div>
        </div>
      )}

      <p className="pane-title" style={{ marginTop: 18 }}>{t("own.printTitle")}</p>
      <div className="pill-row" role="group" aria-label={t("own.printTitle")}>
        {PAPERS.map((id) => (
          <button key={id} type="button" className={`btn ghost tiny${paper === id ? " on" : ""}`} aria-pressed={paper === id} disabled={off} onClick={() => setPaper(id)}>
            {t(`own.papers.${id}`)}
          </button>
        ))}
      </div>
      <label className="check-row">
        <input type="checkbox" checked={fill} disabled={off} onChange={(e) => setFill(e.target.checked)} />
        {t("own.fillPage")}
      </label>
      <p className="hint">{t(fill ? "own.fillHint" : "own.wholeHint")}</p>
      <div className="action-row">
        <button type="button" className="btn ghost" disabled={off} onClick={print}>
          {busy === "print" ? t("own.working") : t("own.printPdf", { paper: paper.toUpperCase() })}
        </button>
      </div>

      <p className="pane-title" style={{ marginTop: 18 }}>{t("own.certTitle")}</p>
      <p className="hint">{t("own.certHint")}</p>
      <div className="action-row">
        <button type="button" className="btn ghost" disabled={off} onClick={certificate}>
          {busy === "certificate" ? t("own.working") : t("own.certMake")}
        </button>
      </div>
      {error && <p className="err">{error}</p>}
    </details>
  );
}
