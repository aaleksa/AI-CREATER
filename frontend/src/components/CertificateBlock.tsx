import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { api, fetchMedia, type CertificateItem, type CertificateLayout, type CertificateSettings, type Project } from "../lib/api";
import { useLocale } from "../i18n/locale";

const EMPTY: CertificateItem = { name: "", gift: "", giftNote: "", validFrom: "", validUntil: "", code: "" };
/** The headings the studio prints by default; they follow the label language, an owner's own heading does not. */
const STANDARD_TITLE = { uk: "Подарунковий сертифікат", en: "Gift certificate" } as const;
const STANDARD_TITLES: string[] = Object.values(STANDARD_TITLE);
const DEFAULT_LAYOUT: CertificateLayout = { x: 0.5, y: 0.5, scale: 1 };
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * Gift certificates from one painted design: the owner's exact words and a list of people, each with a code.
 * Saving, previews and every PDF are free — nothing here asks the AI.
 */
export default function CertificateBlock({
  project,
  onSaved,
  onPreview,
  disabled,
}: {
  project: Project;
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
  const box = saved?.boxes?.[picked] || { w: 0.57, h: 0.45 };

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
      {stageSrc && (
        <div className="cert-stage" ref={stageRef}>
          <img src={stageSrc} alt={t("cert.previewAlt")} draggable={false} />
          <div
            className="cert-box"
            role="slider"
            tabIndex={0}
            aria-label={t("cert.moveBlock")}
            aria-valuenow={Math.round(layout.scale * 100)}
            style={{
              left: `${(layout.x - (box.w * layout.scale) / 2) * 100}%`,
              top: `${(layout.y - (box.h * layout.scale) / 2) * 100}%`,
              width: `${box.w * layout.scale * 100}%`,
              height: `${box.h * layout.scale * 100}%`,
            }}
            onPointerDown={(e) => startDrag(e, "move")}
          >
            <span className="cert-box-handle" aria-hidden onPointerDown={(e) => startDrag(e, "size")} />
          </div>
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
      <p className="hint">{t("cert.dragHint")}</p>
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
