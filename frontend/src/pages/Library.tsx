import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Project } from "../lib/api";
import { copyText } from "../lib/copy";
import { useLocale } from "../i18n/locale";

export default function Library() {
  const { t, locale } = useLocale();
  const [projects, setProjects] = useState<Project[]>([]);
  const [copiedId, setCopiedId] = useState("");

  useEffect(() => {
    api.projects().then((d) => setProjects(d.projects)).catch(() => setProjects([]));
  }, []);

  const dateLocale = locale === "uk" ? "uk-UA" : "en-GB";

  if (!projects.length) {
    return (
      <div>
        <h1 className="page-title" style={{ fontSize: 48 }}>{t("library.title")}</h1>
        <p className="empty">{t("library.empty")}</p>
        <Link className="btn" to="/app">{t("library.create")}</Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title" style={{ fontSize: 48 }}>{t("library.title")}</h1>
      <p className="hint">{t("library.hint")}</p>
      <div className="list" style={{ marginTop: 24 }}>
        {projects.map((p) => (
          <div key={p.id} className="list-row">
            <Link to={`/app/studio/${p.id}`}>
              <span>
                <b className="brief-preview">{p.prompt}</b>
                <div className="hint">
                  {t(`formats.${p.type}.title`) || p.type} ·{" "}
                  {p.hasVideo ? t("library.mp4") : p.hasImages ? t("library.stills") : p.status} ·{" "}
                  {t("billing.creditsN", { n: p.creditsUsed })}
                </div>
              </span>
              <span className="hint">{new Date(p.createdAt).toLocaleString(dateLocale)}</span>
            </Link>
            <button
              className="btn ghost"
              type="button"
              onClick={async () => {
                if (await copyText(p.prompt)) {
                  setCopiedId(p.id);
                  setTimeout(() => setCopiedId(""), 2500);
                }
              }}
            >
              {copiedId === p.id ? t("library.copied") : t("library.copyBrief")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
