import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, fetchMedia, refreshMe, type Project } from "../lib/api";

const STEPS = [
  { id: "idea", label: "Idea", cost: 5 },
  { id: "script", label: "Script", cost: 10 },
  { id: "visuals", label: "Visuals", cost: 40 },
  { id: "voice", label: "Voice", cost: 30 },
  { id: "captions", label: "Captions", cost: 10 },
  { id: "render", label: "Create", cost: 55 },
] as const;

function doneThrough(project: Project, step: string) {
  const map: Record<string, unknown> = {
    idea: project.idea,
    script: project.script,
    visuals: project.visuals,
    voice: project.audioUrl,
    captions: project.captions,
    render: project.hasVideo,
  };
  return Boolean(map[step]);
}

export default function Studio() {
  const { id } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [scene, setScene] = useState(0);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.project(id).then((d) => setProject(d.project)).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (!id || !project?.hasVideo) {
      setVideoSrc(null);
      return;
    }
    let cancelled = false;
    let url = "";
    fetchMedia(`/projects/${id}/file`)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setVideoSrc(url);
      })
      .catch(() => {
        if (!cancelled) setVideoSrc(null);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, project?.hasVideo]);

  useEffect(() => {
    if (!id || !project?.audioUrl) {
      setAudioSrc(null);
      return;
    }
    let cancelled = false;
    let url = "";
    fetchMedia(`/projects/${id}/audio`)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setAudioSrc(url);
      })
      .catch(() => {
        if (!cancelled) setAudioSrc(null);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, project?.audioUrl]);

  const next = useMemo(() => STEPS.find((s) => project && !doneThrough(project, s.id)), [project]);
  const frame = project?.visuals?.[scene]?.imageUrl;
  const caption = project?.captions?.cues?.[scene]?.text || project?.script?.scenes?.[scene]?.onScreen || project?.idea?.title;

  async function run(step: string, regenerate = false) {
    if (!id) return;
    setBusy(step);
    setError("");
    try {
      const { project: nextProject } = await api.runStep(id, step, regenerate);
      setProject(nextProject);
      refreshMe();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Step failed.");
    } finally {
      setBusy(null);
    }
  }

  if (!project) return <p className="hint">{error || "Opening the studio…"}</p>;

  const makingLabel = busy === "render" ? "Rendering mp4…" : busy === "voice" ? "Recording voice…" : "Making…";

  return (
    <div>
      <p className="hint">{project.type.replaceAll("_", " ")}</p>
      <h1 className="page-title" style={{ fontSize: 42 }}>{project.prompt}</h1>
      <div className="steps">
        {STEPS.map((s, i) => {
          const isDone = doneThrough(project, s.id);
          const isOn = next?.id === s.id;
          return (
            <span key={s.id} className={`step ${isDone ? "done" : ""} ${isOn ? "on" : ""}`}>
              {i + 1}. {s.label}
            </span>
          );
        })}
      </div>

      <div className="studio">
        <div>
          <div className="phone" style={typeof frame === "string" && frame.startsWith("linear") ? { background: frame } : undefined}>
            {project.hasVideo && videoSrc ? (
              <video className="phone-video" src={videoSrc} controls playsInline />
            ) : (
              <>
                {frame && !frame.startsWith("linear") && (
                  <div className="phone-frame" style={{ backgroundImage: `url(${frame})` }} />
                )}
                {typeof frame === "string" && frame.startsWith("linear") && (
                  <div className="phone-frame" style={{ background: frame }} />
                )}
                {!frame && <div className="phone-frame" style={{ background: "linear-gradient(160deg,#2b1d14,#c45c26)" }} />}
                <div className="caption">{caption}</div>
              </>
            )}
          </div>
          {project.script && (
            <div className="scenes">
              {project.script.scenes.map((s, i) => (
                <button key={s.id} className="scene" onClick={() => setScene(i)} style={{ background: "none", borderLeft: 0, borderRight: 0, borderTop: 0, textAlign: "left", width: "100%" }}>
                  <b>{s.time}</b>
                  <span>{s.voiceover}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <h2>{next ? `Step — ${next.label}` : "Ready"}</h2>
          {!project.idea && <p className="lede">We’ll propose a concept before writing a word of script.</p>}
          {project.idea && !project.script && (
            <>
              <p><b>{project.idea.title}</b></p>
              <p className="lede">{project.idea.concept}</p>
              <p className="hint">{project.idea.visualDirection}</p>
            </>
          )}
          {project.script && !project.visuals && <p className="lede">A 30-second voiceover, already broken into scenes.</p>}
          {project.visuals && !project.audioUrl && (
            <p className="lede">Frames are in. Next we record a voiceover. Direction JSON is not enough — this step finishes when you can hear it.</p>
          )}
          {project.audioUrl && !project.captions && (
            <>
              <p><b>{project.voice?.voicePreset || project.voice?.voice}</b></p>
              <p className="lede">{project.voice?.notes}</p>
              {audioSrc && <audio controls src={audioSrc} style={{ width: "100%", marginTop: 12 }} />}
            </>
          )}
          {project.captions && !project.hasVideo && <p className="lede">Captions are timed. Create writes a 9:16 mp4 you can download.</p>}
          {project.hasVideo && (
            <>
              <p className="ok">Your Reel is ready. {project.creditsUsed} credits used.</p>
              <p className="hint">
                Download this Reel now. We keep the mp4 for 90 days. Voice and frames may be cleared after 7 days.
                Recreating after that uses credits again.
              </p>
              {videoSrc && (
                <a className="btn" style={{ marginTop: 18 }} href={videoSrc} download="reel.mp4">
                  Download mp4
                </a>
              )}
            </>
          )}

          {next && (
            <button className="btn accent" style={{ marginTop: 18 }} disabled={Boolean(busy)} onClick={() => run(next.id)}>
              {busy && busy === next.id ? makingLabel : `Make ${next.label.toLowerCase()} · ${next.cost} credits`}
            </button>
          )}
          {STEPS.some((s) => doneThrough(project, s.id)) && (
            <div style={{ marginTop: 18 }}>
              <p className="hint">Didn’t like a step? Regenerate it — same credits, later steps reset.</p>
              {STEPS.filter((s) => doneThrough(project, s.id)).map((s) => (
                <button
                  key={`regen-${s.id}`}
                  className="btn ghost"
                  style={{ marginTop: 8, marginRight: 8 }}
                  disabled={Boolean(busy)}
                  onClick={() => run(s.id, true)}
                >
                  {busy === s.id ? makingLabel : `Regenerate ${s.label.toLowerCase()} · ${s.cost}`}
                </button>
              ))}
            </div>
          )}
          {error && (
            <p className="err">
              {error}
              {error.toLowerCase().includes("credit") && (
                <>
                  {" "}
                  <Link to="/app/billing">Buy credits</Link>
                </>
              )}
            </p>
          )}
          <p className="hint" style={{ marginTop: 18 }}>
            Used on this Reel: {project.creditsUsed} credits · full video 150
          </p>
        </div>
      </div>
    </div>
  );
}
