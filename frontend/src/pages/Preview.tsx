import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import LanguageSwitch from "../components/LanguageSwitch";
import { useLocale } from "../i18n/locale";

type Preview = {
  title: string;
  concept: string;
  type: string;
  hasVideo: boolean;
  hasImages: boolean;
  slides: number[];
  expiresAt: string;
};

export default function Preview() {
  const { token } = useParams();
  const { t, te, locale } = useLocale();
  const [data, setData] = useState<Preview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch(`/share/${token}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as Preview & { error?: string };
        if (!res.ok) throw new Error(body.error || "This preview has expired.");
        setData(body);
      })
      .catch((err) => setError(err instanceof Error ? te(err.message) : t("preview.expired")));
  }, [token, te, t]);

  return (
    <div className="landing">
      <header className="topbar">
        <Link to="/" className="brand">
          Aut<span>eur</span>
        </Link>
        <LanguageSwitch />
      </header>
      {error && <p className="err">{error}</p>}
      {!error && !data && <p className="hint">{t("preview.opening")}</p>}
      {data && (
        <>
          <p className="hint">{t("preview.notPosted")}</p>
          <h1 style={{ fontSize: "clamp(32px, 5vw, 48px)" }}>{data.title}</h1>
          {data.concept && <p className="lede">{data.concept}</p>}
          {data.hasVideo && (
            <video className="phone-video" style={{ width: "min(360px, 100%)", borderRadius: 24, marginTop: 24 }} src={`/share/${token}/file`} controls playsInline />
          )}
          {data.hasImages && (
            <div className="row" style={{ marginTop: 24, flexWrap: "wrap" }}>
              {data.slides.map((sceneId) => (
                <img
                  key={sceneId}
                  src={`/share/${token}/image/${sceneId}`}
                  alt={t("preview.slide", { n: sceneId })}
                  style={{ width: 180, height: 180, objectFit: "cover", borderRadius: 16 }}
                />
              ))}
            </div>
          )}
          <p className="hint" style={{ marginTop: 24 }}>
            {t("preview.expires", { when: new Date(data.expiresAt).toLocaleString(locale === "uk" ? "uk-UA" : "en-GB") })}
          </p>
        </>
      )}
    </div>
  );
}
