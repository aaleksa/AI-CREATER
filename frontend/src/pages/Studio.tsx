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
  const [brief, setBrief] = useState("");
  const [briefSaved, setBriefSaved] = useState(false);
  const [publishable, setPublishable] = useState("");
  const [reasons, setReasons] = useState<string[]>([]);

  useEffect(() => {
    if (!id) return;
    api.project(id).then((d) => {
      setProject(d.project);
      setBrief(d.project.prompt);
    }).catch((e) => setError(e.message));
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
  const lastDone = useMemo(() => [...STEPS].reverse().find((s) => project && doneThrough(project, s.id)), [project]);
  const extraPrice = (step: string, sceneId?: number) => {
    const base = sceneId ? 8 : STEPS.find((s) => s.id === step)?.cost ?? 0;
    const used = project?.stepAttempts?.[step] ?? 0;
    const included = project?.maxStepAttempts ?? 3;
    const mult = used >= included ? (project?.extraAttemptMultiplier ?? 2) : 1;
    return { extra: used >= included, credits: base * mult };
  };
  const frame = project?.visuals?.[scene]?.imageUrl;
  const frameIsPlaceholder = Boolean(project?.visuals?.[scene]?.placeholder);
  const placeholderCount = project?.visuals?.filter((v) => v.placeholder).length ?? 0;
  const caption = project?.captions?.cues?.[scene]?.text || project?.script?.scenes?.[scene]?.onScreen || project?.idea?.title;

  async function run(step: string, regenerate = false, sceneId?: number) {
    if (!id || !project) return;
    if (regenerate && !sceneId && step === "idea" && brief.trim() !== project.prompt) {
      try {
        const { project: saved } = await api.updatePrompt(id, brief);
        setProject(saved);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save the brief.");
        return;
      }
    }
    const price = extraPrice(step, sceneId);
    if (price.extra) {
      const ok = window.confirm(
        `Keep this version (free), or try again at 2× — ${price.credits} credits? We pay the AI on every extra try.`
      );
      if (!ok) return;
    } else if (regenerate && !sceneId && (step === "idea" || step === "script")) {
      const ok = window.confirm(
        step === "idea"
          ? `This remakes the idea and clears script, frames, voice and video. ${price.credits} credits.`
          : `This remakes the script and clears frames, voice and video. ${price.credits} credits.`
      );
      if (!ok) return;
    }
    setBusy(sceneId ? `visual-${sceneId}` : step);
    setError("");
    try {
      const { project: nextProject } = await api.runStep(id, step, regenerate, sceneId);
      setProject(nextProject);
      setBrief(nextProject.prompt);
      refreshMe();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Step failed.");
    } finally {
      setBusy(null);
    }
  }

  async function sendFeedback() {
    if (!id || !publishable) return;
    setError("");
    try {
      const { project: nextProject } = await api.saveFeedback(id, publishable, reasons);
      setProject(nextProject);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that.");
    }
  }

  async function saveBrief() {
    if (!id) return;
    setError("");
    try {
      const { project: nextProject } = await api.updatePrompt(id, brief);
      setProject(nextProject);
      setBriefSaved(true);
      setTimeout(() => setBriefSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the brief.");
    }
  }

  if (!project) return <p className="hint">{error || "Opening the studio…"}</p>;

  const makingLabel = busy === "render" ? "Rendering mp4…" : busy === "voice" ? "Recording voice…" : "Making…";

  return (
    <div>
      <p className="hint">{project.type.replaceAll("_", " ")}</p>
      <div className="field">
        <label htmlFor="brief">What you asked for — change it if this isn’t right</label>
        <textarea
          id="brief"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          maxLength={2000}
          rows={3}
        />
      </div>
      <div className="row" style={{ marginBottom: 20 }}>
        <button className="btn ghost" type="button" disabled={brief.trim() === project.prompt} onClick={saveBrief}>
          Save brief
        </button>
        {briefSaved && <span className="ok">Saved. Regenerate idea to use the new brief.</span>}
      </div>
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
                {frameIsPlaceholder && (
                  <div className="caption" style={{ top: 18, bottom: "auto", fontSize: 14, fontFamily: "var(--sans, inherit)" }}>
                    Couldn’t generate — regenerate this frame (8cr)
                  </div>
                )}
                <div className="caption">{caption}</div>
              </>
            )}
          </div>
          {project.script && (
            <div className="scenes">
              {project.script.scenes.map((s, i) => (
                <div key={s.id} className="scene" style={{ display: "grid", gap: 8 }}>
                  <button onClick={() => setScene(i)} style={{ background: "none", border: 0, textAlign: "left", width: "100%", padding: 0, color: "inherit" }}>
                    <b>{s.time}</b>
                    <span style={{ display: "block" }}>{s.voiceover}</span>
                  </button>
                  {project.visuals && (
                    <>
                      {project.visuals.find((v) => v.sceneId === s.id)?.placeholder && (
                        <p className="hint">Couldn’t generate — regenerate this frame (8cr)</p>
                      )}
                      <button
                        className="btn ghost"
                        disabled={Boolean(busy)}
                        onClick={() => run("visuals", true, s.id)}
                      >
                        {busy === `visual-${s.id}`
                          ? "Making…"
                          : extraPrice("visuals", s.id).extra
                            ? `Another try · ${extraPrice("visuals", s.id).credits} credits (2×)`
                            : `Regenerate this frame · ${extraPrice("visuals", s.id).credits} credits`}
                      </button>
                    </>
                  )}
                </div>
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
            <p className="lede">
              {placeholderCount
                ? `${placeholderCount} frame${placeholderCount === 1 ? "" : "s"} couldn’t be generated. Regenerate them for 8 credits each before Voice, or the Reel will use colour cards.`
                : "Frames are in. If one shot missed, regenerate that frame for 8 credits — not the whole set. Next we record a voiceover."}
            </p>
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
              {project.feedback ? (
                <p className="ok" style={{ marginTop: 16 }}>Thanks — that helps the next Reel.</p>
              ) : (
                <div style={{ marginTop: 20 }}>
                  <p className="lede">Would you publish this Reel?</p>
                  <div className="row" style={{ marginTop: 8 }}>
                    {[
                      ["yes", "Yes"],
                      ["edits", "Yes, after minor edits"],
                      ["no", "No"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={`btn ${publishable === value ? "accent" : "ghost"}`}
                        onClick={() => setPublishable(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {publishable && publishable !== "yes" && (
                    <div style={{ marginTop: 12 }}>
                      <p className="hint">What was wrong?</p>
                      {["Voice", "Script", "Images", "Captions", "Brand style", "Too generic", "Not useful"].map((reason) => (
                        <label key={reason} className="hint" style={{ display: "block", marginTop: 6 }}>
                          <input
                            type="checkbox"
                            checked={reasons.includes(reason)}
                            onChange={() =>
                              setReasons((current) =>
                                current.includes(reason) ? current.filter((item) => item !== reason) : [...current, reason]
                              )
                            }
                          />{" "}
                          {reason}
                        </label>
                      ))}
                    </div>
                  )}
                  {publishable && (
                    <button className="btn" style={{ marginTop: 12 }} type="button" onClick={sendFeedback}>
                      Send
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {next && (
            <button className="btn accent" style={{ marginTop: 18 }} disabled={Boolean(busy)} onClick={() => run(next.id)}>
              {busy && busy === next.id
                ? makingLabel
                : extraPrice(next.id).extra
                  ? `Make ${next.label.toLowerCase()} · ${extraPrice(next.id).credits} credits (2×)`
                  : `Make ${next.label.toLowerCase()} · ${extraPrice(next.id).credits} credits`}
            </button>
          )}
          {lastDone && (
            <button
              className="btn ghost"
              style={{ marginTop: 10 }}
              disabled={Boolean(busy)}
              onClick={() => run(lastDone.id, true)}
            >
              {busy === lastDone.id
                ? makingLabel
                : extraPrice(lastDone.id).extra
                  ? `Keep this, or another try · ${extraPrice(lastDone.id).credits} credits (2×)`
                  : `Not this ${lastDone.label.toLowerCase()}? Try again · ${extraPrice(lastDone.id).credits} credits`}
            </button>
          )}
          {STEPS.some((s) => doneThrough(project, s.id)) && (
            <div style={{ marginTop: 18 }}>
              <p className="hint">
                Keep this version — that’s free. Two retries at the usual price. After that you can still try, at 2×,
                if you want. A later redo clears the video.
              </p>
              {STEPS.filter((s) => doneThrough(project, s.id)).map((s) => (
                <button
                  key={`regen-${s.id}`}
                  className="btn ghost"
                  style={{ marginTop: 8, marginRight: 8 }}
                  disabled={Boolean(busy)}
                  onClick={() => run(s.id, true)}
                >
                  {busy === s.id
                    ? makingLabel
                    : extraPrice(s.id).extra
                      ? `Another ${s.label.toLowerCase()} · ${extraPrice(s.id).credits} (2×)`
                      : `Regenerate ${s.label.toLowerCase()} · ${extraPrice(s.id).credits}`}
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
