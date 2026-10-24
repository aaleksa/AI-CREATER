import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { api, fetchMedia, type CertificateFont, type CertificateItem, type CertificateLayout, type CertificateSettings, type CertificateStyle, type Project } from "../lib/api";
import { useLocale } from "../i18n/locale";

const EMPTY: CertificateItem = { name: "", gift: "", giftNote: "", validFrom: "", validUntil: "", code: "" };
/** The headings the studio prints by default; they follow the label language, an owner's own heading does not. */
const STANDARD_TITLE = { uk: "Подарунковий сертифікат", en: "Gift certificate" } as const;
const STANDARD_TITLES: string[] = Object.values(STANDARD_TITLE);
const DEFAULT_LAYOUT: CertificateLayout = { x: 0.5, y: 0.5, scale: 1 };
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
/** Remembered per browser: whether "Position, font and colour" is open (open until closed once). */
const LOOK_OPEN_KEY = "auteur.studio.certLookOpen";
const DEFAULT_STYLE: CertificateStyle = { font: "brand", accent: "", ink: "", panel: "soft" };
const PANELS = ["soft", "plate", "none"] as const;
/** Each choice is shown in its own face (the files in /fonts). */
const FONTS: { id: CertificateFont; css: string }[] = [
  { id: "brand", css: "inherit" },
  { id: "montserrat", css: "Montserrat, sans-serif" },
  { id: "playfair", css: "'Playfair Display', serif" },
  { id: "cormorant", css: "'Cormorant Garamond', serif" },
  { id: "script", css: "'Great Vibes', cursive" },
];
const COLORS = ["#1a1612", "#5c3a21", "#7a3b1d", "#8b1e2d", "#9a7b2f", "#2f5d3a", "#1f3a5f", "#ffffff"];

/**
 * Gift certificates from one painted design: the owner's exact words and a list of people, each with a code.
 * Saving, previews and every PDF are free — nothing here asks the AI.
 */
