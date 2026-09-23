import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ArchiveState, type Project } from "../lib/api";
import { copyText } from "../lib/copy";
import { useLocale } from "../i18n/locale";

function fileGone(project: Project) {
  if (project.hasVideo || project.hasImages) return false;
  return project.status === "expired" || project.status === "ready";
}

export default function Library() {
  const { t, te, locale } = useLocale();
  const [projects, setProjects] = useState<Project[]>([]);
  const [archive, setArchive] = useState<ArchiveState | null>(null);
  const [copiedId, setCopiedId] = useState("");
  const [removingId, setRemovingId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .projects()
      .then((d) => {
        setProjects(d.projects);
        setArchive(d.archive || null);
      })
      .catch(() => setProjects([]));
  }, []);

  const dateLocale = locale === "uk" ? "uk-UA" : "en-GB";

  async function remove(id: string) {
    if (!window.confirm(t("library.confirmRemove"))) return;
    setError("");
    setRemovingId(id);
    try {
      await api.deleteProject(id);
      setProjects((current) => current.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("library.failRemove"));
    } finally {
      setRemovingId("");
    }
  }

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
      {archive && (
        <p className="hint">
          {t("library.archiveHint", { used: archive.used, limit: archive.limit })}
        </p>
      )}
      {error && <p className="err" style={{ marginTop: 12 }}>{error}</p>}
      <div className="list" style={{ marginTop: 24 }}>
        {projects.map((p) => (
          <div key={p.id} className="list-row">
            <Link to={`/app/studio/${p.id}`}>
              <span>
                <b className="brief-preview">{p.prompt}</b>
                <div className="hint">
                  {t(`formats.${p.type}.title`) || p.type} ·{" "}
                  {p.hasVideo
                    ? t("library.mp4")
                    : p.hasImages
                      ? t("library.stills")
                      : fileGone(p)
                        ? t("library.expired")
                        : p.status}{" "}
                  · {t("billing.creditsN", { n: p.creditsUsed })}
                </div>
                {fileGone(p) && <div className="hint">{t("library.expiredHint")}</div>}
              </span>
              <span className="hint">{new Date(p.createdAt).toLocaleString(dateLocale)}</span>
            </Link>
            <div className="list-actions">
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
              <button
                className="btn ghost"
                type="button"
                disabled={removingId === p.id}
                onClick={() => remove(p.id)}
              >
                {removingId === p.id ? t("library.removing") : t("library.remove")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
