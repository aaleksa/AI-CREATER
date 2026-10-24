import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fetchMedia, type BrandKitRow, type Project } from "../lib/api";
import { useLocale } from "../i18n/locale";
import BrandToggle from "./BrandToggle";

const MAX_BYTES = 15 * 1024 * 1024;
const PAGE = 24;
/** Kinds in the order of Create, so the filter reads the same way. */
const KIND_ORDER = ["photo", "invite", "announce", "info", "offer", "launch", "review", "greeting", "infographic", "certificate", "own"];

/** PNG, JPG and WebP go as they are; anything else the browser can open (HEIC in Safari, big files) becomes a sharp JPG. */
async function asUpload(file: File): Promise<Blob> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const known =
    (head[0] === 0x89 && head[1] === 0x50) ||
    (head[0] === 0xff && head[1] === 0xd8) ||
    String.fromCharCode(...head.slice(8, 12)) === "WEBP";
  if (known && file.size <= MAX_BYTES) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("unreadable"));
      el.src = url;
    });
    const scale = Math.min(1, 4096 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((img.naturalWidth || 1024) * scale));
    canvas.height = Math.max(1, Math.round((img.naturalHeight || 1024) * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("unreadable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) throw new Error("unreadable");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** "Your own picture" on Create: upload a file, or take a picture already made in one of your projects. */
export default function OwnPictureStart({ kit }: { kit: BrandKitRow | null }) {
  const { t, te } = useLocale();
  const nav = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [useBrand, setUseBrand] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [pictures, setPictures] = useState<Project[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const thumbsRef = useRef(thumbs);
  thumbsRef.current = thumbs;
  const [kind, setKind] = useState("");
  const [shown, setShown] = useState(PAGE);
  const kindOf = (p: Project) => p.imageIntent || "photo";
  const counts = pictures.reduce<Record<string, number>>((all, p) => ({ ...all, [kindOf(p)]: (all[kindOf(p)] || 0) + 1 }), {});
  const kinds = KIND_ORDER.filter((id) => counts[id]).concat(Object.keys(counts).filter((id) => !KIND_ORDER.includes(id)));
  const filtered = kind ? pictures.filter((p) => kindOf(p) === kind) : pictures;
  const visible = filtered.slice(0, shown);

  useEffect(() => {
    api
      .projects()
      .then((d) =>
        setPictures(
          (d.projects as Project[]).filter((p) => p.type === "image_post" && p.hasImages && p.status !== "expired")
        )
      )
      .catch(() => setPictures([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    for (const p of visible) {
      if (thumbs[p.id]) continue;
      // A certificate shows as it prints — with its words — since that is what you take.
      const src =
        p.imageIntent === "certificate"
          ? `/projects/${p.id}/certificate/0?format=preview&t=${encodeURIComponent(p.updatedAt || "")}`
          : `/projects/${p.id}/image/1?t=${encodeURIComponent(p.updatedAt || "")}`;
      fetchMedia(src)
        .then((blob) => {
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          setThumbs((all) => ({ ...all, [p.id]: url }));
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [visible.map((p) => p.id).join(",")]);

  useEffect(
    () => () => {
      Object.values(thumbsRef.current).forEach((url) => URL.revokeObjectURL(url));
    },
    []
  );

  async function upload(file: File) {
    setBusy("upload");
    setError("");
    try {
      const body = await asUpload(file);
      if (body.size > MAX_BYTES) throw new Error(t("own.tooBig"));
      const { project } = await api.createOwnPicture(body, file.name, useBrand);
      nav(`/app/studio/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? (err.message === "unreadable" ? t("own.unreadable") : te(err.message)) : t("home.fallback"));
    } finally {
      setBusy("");
    }
  }

  const [certPick, setCertPick] = useState<Project | null>(null);

  async function pick(id: string, index?: number) {
    setBusy(index === undefined ? id : `${id}-${index}`);
    setError("");
    try {
      const { project } = await api.createOwnFromProject(id, useBrand, index);
      nav(`/app/studio/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("home.fallback"));
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="create-step own-start">
      <p className="step-label">{t("own.ask")}</p>
      <p className="hint">{t("own.hint")}</p>
      <div className="action-row">
        <button type="button" className="btn accent" disabled={Boolean(busy)} onClick={() => input.current?.click()}>
          {busy === "upload" ? t("own.uploading") : t("own.upload")}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
      </div>
      <BrandToggle
        compact
        value={useBrand}
        onChange={setUseBrand}
        ask={t("home.useBrandAsk")}
        onLabel={t("home.useBrand")}
        onHint={t("own.brandHint")}
        offLabel={t("home.skipBrand")}
        offHint={t("own.noBrandHint")}
        usingLabel={t("home.brandUsing")}
        kit={kit}
      />
      {pictures.length > 0 && (
        <>
          <p className="step-label" style={{ marginTop: 18 }}>{t("own.fromLibrary")}</p>
          {kinds.length > 1 && (
            <div className="pills own-kinds" role="group" aria-label={t("own.kindFilter")}>
              {["", ...kinds].map((id) => (
                <button
                  key={id || "all"}
                  type="button"
                  className={`pill ${kind === id ? "on" : ""}`}
                  aria-pressed={kind === id}
                  onClick={() => {
                    setKind(id);
                    setShown(PAGE);
                  }}
                >
                  {id ? t(`kinds.${id}.label`) : t("own.allKinds")} ({id ? counts[id] : pictures.length})
                </button>
              ))}
            </div>
          )}
          <div className="own-library">
            {visible.map((p) => (
              <button
                key={p.id}
                type="button"
                className="own-library-item"
                disabled={Boolean(busy)}
                onClick={() => {
                  const people = p.imageIntent === "certificate" ? p.certificate?.items || [] : [];
                  if (people.length > 1) setCertPick(certPick?.id === p.id ? null : p);
                  else void pick(p.id, people.length ? 0 : undefined);
                }}
                title={p.idea?.title || p.prompt}
              >
                {thumbs[p.id] ? <img src={thumbs[p.id]} alt="" /> : <span className="own-library-empty" aria-hidden />}
                <span className="own-library-name">{busy === p.id ? t("own.opening") : p.idea?.title || p.prompt}</span>
              </button>
            ))}
          </div>
          {certPick && (
            <div className="own-cert-pick">
              <p className="hint">{t("own.certWhich", { n: certPick.certificate?.items.length || 0 })}</p>
              <div className="action-row">
                {(certPick.certificate?.items || []).map((item, i) => (
                  <button key={i} type="button" className="btn ghost tiny" disabled={Boolean(busy)} onClick={() => void pick(certPick.id, i)}>
                    {busy === `${certPick.id}-${i}`
                      ? t("own.opening")
                      : [t("cert.personN", { n: i + 1 }), item.name || t("cert.noName"), item.gift].filter(Boolean).join(" · ")}
                  </button>
                ))}
              </div>
            </div>
          )}
          {filtered.length > visible.length && (
            <div className="action-row">
              <button type="button" className="btn ghost" onClick={() => setShown(shown + PAGE)}>
                {t("own.showMore", { n: Math.min(PAGE, filtered.length - visible.length) })}
              </button>
            </div>
          )}
          <p className="hint">{t("own.libraryHint")}</p>
        </>
      )}
      {error && <p className="err">{error}</p>}
    </section>
  );
}
