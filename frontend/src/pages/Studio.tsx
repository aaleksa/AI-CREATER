import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, fetchMedia, refreshMe, type Project } from "../lib/api";

const VIDEO_STEPS = [
  { id: "idea", label: "Idea", cost: 5 },
  { id: "script", label: "Script", cost: 10 },
  { id: "visuals", label: "Visuals", cost: 40 },
  { id: "voice", label: "Voice", cost: 30 },
  { id: "captions", label: "Captions", cost: 10 },
  { id: "render", label: "Create", cost: 55 },
] as const;

const IMAGE_STEPS = [
  { id: "idea", label: "Idea", cost: 5 },
  { id: "visuals", label: "Pictures", cost: 32 },
] as const;

const STEP_REASONS: Record<string, { id: string; label: string }[]> = {
  idea: [
    { id: "wrong_angle", label: "Wrong angle" },
    { id: "too_salesy", label: "Too salesy" },
    { id: "not_our_audience", label: "Not our audience" },
    { id: "boring_hook", label: "Boring hook" },
    { id: "other", label: "Something else" },
  ],
  script: [
    { id: "too_long_short", label: "Too long or too short" },
    { id: "wrong_tone", label: "Wrong tone" },
    { id: "weak_cta", label: "Weak CTA" },
    { id: "not_our_voice", label: "Not our voice" },
    { id: "other", label: "Something else" },
  ],
  visuals: [
    { id: "wrong_style", label: "Wrong style" },
    { id: "wrong_colors", label: "Wrong colours" },
    { id: "doesnt_match_brand", label: "Doesn’t match the brand" },
    { id: "low_quality", label: "Low quality" },
    { id: "other", label: "Something else" },
  ],
  voice: [
    { id: "wrong_pace", label: "Wrong pace" },
    { id: "wrong_tone", label: "Wrong tone" },
    { id: "sounds_robotic", label: "Sounds robotic" },
    { id: "wrong_gender_accent", label: "Wrong voice or accent" },
    { id: "other", label: "Something else" },
  ],
  captions: [
    { id: "bad_timing", label: "Bad timing" },
    { id: "hard_to_read", label: "Hard to read" },
    { id: "other", label: "Something else" },
  ],
};

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