export default function CertificateBlock({
  project,
  onSaved,
  onPreview,
  disabled,
  onRemoveText,
  removeTextCost,
}: {
  project: Project;
  /** Own design only: the AI clears the words painted on the design (a paid edit), then ours print instead. */
  onRemoveText?: () => void;
  removeTextCost?: number;
  onSaved: (project: Project) => void;
  /** The picked person's certificate, with the words, for the big preview. */
  onPreview: (src: string) => void;
  disabled: boolean;
}) {
  const { t, te } = useLocale();
  const saved = project.certificate;
  const [draft, setDraft] = useState<CertificateSettings>(() => saved || { title: "", note: "", lang: "uk", codes: true, layout: DEFAULT_LAYOUT, items: [EMPTY] });
  const [picked, setPicked] = useState(0);
  /** Rows with their fields shown; the rest fold to one line (name · gift · code) so a long list stays short. */
  const [openRows, setOpenRows] = useState<number[]>([0]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const [stageSrc, setStageSrc] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const saveTimer = useRef<number | undefined>(undefined);
  const layout = draft.layout || DEFAULT_LAYOUT;
  /** The frame on the preview moves the words only after a click on it, so a stray drag changes nothing. */
  const [editing, setEditing] = useState(false);
  const [logoEditing, setLogoEditing] = useState(false);
  /** Earlier font and colours, newest last (this visit only): "Back to the previous" steps through them. */
  const [styleBack, setStyleBack] = useState<CertificateStyle[]>([]);
  const lastStyleAt = useRef(0);
  useEffect(() => setStyleBack([]), [project.id, saved?.take]);
  const [lookOpen, setLookOpen] = useState(() => localStorage.getItem(LOOK_OPEN_KEY) !== "0");

  useEffect(() => {
    if (!editing && !logoEditing) return;
    const outside = (e: PointerEvent) => {
      if (stageRef.current?.contains(e.target as Node)) return;
      setEditing(false);
      setLogoEditing(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [editing, logoEditing]);
  const style = draft.style || DEFAULT_STYLE;
  /** Our words printed on the design; off = the owner's design exactly as it is (its own words). */
  const wordsOn = style.words !== false;
  const logoInput = useRef<HTMLInputElement>(null);
  /** Shown as it prints: "brand" with no logo in the kit prints no logo (only the business name, with the brand on). */
  const logoChoice =
    draft.logo === "own" ? (saved?.ownLogo ? "own" : "none") : draft.logo === "none" ? "none" : saved?.brandLogo ? "brand" : "none";

  async function uploadLogo(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      setError(te("That file is too big."));
      return;
    }
    setBusy("logo");
    setError("");
    try {
      if (dirty) await api.saveCertificate(project.id, draftRef.current);
      const { project: next } = await api.uploadCertificateLogo(project.id, file);
      onSaved(next);
      if (next.certificate) setDraft(next.certificate);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("auth.fallback"));
    } finally {
      setBusy("");
    }
  }

  async function removeLogo() {
    setBusy("logo");
    setError("");
    try {
      const { project: next } = await api.removeCertificateLogo(project.id);
      onSaved(next);
      if (next.certificate) setDraft(next.certificate);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("auth.fallback"));
    } finally {
      setBusy("");
    }
  }

  /** Font and colours: saved a moment later like the layout, so the preview follows. */
  function setStyle(change: Partial<CertificateStyle>, coalesce = false) {
    const next = { ...style, ...change };
    if (JSON.stringify(next) === JSON.stringify(style)) return;
    // Dragging the colour picker sends many changes: they count as one step back.
    const now = Date.now();
    if (!coalesce || now - lastStyleAt.current > 1000) setStyleBack((list) => [...list.slice(-19), style]);
    lastStyleAt.current = now;
    setDraft((d) => ({ ...d, style: next }));
    saveSoon();
  }

  function undoStyle() {
    const previous = styleBack[styleBack.length - 1];
    if (!previous) return;
    setStyleBack((list) => list.slice(0, -1));
    lastStyleAt.current = 0;
    setDraft((d) => ({ ...d, style: previous }));
    saveSoon();
  }

  /** "Classic · #8b1e2d · auto": what a step back returns to. */
  function styleLabel(s: CertificateStyle) {
    if (s.words === false) return t("cert.wordsOffShort");
    return [t(`cert.fonts.${s.font}`), s.accent || t("cert.colorAuto"), s.ink || t("cert.colorAuto"), t(`cert.panels.${s.panel || "soft"}`)].join(" · ");
  }

  function colorRow(key: "accent" | "ink", label: string) {
    const value = style[key];
    return (
      <div className="cert-colors" role="group" aria-label={label}>
        <span className="hint">{label}</span>
        <button type="button" className={`btn ghost tiny${!value ? " on" : ""}`} aria-pressed={!value} disabled={off} onClick={() => setStyle({ [key]: "" })}>
          {t("cert.colorAuto")}
        </button>
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`cert-swatch${value === c ? " on" : ""}`}
            style={{ background: c }}
            aria-label={c}
            aria-pressed={value === c}
            disabled={off}
            onClick={() => setStyle({ [key]: c })}
          />
        ))}
        <label className={`cert-swatch cert-swatch-own${value && !COLORS.includes(value) ? " on" : ""}`} title={t("cert.colorOwn")}>
          <input type="color" value={value || "#1a1612"} disabled={off} aria-label={t("cert.colorOwn")} onChange={(e) => setStyle({ [key]: e.target.value }, true)} />
        </label>
      </div>
    );
  }
  const box = saved?.boxes?.[picked] || { w: 0.57, h: 0.45 };
  // The logo's frame: its size at scale 1 comes from the server's box, its place from the draft (so it follows a drag).
  const savedLogo = saved?.logoBoxes?.[picked] || null;
  const savedLayout = saved?.layout || DEFAULT_LAYOUT;
  const savedLogoScale = saved?.logoLayout?.scale ?? savedLayout.scale;
  const logoUnit = savedLogo ? { w: savedLogo.w / savedLogoScale, h: savedLogo.h / savedLogoScale } : null;
  const loose = draft.logoLayout || null;
  const logoView =
    savedLogo && logoUnit
      ? loose
        ? { x: loose.x, y: loose.y, w: logoUnit.w * loose.scale, h: logoUnit.h * loose.scale }
        : {
            x: savedLogo.x + (layout.x - savedLayout.x),
            y: layout.y + ((savedLogo.y - savedLayout.y) * layout.scale) / savedLayout.scale,
            w: logoUnit.w * layout.scale,
            h: logoUnit.h * layout.scale,
          }
      : null;

  useEffect(() => {
    if (saved) setDraft(saved);
  }, [project.id, project.updatedAt]);

  // The preview is the saved certificate for the picked person, so it always shows what will print.
  useEffect(() => {
    let url = "";
    let cancelled = false;
    fetchMedia(`/projects/${project.id}/certificate/${picked}?format=preview&t=${encodeURIComponent(project.updatedAt || "")}`)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setStageSrc(url);
        onPreview(url);
      })
      .catch(() => onPreview(""));
    return () => {
      cancelled = true;
      if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
  }, [project.id, project.updatedAt, picked]);

  function setItem(i: number, change: Partial<CertificateItem>) {
    setDraft({ ...draft, items: draft.items.map((item, j) => (j === i ? { ...item, ...change } : item)) });
  }

  async function save() {
    setBusy("save");
    setError("");
    try {
      const { project: next } = await api.saveCertificate(project.id, draftRef.current);
      onSaved(next);
      if (next.certificate) setDraft(next.certificate);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("auth.fallback"));
    } finally {
      setBusy("");
    }
  }

  function setLayout(next: CertificateLayout) {
    setDraft((d) => ({ ...d, layout: next }));
  }

  /** The block moved or resized: save a moment later, so the preview and every PDF follow. */
  function saveSoon() {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void save(), 400);
  }

  /** Drag the block of words, or its corner to change its size; works with a finger too. */
  function startDrag(e: ReactPointerEvent, mode: "move" | "size") {
    if (disabled || busy) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const start = { px: e.clientX, py: e.clientY, ...layout };
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.px) / rect.width;
      const dy = (ev.clientY - start.py) / rect.height;
      // The block stays on the page whatever its size.
      const inside = (l: CertificateLayout) => {
        const hw = Math.min(0.5, (box.w * l.scale) / 2);
        const hh = Math.min(0.5, (box.h * l.scale) / 2);
        return { ...l, x: clamp(l.x, hw, 1 - hw), y: clamp(l.y, hh, 1 - hh) };
      };
      if (mode === "move") setLayout(inside({ ...start, x: start.x + dx, y: start.y + dy }));
      else setLayout(inside({ ...start, scale: clamp(start.scale * (1 + (dx * 2) / (box.w * start.scale)), 0.5, 1.6) }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      saveSoon();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  /** Drag the logo on its own (it leaves the words on the first move), or its corner to resize it. */
  function startLogoDrag(e: ReactPointerEvent, mode: "move" | "size") {
    if (disabled || busy || !logoView || !logoUnit) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const start = { px: e.clientX, py: e.clientY, ...(loose || { x: logoView.x, y: logoView.y, scale: layout.scale }) };
    const unit = logoUnit;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.px) / rect.width;
      const dy = (ev.clientY - start.py) / rect.height;
      const inside = (l: CertificateLayout) => {
        const hw = Math.min(0.5, (unit.w * l.scale) / 2);
        const hh = Math.min(0.5, (unit.h * l.scale) / 2);
        return { ...l, x: clamp(l.x, hw, 1 - hw), y: clamp(l.y, hh, 1 - hh) };
      };
      const next =
        mode === "move"
          ? inside({ ...start, x: start.x + dx, y: start.y + dy })
          : inside({ ...start, scale: clamp(start.scale * (1 + (dx * 2) / (unit.w * start.scale)), 0.3, 3) });
      setDraft((d) => ({ ...d, logoLayout: { x: next.x, y: next.y, scale: next.scale } }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      saveSoon();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  /** Picking the language puts the printed labels and the owner's own words in it, in one click. */
  async function translate(lang: "uk" | "en") {
    setBusy("translate");
    setError("");
    try {
      if (dirty) {
        const { project: savedNow } = await api.saveCertificate(project.id, draft);
        onSaved(savedNow);
      }
      const { project: next } = await api.translateCertificate(project.id, lang);
      onSaved(next);
      if (next.certificate) setDraft(next.certificate);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("auth.fallback"));
    } finally {
      setBusy("");
    }
  }

  async function download(i: number, format: "pdf" | "png") {
    setBusy(`${format}-${i}`);
    setError("");
    try {
      if (dirty) await save();
      const blob = await fetchMedia(`/projects/${project.id}/certificate/${i}?format=${format}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const item = draft.items[i];
      a.href = url;
      // Who it is for (or "certificate"), what it is for, its code and language: easy to find in Downloads.
      const safe = (text: string, max: number) => text.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, max).trim();
      a.download = `${[
        safe(item?.name || "", 40) || t("cert.fileName"),
        safe(item?.gift || "", 40),
        draft.codes !== false ? safe(item?.code || "", 24) : "",
        t(draft.lang === "en" ? "fileName.en" : "fileName.uk"),
      ]
        .filter(Boolean)
        .join("-")}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("auth.fallback"));
    } finally {
      setBusy("");
    }
  }

  const off = disabled || Boolean(busy);
  return (
    <div className="certificate-block">
      <h3>{t("cert.title")}</h3>
      <p className="hint">{t("cert.hint")}</p>
      <details
        className="edit-block cert-look"
        open={lookOpen}
        onToggle={(e) => {
          const next = e.currentTarget.open;
          setLookOpen(next);
          localStorage.setItem(LOOK_OPEN_KEY, next ? "1" : "0");
          if (!next) {
            setEditing(false);
            setLogoEditing(false);
          }
        }}
      >
        <summary className="edit-block-head">
          <h3>{t("cert.lookTitle")}</h3>
          <p className="hint">
            {wordsOn ? [t(`cert.fonts.${style.font}`), t("cert.sizeN", { n: Math.round(layout.scale * 100) })].join(" · ") : t("cert.wordsOffShort")}
          </p>
        </summary>
      <p className="hint">{t("cert.lookPerTake")}</p>
      <div className="pill-row" role="group" aria-label={t("cert.words")}>
        <span className="hint">{t("cert.words")}</span>
        {([true, false] as const).map((on) => (
          <button
            key={String(on)}
            type="button"
            className={`btn ghost tiny${wordsOn === on ? " on" : ""}`}
            aria-pressed={wordsOn === on}
            disabled={off}
            onClick={() => {
              setEditing(false);
              setLogoEditing(false);
              setStyle({ words: on });
            }}
          >
            {t(on ? "cert.wordsOn" : "cert.wordsOff")}
          </button>
        ))}
      </div>
      {!wordsOn && <p className="hint">{t(saved?.readFromDesign ? "cert.wordsReadHint" : "cert.wordsOffHint")}</p>}
      {saved?.ownDesign && onRemoveText && (
        <div className="action-row">
          <button type="button" className="btn ghost" disabled={off} onClick={onRemoveText}>
            {t("cert.removeText", { credits: removeTextCost ?? 8 })}
          </button>
          <span className="hint">{t("cert.removeTextHint")}</span>
        </div>
      )}
      {stageSrc && wordsOn && <p className="hint">{t("cert.dragHint")}</p>}
      {stageSrc && (
        <div className="cert-stage" ref={stageRef}>
          <img src={stageSrc} alt={t("cert.previewAlt")} draggable={false} />
          {wordsOn && (
          <div
            className={`cert-box${editing ? " editing" : ""}`}
            role="slider"
            tabIndex={0}
            title={editing ? undefined : t("cert.clickToEdit")}
            aria-label={editing ? t("cert.moveBlock") : t("cert.clickToEdit")}
            aria-valuenow={Math.round(layout.scale * 100)}
            style={{
              left: `${(layout.x - (box.w * layout.scale) / 2) * 100}%`,
              top: `${(layout.y - (box.h * layout.scale) / 2) * 100}%`,
              width: `${box.w * layout.scale * 100}%`,
              height: `${box.h * layout.scale * 100}%`,
            }}
            onPointerDown={(e) => {
              if (editing) {
                startDrag(e, "move");
                return;
              }
              if (disabled || busy) return;
              e.preventDefault();
              e.currentTarget.focus();
              setLogoEditing(false);
              setEditing(true);
            }}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setEditing(false);
                return;
              }
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setEditing(!editing);
                return;
              }
              const step = { ArrowLeft: [-0.01, 0], ArrowRight: [0.01, 0], ArrowUp: [0, -0.01], ArrowDown: [0, 0.01] }[e.key];
              if (!editing || !step || disabled || busy) return;
              e.preventDefault();
              const hw = Math.min(0.5, (box.w * layout.scale) / 2);
              const hh = Math.min(0.5, (box.h * layout.scale) / 2);
              setLayout({ ...layout, x: clamp(layout.x + step[0], hw, 1 - hw), y: clamp(layout.y + step[1], hh, 1 - hh) });
              saveSoon();
            }}
          >
            {editing && <span className="cert-box-handle" aria-hidden onPointerDown={(e) => startDrag(e, "size")} />}
          </div>
          )}
          {wordsOn && logoView && (
            <div
              className={`cert-box cert-logo-box${logoEditing ? " editing" : ""}`}
              role="slider"
              tabIndex={0}
              title={logoEditing ? undefined : t("cert.clickToEditLogo")}
              aria-label={logoEditing ? t("cert.moveLogo") : t("cert.clickToEditLogo")}
              aria-valuenow={Math.round((loose?.scale ?? layout.scale) * 100)}
              style={{
                left: `${(logoView.x - logoView.w / 2) * 100}%`,
                top: `${(logoView.y - logoView.h / 2) * 100}%`,
                width: `${logoView.w * 100}%`,
                height: `${logoView.h * 100}%`,
              }}
              onPointerDown={(e) => {
                if (logoEditing) {
                  startLogoDrag(e, "move");
                  return;
                }
                if (disabled || busy) return;
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.focus();
                setEditing(false);
                setLogoEditing(true);
              }}
              onBlur={() => setLogoEditing(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setLogoEditing(false);
                  return;
                }
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setLogoEditing(!logoEditing);
                  return;
                }
                const step = { ArrowLeft: [-0.01, 0], ArrowRight: [0.01, 0], ArrowUp: [0, -0.01], ArrowDown: [0, 0.01] }[e.key];
                if (!logoEditing || !step || disabled || busy || !logoUnit) return;
                e.preventDefault();
                const from = loose || { x: logoView.x, y: logoView.y, scale: layout.scale };
                const hw = Math.min(0.5, (logoUnit.w * from.scale) / 2);
                const hh = Math.min(0.5, (logoUnit.h * from.scale) / 2);
                setDraft((d) => ({ ...d, logoLayout: { ...from, x: clamp(from.x + step[0], hw, 1 - hw), y: clamp(from.y + step[1], hh, 1 - hh) } }));
                saveSoon();
              }}
            >
              {logoEditing && <span className="cert-box-handle" aria-hidden onPointerDown={(e) => startLogoDrag(e, "size")} />}
            </div>
          )}
        </div>
      )}
      {wordsOn && (
      <>
      {loose && logoView && (
        <div className="action-row">
          <button
            type="button"
            className="link-btn"
            disabled={off}
            onClick={() => {
              setDraft((d) => ({ ...d, logoLayout: null }));
              saveSoon();
            }}
          >
            {t("cert.logoBack")}
          </button>
        </div>
      )}
      <div className="cert-size">
        <span className="hint">{t("cert.size")}</span>
        <input
          type="range"
          min={50}
          max={160}
          step={5}
          value={Math.round(layout.scale * 100)}
          disabled={disabled || Boolean(busy)}
          onChange={(e) => {
            setLayout({ ...layout, scale: Number(e.target.value) / 100 });
            saveSoon();
          }}
          aria-label={t("cert.size")}
        />
        <button
          type="button"
          className="link-btn"
          disabled={disabled || Boolean(busy) || (layout.x === 0.5 && layout.y === 0.5 && layout.scale === 1)}
          onClick={() => {
            setLayout(DEFAULT_LAYOUT);
            saveSoon();
          }}
        >
          {t("cert.resetLayout")}
        </button>
      </div>
      <div className="pill-row cert-logo" role="group" aria-label={t("cert.logo")}>
        <span className="hint">{t("cert.logo")}</span>
        {(["brand", "own", "none"] as const).map((id) => {
          const noBrand = id === "brand" && !saved?.brandLogo;
          return (
            <button
              key={id}
              type="button"
              className={`btn ghost tiny${logoChoice === id ? " on" : ""}`}
              aria-pressed={logoChoice === id}
              disabled={off || noBrand}
              title={noBrand ? t("cert.logoNoBrandLogo") : undefined}
              onClick={() => {
                if (id === "own" && !saved?.ownLogo) {
                  logoInput.current?.click();
                  return;
                }
                setDraft((d) => ({ ...d, logo: id }));
                saveSoon();
              }}
            >
              {t(`cert.logos.${id}`)}
            </button>
          );
        })}
        <input
          ref={logoInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void uploadLogo(file);
          }}
        />
      </div>
      {logoChoice === "own" && saved?.ownLogo && (
        <div className="action-row">
          <button type="button" className="btn ghost tiny" disabled={off} onClick={() => logoInput.current?.click()}>
            {busy === "logo" ? t("cert.working") : t("cert.logoReplace")}
          </button>
          <button type="button" className="link-btn" disabled={off} onClick={() => void removeLogo()}>
            {t("cert.logoRemove")}
          </button>
        </div>
      )}
      <p className="hint">{t("cert.logoHint")}</p>
      {!saved?.brandLogo && <p className="hint">{t("cert.logoNoBrandLogo")}</p>}
      <div className="pill-row cert-fonts" role="group" aria-label={t("cert.font")}>
        <span className="hint">{t("cert.font")}</span>
        {FONTS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`btn ghost tiny${style.font === f.id ? " on" : ""}`}
            style={{ fontFamily: f.css }}
            aria-pressed={style.font === f.id}
            disabled={off}
            onClick={() => setStyle({ font: f.id })}
          >
            {t(`cert.fonts.${f.id}`)}
          </button>
        ))}
      </div>
      {colorRow("accent", t("cert.colorAccent"))}
      {colorRow("ink", t("cert.colorInk"))}
      <div className="pill-row" role="group" aria-label={t("cert.panel")}>
        <span className="hint">{t("cert.panel")}</span>
        {PANELS.map((id) => (
          <button
            key={id}
            type="button"
            className={`btn ghost tiny${(style.panel || "soft") === id ? " on" : ""}`}
            aria-pressed={(style.panel || "soft") === id}
            disabled={off}
            onClick={() => setStyle({ panel: id })}
          >
            {t(`cert.panels.${id}`)}
          </button>
        ))}
      </div>
      <p className="hint">{t("cert.panelHint")}</p>
      </>
      )}
      {styleBack.length > 0 && (
        <div className="action-row">
          <button type="button" className="btn ghost tiny" disabled={off} onClick={undoStyle} title={styleLabel(styleBack[styleBack.length - 1])}>
            {t("cert.undoStyle")}
          </button>
          <span className="hint">{styleLabel(styleBack[styleBack.length - 1])}</span>
        </div>
      )}
      </details>
      <label className="shot-field">
        <span>{t("cert.heading")}</span>
        <input value={draft.title} maxLength={60} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
      </label>
      <label className="shot-field">
        <span>{t("cert.note")}</span>
        <input value={draft.note} maxLength={120} placeholder={t("cert.notePlaceholder")} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
      </label>
      <div className="pill-row" role="group" aria-label={t("cert.lang")}>
        <span className="hint">{t("cert.lang")}</span>
        {(["uk", "en"] as const).map((lang) => (
          <button
            key={lang}
            type="button"
            className={`btn ghost tiny${draft.lang === lang ? " on" : ""}`}
            aria-pressed={draft.lang === lang}
            disabled={off}
            onClick={() => {
              if (draft.lang === lang) return;
              setDraft({ ...draft, lang, title: STANDARD_TITLES.includes(draft.title.trim()) || !draft.title.trim() ? STANDARD_TITLE[lang] : draft.title });
              void translate(lang);
            }}
          >
            {t(lang === "uk" ? "home.picLang.uk" : "home.picLang.en")}
          </button>
        ))}
      </div>
      <p className="hint">{busy === "translate" ? t("cert.translating") : t("cert.translateHint")}</p>
      <label className="check-row">
        <input type="checkbox" checked={draft.codes !== false} disabled={off} onChange={(e) => setDraft({ ...draft, codes: e.target.checked })} />
        {t("cert.codesOn")}
      </label>
      <div className="certificate-people-head">
        <p className="pane-title">{t("cert.people", { n: draft.items.length })}</p>
        {draft.items.length > 1 && (
          <button
            type="button"
            className="link-btn"
            onClick={() => setOpenRows(openRows.length === draft.items.length ? [] : draft.items.map((_, j) => j))}
          >
            {openRows.length === draft.items.length ? t("cert.foldAll") : t("cert.unfoldAll")}
          </button>
        )}
      </div>
      {draft.items.map((item, i) => {
        const open = openRows.includes(i);
        const summary = [item.name.trim() || t("cert.noName"), item.gift.trim(), draft.codes !== false ? item.code : ""].filter(Boolean).join(" · ");
        return (
        <fieldset key={i} className={`certificate-row${picked === i ? " on" : ""}${open ? "" : " folded"}`} onFocus={() => setPicked(i)}>
          <legend className="hint">{t("cert.personN", { n: i + 1 })}</legend>
          <div className="certificate-row-top">
            <button
              type="button"
              className={`certificate-row-head${open ? " open" : ""}`}
              aria-expanded={open}
              onClick={() => {
                setOpenRows(open ? openRows.filter((j) => j !== i) : [...openRows, i]);
                if (!open) setPicked(i);
              }}
            >
              {summary}
            </button>
            {!open && (
              <button type="button" className="link-btn" disabled={off} onClick={() => download(i, "pdf")}>
                {busy === `pdf-${i}` ? t("cert.working") : "PDF"}
              </button>
            )}
          </div>
          {open && (
          <>
          <label className="shot-field">
            <span>{t("cert.name")}</span>
            <input value={item.name} maxLength={60} placeholder={t("cert.namePlaceholder")} onChange={(e) => setItem(i, { name: e.target.value })} />
          </label>
          <label className="shot-field">
            <span>{t("cert.gift")}</span>
            <input value={item.gift} maxLength={80} placeholder={t("cert.giftPlaceholder")} onChange={(e) => setItem(i, { gift: e.target.value })} />
          </label>
          <label className="shot-field">
            <span>{t("cert.giftNote")}</span>
            <input value={item.giftNote || ""} maxLength={120} placeholder={t("cert.giftNotePlaceholder")} onChange={(e) => setItem(i, { giftNote: e.target.value })} />
          </label>
          <div className="certificate-pair">
            <label className="shot-field">
              <span>{t("cert.validFrom")}</span>
              <input value={item.validFrom || ""} maxLength={40} placeholder={t("cert.validFromPlaceholder")} onChange={(e) => setItem(i, { validFrom: e.target.value })} />
            </label>
            <label className="shot-field">
              <span>{t("cert.valid")}</span>
              <input value={item.validUntil} maxLength={40} placeholder={t("cert.validPlaceholder")} onChange={(e) => setItem(i, { validUntil: e.target.value })} />
            </label>
          </div>
          <div className={draft.codes !== false ? "certificate-pair" : ""}>
            {draft.codes !== false && (
            <label className="shot-field">
              <span>{t("cert.code")}</span>
              <input
                value={item.code}
                maxLength={24}
                placeholder={t("cert.codePlaceholder")}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => setItem(i, { code: e.target.value.toUpperCase() })}
              />
            </label>
            )}
          </div>
          <div className="action-row">
            <button type="button" className="btn accent" disabled={off} onClick={() => download(i, "pdf")}>
              {busy === `pdf-${i}` ? t("cert.working") : t("cert.pdf")}
            </button>
            <button type="button" className="btn ghost" disabled={off} onClick={() => download(i, "png")}>
              {busy === `png-${i}` ? t("cert.working") : t("cert.png")}
            </button>
            {picked !== i && (
              <button type="button" className="link-btn" onClick={() => setPicked(i)}>
                {t("cert.show")}
              </button>
            )}
            {draft.items.length > 1 && (
              <button
                type="button"
                className="link-btn"
                disabled={off}
                onClick={() => {
                  setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) });
                  setPicked(0);
                  setOpenRows([0]);
                }}
              >
                {t("cert.remove")}
              </button>
            )}
          </div>
          </>
          )}
        </fieldset>
        );
      })}
      <div className="action-row">
        <button
          type="button"
          className="btn ghost"
          disabled={off || draft.items.length >= 50}
          onClick={() => {
            setOpenRows([draft.items.length]);
            setDraft({ ...draft, items: [...draft.items, { ...EMPTY, gift: draft.items[draft.items.length - 1]?.gift || "", giftNote: draft.items[draft.items.length - 1]?.giftNote || "", validFrom: draft.items[draft.items.length - 1]?.validFrom || "", validUntil: draft.items[draft.items.length - 1]?.validUntil || "" }] });
          }}
        >
          {t("cert.add")}
        </button>
        <button type="button" className="btn" disabled={off || !dirty} onClick={save}>
          {busy === "save" ? t("cert.working") : dirty ? t("cert.save") : t("cert.saved")}
        </button>
      </div>
      {error && <p className="err">{error}</p>}
    </div>
  );
}
