import { useEffect, useRef, useState } from "react";
import { fetchMedia } from "../lib/api";
import { useLocale } from "../i18n/locale";
import { ImageUploadError, prepareImage } from "../lib/imageUpload";

export const MAX_EXAMPLES = 3;

export type ExampleItem = { id: string; src: string };

/** Thumbnails + "Add picture". The caller decides what adding and removing means. */
export default function ExampleImages({
  items,
  onAdd,
  onRemove,
  busy = false,
  note,
}: {
  items: ExampleItem[];
  onAdd: (dataUrl: string) => Promise<void> | void;
  onRemove: (id: string) => Promise<void> | void;
  busy?: boolean;
  note?: string;
}) {
  const { t, te } = useLocale();
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const full = items.length >= MAX_EXAMPLES;

  async function pick(files: FileList | null) {
    setError("");
    const list = Array.from(files || []).slice(0, MAX_EXAMPLES - items.length);
    if (input.current) input.current.value = "";
    for (const file of list) {
      try {
        await onAdd(await prepareImage(file));
      } catch (err) {
        setError(err instanceof ImageUploadError || !(err instanceof Error) ? t("briefImages.badFile") : te(err.message));
        break;
      }
    }
  }

  return (
    <div className="examples">
      <p className="examples-title">{t("briefImages.title")}</p>
      <p className="hint">{t("briefImages.hint")}</p>
      <div className="examples-row">
        {items.map((item, i) => (
          <div className="example" key={item.id}>
            {item.src ? <img src={item.src} alt={t("briefImages.alt", { n: i + 1 })} /> : <span className="example-loading" aria-hidden />}
            <button
              type="button"
              className="example-x"
              aria-label={t("briefImages.remove")}
              disabled={busy}
              onClick={async () => {
                setError("");
                try {
                  await onRemove(item.id);
                } catch (err) {
                  setError(err instanceof Error ? te(err.message) : t("briefImages.badFile"));
                }
              }}
            >
              ×
            </button>
          </div>
        ))}
        {!full && (
          <label className={`example add${busy ? " off" : ""}`}>
            <span>+ {t("briefImages.add")}</span>
            <input
              ref={input}
              className="sr-only"
              type="file"
              accept="image/*"
              multiple
              disabled={busy}
              onChange={(e) => pick(e.target.files)}
            />
          </label>
        )}
      </div>
      {note && <p className="hint">{note}</p>}
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Authenticated image files can't go straight into <img src>, so fetch them as blobs. */
export function useProjectImageSrcs(refs: { id: string; url: string }[] | undefined) {
  const [srcs, setSrcs] = useState<Record<string, string>>({});
  const key = (refs || []).map((r) => r.id).join(",");
  useEffect(() => {
    let live = true;
    const made: string[] = [];
    (async () => {
      const next: Record<string, string> = {};
      for (const ref of refs || []) {
        try {
          const url = URL.createObjectURL(await fetchMedia(ref.url));
          made.push(url);
          next[ref.id] = url;
        } catch {
          /* thumbnail just stays empty */
        }
      }
      if (live) setSrcs(next);
    })();
    return () => {
      live = false;
      made.forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return srcs;
}
