import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

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
      .catch((err) => setError(err instanceof Error ? err.message : "This preview has expired."));
  }, [token]);

  return (
    <div className="landing">
      <header className="topbar">
        <Link to="/" className="brand">
          Aut<span>eur</span>
        </Link>
      </header>
      {error && <p className="err">{error}</p>}
      {!error && !data && <p className="hint">Opening preview…</p>}
      {data && (
        <>
          <p className="hint">Preview — not posted yet</p>
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
                  alt={`Slide ${sceneId}`}
                  style={{ width: 180, height: 180, objectFit: "cover", borderRadius: 16 }}
                />
              ))}
            </div>
          )}
          <p className="hint" style={{ marginTop: 24 }}>
            This link expires {new Date(data.expiresAt).toLocaleString()}. Download stays in the studio.
          </p>
        </>
      )}
    </div>
  );
}