function VersionCompare({
  step,
  versions,
  onRestore,
  busy,
}: {
  step: "idea" | "script";
  versions: { id: string; accepted: boolean; payload: { title?: string; concept?: string; hook?: string; cta?: string; scenes?: { id: number; voiceover: string }[] } | null }[];
  onRestore: (step: "idea" | "script", id: string) => void;
  busy: boolean;
}) {
  if (versions.length < 2) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <p className="hint">Compare the last two. Using an older one is free and clears what follows.</p>
      <div className="compare-grid">
        {versions.map((version) => (
          <div key={version.id} className={`compare-card${version.accepted ? " on" : ""}`}>
            <p className="hint">{version.accepted ? "Current" : "Previous"}</p>
            {step === "idea" ? (
              <>
                <p><b>{version.payload?.title}</b></p>
                <p className="hint">{version.payload?.hook || version.payload?.concept}</p>
              </>
            ) : (
              <>
                <p className="hint">{version.payload?.cta}</p>
                <p className="hint">{version.payload?.scenes?.[0]?.voiceover}</p>
              </>
            )}
            {!version.accepted && (
              <button className="btn ghost" type="button" disabled={busy} onClick={() => onRestore(step, version.id)}>
                Use this version
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
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
  const [imageSrcs, setImageSrcs] = useState<Record<number, string>>({});
  const [pendingRegen, setPendingRegen] = useState<{ step: string; sceneId?: number } | null>(null);
  const [regenReason, setRegenReason] = useState("");
  const [regenNote, setRegenNote] = useState("");
  const [shareCopied, setShareCopied] = useState(false);
  const [kitHint, setKitHint] = useState("");

  useEffect(() => {
    if (!id) return;
    api.project(id).then((d) => {
      setProject(d.project);
      setBrief(d.project.prompt);
    }).catch((e) => setError(e.message));
    api
      .brand()
      .then((d) => {
        const progress = d.brandKit?.completeness;
        setKitHint(progress && progress.percent < 70 ? progress.hint : "");
      })
      .catch(() => setKitHint(""));
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

  useEffect(() => {
    if (!id || !project?.visuals?.length) {
      setImageSrcs({});
      return;
    }
    let cancelled = false;
    const created: string[] = [];
    Promise.all(
      project.visuals.map(async (visual) => {
        if (!visual.imageUrl || visual.imageUrl.startsWith("linear")) return [visual.sceneId, ""] as const;
        if (visual.imageUrl.startsWith("http")) return [visual.sceneId, visual.imageUrl] as const;
        const blob = await fetchMedia(visual.imageUrl);
        const url = URL.createObjectURL(blob);
        created.push(url);
        return [visual.sceneId, url] as const;
      })
    ).then((pairs) => {
      if (cancelled) return;
      setImageSrcs(Object.fromEntries(pairs.filter(([, url]) => url)));
    });
    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [id, project?.visuals, project?.updatedAt]);

  const isImage = project?.type === "image_post";
  const STEPS = isImage ? IMAGE_STEPS : VIDEO_STEPS;
  const next = useMemo(() => STEPS.find((s) => project && !doneThrough(project, s.id)), [project, isImage]);
  const lastDone = useMemo(() => [...STEPS].reverse().find((s) => project && doneThrough(project, s.id)), [project, isImage]);
  const extraPrice = (step: string, sceneId?: number) => {
    const base = sceneId ? 8 : STEPS.find((s) => s.id === step)?.cost ?? 0;
    const used = project?.stepAttempts?.[step] ?? 0;
    const included = project?.maxStepAttempts ?? 3;
    const mult = used >= included ? (project?.extraAttemptMultiplier ?? 2) : 1;
    return { extra: used >= included, credits: base * mult };
  };
  const frame =
    (project?.visuals?.[scene] && imageSrcs[project.visuals[scene].sceneId]) || project?.visuals?.[scene]?.imageUrl;
  const frameIsPlaceholder = Boolean(project?.visuals?.[scene]?.placeholder);
  const placeholderCount = project?.visuals?.filter((v) => v.placeholder).length ?? 0;
  const caption = project?.captions?.cues?.[scene]?.text || project?.script?.scenes?.[scene]?.onScreen || project?.idea?.title;

  async function execute(step: string, regenerate = false, sceneId?: number, feedback?: { reason?: string; note?: string }) {
    if (!id) return;
    setBusy(sceneId ? `visual-${sceneId}` : step);
    setError("");
    try {
      const { project: nextProject } = await api.runStep(id, step, regenerate, sceneId, feedback);
      setProject(nextProject);
      setBrief(nextProject.prompt);
      refreshMe();
      setPendingRegen(null);
      setRegenReason("");
      setRegenNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Step failed.");
    } finally {
      setBusy(null);
    }
  }

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
          ? `This remakes the idea and clears what follows. ${price.credits} credits.`
          : `This remakes the script and clears frames, voice and video. ${price.credits} credits.`
      );
      if (!ok) return;
    }
    if (regenerate && STEP_REASONS[step]) {
      setPendingRegen({ step, sceneId });
      setRegenReason("");
      setRegenNote("");
      return;
    }
    await execute(step, regenerate, sceneId);
  }

  async function goRegen(withReason: boolean) {
    if (!pendingRegen) return;
    if (withReason && regenReason === "other" && regenNote.trim().length < 2) {
      setError("Say what was wrong — a few words is enough.");
      return;
    }
    await execute(pendingRegen.step, true, pendingRegen.sceneId, withReason && regenReason ? { reason: regenReason, note: regenNote } : undefined);
  }

  async function restore(step: "idea" | "script" | "visuals", versionId: string, sceneId?: number) {
    if (!id) return;
    const ok = window.confirm(
      step === "idea"
        ? "Use this idea? It clears what follows. Free — you already paid for this version."
        : step === "visuals"
          ? "Use the previous picture? Free — you already paid for it. The video will need Create again."
          : "Use this script? It clears frames, voice and video. Free — you already paid for this version."
    );
    if (!ok) return;
    setBusy(sceneId ? `restore-visual-${sceneId}` : `restore-${step}`);
    setError("");
    try {
      const { project: nextProject } = await api.restoreVersion(id, step, versionId, sceneId);
      setProject(nextProject);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restore that version.");
    } finally {
      setBusy(null);
    }
  }

  async function sharePreview() {
    if (!id) return;
    setError("");
    try {
      const { url } = await api.sharePreview(id);
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create a preview link.");
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

  const makingLabel =
    busy === "render" ? "Rendering mp4…" : busy === "voice" ? "Recording voice…" : busy === "visuals" && isImage ? "Making pictures…" : "Making…";

  return (
    <div>
      <p className="hint">
        {project.type.replaceAll("_", " ")}
        {isImage && project.imageIntent
          ? ` · ${
              { photo: "just a photo", invite: "invitation", info: "information", offer: "offer" }[project.imageIntent] ||
              project.imageIntent
            }`
          : ""}
      </p>
      {kitHint && (
        <p className="hint">
          {kitHint}. <Link to="/app/brand">Brand kit</Link>
        </p>
      )}
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
          <div className={`phone${isImage ? " post" : ""}`} style={typeof frame === "string" && frame.startsWith("linear") ? { background: frame } : undefined}>
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
                    Couldn’t generate — regenerate this picture (8cr)
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
                    <span style={{ display: "block" }}>{isImage ? s.onScreen : s.voiceover}</span>
                  </button>
                  {project.visuals && (
                    <>
                      {project.visuals.find((v) => v.sceneId === s.id)?.placeholder && (
                        <p className="hint">Couldn’t generate — regenerate this picture (8cr)</p>
                      )}
                      <button
                        className="btn ghost"
                        disabled={Boolean(busy) || Boolean(pendingRegen)}
                        onClick={() => run("visuals", true, s.id)}
                      >
                        {busy === `visual-${s.id}`
                          ? "Making…"
                          : extraPrice("visuals", s.id).extra
                            ? `Another try · ${extraPrice("visuals", s.id).credits} credits (2×)`
                            : `Regenerate this picture · ${extraPrice("visuals", s.id).credits} credits`}
                      </button>
                      {project.versions?.visuals?.find((version) => !version.accepted) && (
                        <button
                          className="btn ghost"
                          disabled={Boolean(busy) || Boolean(pendingRegen)}
                          onClick={() => {
                            const previous = project.versions?.visuals?.find((version) => !version.accepted);
                            if (previous) restore("visuals", previous.id, s.id);
                          }}
                        >
                          {busy === `restore-visual-${s.id}` ? "Restoring…" : "Use previous picture · free"}
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <h2>{next ? `Step — ${next.label}` : "Ready"}</h2>
          {!project.idea && (
            <p className="lede">
              {isImage ? "We’ll propose a look before making pictures." : "We’ll propose a concept before writing a word of script."}
            </p>
          )}
          {project.idea && !project.visuals && isImage && (
            <>
              <p><b>{project.idea.title}</b></p>
              <p className="lede">{project.idea.concept}</p>
              <p className="hint">{project.idea.visualDirection}</p>
              <VersionCompare step="idea" versions={project.versions?.idea || []} onRestore={restore} busy={Boolean(busy)} />
            </>
          )}
          {project.idea && !project.script && !isImage && (
            <>
              <p><b>{project.idea.title}</b></p>
              <p className="lede">{project.idea.concept}</p>
              <p className="hint">{project.idea.visualDirection}</p>
              <VersionCompare step="idea" versions={project.versions?.idea || []} onRestore={restore} busy={Boolean(busy)} />
            </>
          )}
          {!isImage && project.script && !project.visuals && (
            <>
              <p className="lede">A 30-second voiceover, already broken into scenes.</p>
              <VersionCompare step="script" versions={project.versions?.script || []} onRestore={restore} busy={Boolean(busy)} />
            </>
          )}
          {!isImage && project.visuals && !project.audioUrl && (
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
          {project.hasImages && (
            <>
              <p className="ok">Your pictures are ready. {project.creditsUsed} credits used.</p>
              <p className="hint">Download the stills now. We keep them for 90 days. Recreating after that uses credits again.</p>
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn ghost" type="button" onClick={sharePreview}>
                  {shareCopied ? "Preview link copied" : "Share a preview"}
                </button>
                {project.visuals?.map((visual, i) => {
                  const src = imageSrcs[visual.sceneId];
                  if (!src || visual.placeholder) return null;
                  return (
                    <a key={visual.sceneId} className="btn" href={src} download={`still-${i + 1}.jpg`}>
                      Download {i + 1}
                    </a>
                  );
                })}
              </div>
              {project.feedback ? (
                <p className="ok" style={{ marginTop: 16 }}>Thanks — that helps the next post.</p>
              ) : (
                <div style={{ marginTop: 20 }}>
                  <p className="lede">Would you publish this post?</p>
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
                      {["Images", "Idea", "Brand style", "Too generic", "Not useful"].map((reason) => (
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
          {project.hasVideo && (
            <>
              <p className="ok">Your Reel is ready. {project.creditsUsed} credits used.</p>
              <p className="hint">
                Download this Reel now. We keep the mp4 for 90 days. Voice and frames may be cleared after 7 days.
                Recreating after that uses credits again.
              </p>
              <div className="row" style={{ marginTop: 18 }}>
                {videoSrc && (
                  <a className="btn" href={videoSrc} download="reel.mp4">
                    Download mp4
                  </a>
                )}
                <button className="btn ghost" type="button" onClick={sharePreview}>
                  {shareCopied ? "Preview link copied" : "Share a preview"}
                </button>
              </div>
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
            <button className="btn accent" style={{ marginTop: 18 }} disabled={Boolean(busy) || Boolean(pendingRegen)} onClick={() => run(next.id)}>
              {busy && busy === next.id
                ? makingLabel
                : extraPrice(next.id).extra
                  ? `Make ${next.label.toLowerCase()} · ${extraPrice(next.id).credits} credits (2×)`
                  : `Make ${next.label.toLowerCase()} · ${extraPrice(next.id).credits} credits`}
            </button>
          )}
          {pendingRegen && STEP_REASONS[pendingRegen.step] && (
            <div style={{ marginTop: 16 }}>
              <p className="lede">Why didn’t this work? Optional — skip if you’d rather just try again.</p>
              <div className="field" style={{ marginTop: 8 }}>
                <select value={regenReason} onChange={(e) => setRegenReason(e.target.value)}>
                  <option value="">Choose a reason</option>
                  {STEP_REASONS[pendingRegen.step].map((reason) => (
                    <option key={reason.id} value={reason.id}>
                      {reason.label}
                    </option>
                  ))}
                </select>
              </div>
              {regenReason === "other" && (
                <div className="field">
                  <textarea
                    value={regenNote}
                    onChange={(e) => setRegenNote(e.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder="A few words is enough"
                  />
                </div>
              )}
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => goRegen(false)}>
                  Skip
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={Boolean(busy) || (regenReason === "other" && regenNote.trim().length < 2)}
                  onClick={() => goRegen(Boolean(regenReason))}
                >
                  Try again
                </button>
              </div>
            </div>
          )}
          {lastDone && (
            <button
              className="btn ghost"
              style={{ marginTop: 10 }}
              disabled={Boolean(busy) || Boolean(pendingRegen)}
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
                if you want. A later redo clears what follows.
              </p>
              {STEPS.filter((s) => doneThrough(project, s.id)).map((s) => (
                <button
                  key={`regen-${s.id}`}
                  className="btn ghost"
                  style={{ marginTop: 8, marginRight: 8 }}
                  disabled={Boolean(busy) || Boolean(pendingRegen)}
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
            Used on this {isImage ? "post" : "Reel"}: {project.creditsUsed} credits · {isImage ? "stills 37" : "full video 150"}
          </p>
        </div>
      </div>
    </div>
  );
}
