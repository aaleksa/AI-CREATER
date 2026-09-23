import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, fetchMedia, refreshMe, type InviteCard, type Project } from "../lib/api";
import BrandToggle from "../components/BrandToggle";
import { formatBrandHint, useLocale } from "../i18n/locale";

const VIDEO_STEPS = [
  { id: "idea", cost: 5 },
  { id: "script", cost: 10 },
  { id: "visuals", cost: 40 },
  { id: "voice", cost: 30 },
  { id: "captions", cost: 10 },
  { id: "render", cost: 55 },
] as const;

const EMPTY_INVITE: InviteCard = {
  name: "",
  date: "",
  time: "",
  place: "",
  address: "",
  intro: "",
  closing: "",
  lines: [],
  program: [],
};

const INVITE_FIELDS: { key: "name" | "date" | "time" | "place" | "address"; label: string }[] = [
  { key: "name", label: "Title" },
  { key: "date", label: "Date" },
  { key: "time", label: "Time" },
  { key: "place", label: "Place" },
  { key: "address", label: "Address" },
];

function draftFromInvite(invite: InviteCard): InviteCard {
  return {
    ...EMPTY_INVITE,
    ...invite,
    lines: invite.lines || [],
    program: invite.program || [],
  };
}

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

function PictureCompare({
  versions,
  srcs,
  liveSrc,
  onRestore,
  onPreview,
  previewId,
  busy,
  poster,
  t,
}: {
  versions: { id: string; accepted: boolean }[];
  srcs: Record<string, string>;
  liveSrc?: string;
  onRestore: (versionId: string) => void;
  onPreview: (versionId: string) => void;
  previewId: string | null;
  busy: boolean;
  poster?: boolean;
  t: (path: string, vars?: Record<string, string | number>) => string;
}) {
  if (versions.length < 2) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <p className="hint">{t("studio.compareLast")}</p>
      <div className="compare-grid">
        {versions.map((version, index) => {
          const src = srcs[version.id] || (version.accepted ? liveSrc : "");
          const showing = previewId === version.id || (!previewId && version.accepted);
          const label = version.accepted ? t("studio.current") : t("studio.takeN", { n: index + 1 });
          return (
            <div key={version.id} className={`compare-card${showing ? " on" : ""}`}>
              <p className="hint">{label}</p>
              {src ? (
                <button
                  type="button"
                  className="compare-still-btn"
                  onClick={() => onPreview(version.id)}
                  aria-label={label}
                >
                  <img className={`compare-still${poster ? " poster" : ""}`} src={src} alt={label} />
                </button>
              ) : (
                <p className="hint">{t("studio.gone")}</p>
              )}
              {!version.accepted && src && (
                <button className="btn ghost" type="button" disabled={busy} onClick={() => onRestore(version.id)}>
                  {t("studio.useVersion")}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VersionCompare({
  step,
  versions,
  onRestore,
  busy,
  t,
}: {
  step: "idea" | "script";
  versions: { id: string; accepted: boolean; payload: { title?: string; concept?: string; hook?: string; cta?: string; scenes?: { id: number; voiceover: string }[] } | null }[];
  onRestore: (step: "idea" | "script", id: string) => void;
  busy: boolean;
  t: (path: string, vars?: Record<string, string | number>) => string;
}) {
  if (versions.length < 2) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <p className="hint">{t("studio.ideaCompare")}</p>
      <div className="compare-grid">
        {versions.map((version, index) => (
          <div key={version.id} className={`compare-card${version.accepted ? " on" : ""}`}>
            <p className="hint">{version.accepted ? t("studio.current") : t("studio.takeN", { n: index + 1 })}</p>
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
                {t("studio.useVersion")}
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
  const { t, te } = useLocale();
  const [project, setProject] = useState<Project | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [scene, setScene] = useState(0);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [brief, setBrief] = useState("");
  const [briefSaved, setBriefSaved] = useState(false);
  const [briefSaving, setBriefSaving] = useState(false);
  const [publishable, setPublishable] = useState("");
  const [reasons, setReasons] = useState<string[]>([]);
  const [imageSrcs, setImageSrcs] = useState<Record<number, string>>({});
  const [versionSrcs, setVersionSrcs] = useState<Record<string, string>>({});
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
  const [pendingRegen, setPendingRegen] = useState<{ step: string; sceneId?: number } | null>(null);
  const [regenReason, setRegenReason] = useState("");
  const [regenNote, setRegenNote] = useState("");
  const [shareCopied, setShareCopied] = useState(false);
  const [kitHint, setKitHint] = useState("");
  const [inviteDraft, setInviteDraft] = useState<InviteCard>(EMPTY_INVITE);
  const [inviteSaved, setInviteSaved] = useState(false);
  const [brandSaved, setBrandSaved] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api.project(id).then((d) => {
      if (cancelled) return;
      setProject(d.project);
      setBrief(d.project.prompt);
      if (d.project.invite) setInviteDraft(draftFromInvite(d.project.invite));
    }).catch((e) => {
      if (!cancelled) setError(e.message);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    api
      .brand()
      .then((d) => {
        const progress = d.brandKit?.completeness;
        setKitHint(progress && progress.percent < 70 ? formatBrandHint(t, progress) : "");
      })
      .catch(() => setKitHint(""));
  }, [t]);

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

  useEffect(() => {
    const versions = project?.type === "image_post" ? project.versions?.visuals || [] : [];
    const sceneId = project?.visuals?.[0]?.sceneId ?? 1;
    if (!id || versions.length < 2) {
      setVersionSrcs({});
      setPreviewVersionId(null);
      return;
    }
    let cancelled = false;
    const created: string[] = [];
    Promise.all(
      versions.map(async (version) => {
        try {
          const blob = await fetchMedia(`/projects/${id}/image/${sceneId}/versions/${version.id}`);
          const url = URL.createObjectURL(blob);
          created.push(url);
          return [version.id, url] as const;
        } catch {
          return [version.id, ""] as const;
        }
      })
    ).then((pairs) => {
      if (cancelled) return;
      setVersionSrcs(Object.fromEntries(pairs.filter(([, url]) => url)));
    });
    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [id, project?.type, project?.versions?.visuals, project?.visuals, project?.updatedAt]);

  const isImage = project?.type === "image_post";
  const isInvite = Boolean(isImage && project?.imageIntent === "invite");
  const isPoster = Boolean(isImage && (project?.imageIntent === "invite" || project?.imageIntent === "info" || project?.imageIntent === "offer"));
  const STEPS = isImage
    ? [
        { id: "idea", cost: 5 },
        { id: "visuals", cost: 8 },
      ]
    : VIDEO_STEPS;
  const stepLabel = (id: string) =>
    id === "visuals" ? t(isInvite ? "steps.invitation" : isImage ? "steps.pictures" : "steps.visuals") : t(`steps.${id}`);
  const next = useMemo(() => STEPS.find((s) => project && !doneThrough(project, s.id)), [project, isImage, isInvite]);
  const lastDone = useMemo(() => [...STEPS].reverse().find((s) => project && doneThrough(project, s.id)), [project, isImage, isInvite]);
  const extraPrice = (step: string, sceneId?: number) => {
    const base = sceneId ? 8 : STEPS.find((s) => s.id === step)?.cost ?? 0;
    const used = project?.stepAttempts?.[step] ?? 0;
    const included = project?.maxStepAttempts ?? 3;
    const mult = used >= included ? (project?.extraAttemptMultiplier ?? 2) : 1;
    return { extra: used >= included, credits: base * mult };
  };
  const rawFrame = project?.visuals?.[scene]?.imageUrl || "";
  const currentFrame =
    (project?.visuals?.[scene] && imageSrcs[project.visuals[scene].sceneId]) ||
    (rawFrame.startsWith("data:") ? "" : rawFrame);
  const frame = (previewVersionId && versionSrcs[previewVersionId]) || currentFrame;
  const frameIsPlaceholder = Boolean(project?.visuals?.[scene]?.placeholder);
  const placeholderCount = project?.visuals?.filter((v) => v.placeholder).length ?? 0;
  const caption = project?.captions?.cues?.[scene]?.text || project?.script?.scenes?.[scene]?.onScreen || project?.idea?.title;

  async function execute(step: string, regenerate = false, sceneId?: number, feedback?: { reason?: string; note?: string }) {
    if (!id) return;
    setBusy(sceneId ? `visual-${sceneId}` : step);
    setError("");
    try {
      const { project: nextProject } = await api.runStep(id, step, regenerate, sceneId, feedback);
      setPreviewVersionId(null);
      setProject(nextProject);
      setBrief(nextProject.prompt);
      if (nextProject.invite) setInviteDraft(draftFromInvite(nextProject.invite));
      refreshMe();
      setPendingRegen(null);
      setRegenReason("");
      setRegenNote("");
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("studio.failStep"));
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
        setError(err instanceof Error ? te(err.message) : t("studio.failBrief"));
        return;
      }
    }
    if (isInvite && step === "visuals") {
      try {
        const filled =
          inviteDraft.name || inviteDraft.date || inviteDraft.place || inviteDraft.time
            ? inviteDraft
            : project.invite || inviteDraft;
        const { project: saved } = await api.updateInvite(id, filled);
        setProject(saved);
        if (saved.invite) setInviteDraft(draftFromInvite(saved.invite));
      } catch (err) {
        setError(err instanceof Error ? te(err.message) : t("studio.failInvite"));
        return;
      }
    }
    const price = extraPrice(step, sceneId);
    if (price.extra) {
      const ok = window.confirm(
        t("studio.confirm2x", { credits: price.credits })
      );
      if (!ok) return;
    } else if (regenerate && !sceneId && (step === "idea" || step === "script")) {
      const ok = window.confirm(
        step === "idea"
          ? t("studio.confirmBrief", { credits: price.credits })
          : t("studio.confirmCascade", { credits: price.credits })
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
      setError(t("studio.needNote"));
      return;
    }
    await execute(pendingRegen.step, true, pendingRegen.sceneId, withReason && regenReason ? { reason: regenReason, note: regenNote } : undefined);
  }

  async function restore(step: "idea" | "script" | "visuals", versionId: string, sceneId?: number) {
    if (!id) return;
    const ok = window.confirm(
      step === "idea"
        ? t("studio.restoreIdea")
        : step === "visuals"
          ? t("studio.restorePicture")
          : t("studio.restoreScript")
    );
    if (!ok) return;
    setBusy(sceneId ? `restore-visual-${sceneId}` : `restore-${step}`);
    setError("");
    try {
      const { project: nextProject } = await api.restoreVersion(id, step, versionId, sceneId);
      setPreviewVersionId(null);
      setProject(nextProject);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("studio.failRestore"));
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
      setError(err instanceof Error ? te(err.message) : t("studio.failShare"));
    }
  }

  async function sendFeedback() {
    if (!id || !publishable) return;
    setError("");
    try {
      const { project: nextProject } = await api.saveFeedback(id, publishable, reasons);
      setProject(nextProject);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("studio.failFeedback"));
    }
  }

  async function saveInvite() {
    if (!id) return;
    setBusy("invite");
    setError("");
    try {
      const { project: nextProject } = await api.updateInvite(id, inviteDraft);
      setProject(nextProject);
      if (nextProject.invite) setInviteDraft(draftFromInvite(nextProject.invite));
      setInviteSaved(true);
      setTimeout(() => setInviteSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("studio.failInvite"));
    } finally {
      setBusy(null);
    }
  }

  async function saveBrief() {
    if (!id || briefSaving) return;
    setError("");
    setBriefSaved(false);
    setBriefSaving(true);
    try {
      const { project: nextProject } = await api.updatePrompt(id, brief);
      setProject(nextProject);
      setBrief(nextProject.prompt);
      setBriefSaved(true);
      setTimeout(() => setBriefSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("studio.failBrief"));
    } finally {
      setBriefSaving(false);
    }
  }

  async function saveUseBrand(next: boolean) {
    if (!id || next === Boolean(project?.useBrand ?? true)) return;
    setError("");
    try {
      const { project: nextProject } = await api.updateUseBrand(id, next);
      setProject(nextProject);
      setBrandSaved(true);
      setTimeout(() => setBrandSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("studio.failBrief"));
    }
  }

  if (!project) return <p className="hint">{error || t("studio.opening")}</p>;

  const makingLabel =
    busy === "render"
      ? t("studio.makingReel")
      : busy === "voice"
        ? t("studio.makingVoice")
        : busy === "visuals" && isInvite
          ? t("studio.makingInvite")
          : busy === "visuals" && isImage
            ? t("studio.makingPicture")
            : t("studio.making");

  return (
    <div>
      <p className="hint">
        {project.type.replaceAll("_", " ")}
        {isImage && project.imageIntent
          ? ` · ${
              { photo: t("studio.intentPhoto"), invite: t("studio.intentInvite"), info: t("studio.intentInfo"), offer: t("studio.intentOffer") }[project.imageIntent] ||
              project.imageIntent
            }`
          : ""}
      </p>
      {kitHint && (project.useBrand ?? true) && (
        <p className="hint">
          {kitHint}. <Link to="/app/brand">{t("studio.brandKit")}</Link>
        </p>
      )}
      <div className="field">
        <label htmlFor="brief">{t("studio.briefLabel")}</label>
        <textarea
          id="brief"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          maxLength={2000}
          rows={3}
        />
      </div>
      <div className="row" style={{ marginBottom: 20 }}>
        <button className="btn ghost" type="button" disabled={briefSaving} onClick={saveBrief}>
          {briefSaving ? t("studio.savingBrief") : t("studio.saveBrief")}
        </button>
        {briefSaved && <span className="ok">{t("studio.briefSaved")}</span>}
      </div>
      {error && (
        <p className="err" style={{ marginTop: -8, marginBottom: 16 }}>
          {error}
        </p>
      )}
      <BrandToggle
        value={project.useBrand ?? true}
        onChange={saveUseBrand}
        ask={t("studio.useBrandAsk")}
        onLabel={t("studio.useBrandOn")}
        onHint={t("home.useBrandHint")}
        offLabel={t("studio.useBrandOff")}
        offHint={t("home.skipBrandHint")}
      />
      {brandSaved && <p className="ok">{t("studio.brandToggleSaved")}</p>}
      <div className="steps">
        {STEPS.map((s, i) => {
          const isDone = doneThrough(project, s.id);
          const isOn = next?.id === s.id;
          return (
            <span key={s.id} className={`step ${isDone ? "done" : ""} ${isOn ? "on" : ""}`}>
              {i + 1}. {stepLabel(s.id)}
            </span>
          );
        })}
      </div>

      <div className="studio">
        <div>
          <div className={`phone${isImage ? " post" : ""}${isPoster ? " poster" : ""}${isInvite ? " invite" : ""}`} style={typeof frame === "string" && frame.startsWith("linear") ? { background: frame } : undefined}>
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
                    {t("studio.placeholderFail")}
                  </div>
                )}
                {!isInvite && <div className="caption">{caption}</div>}
              </>
            )}
          </div>
          {!isImage && project.script && (
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
                        <p className="hint">{t("studio.placeholderFail")}</p>
                      )}
                      <button
                        className="btn ghost"
                        disabled={Boolean(busy) || Boolean(pendingRegen)}
                        onClick={() => run("visuals", true, s.id)}
                      >
                        {busy === `visual-${s.id}`
                          ? t("studio.makingShort")
                          : extraPrice("visuals", s.id).extra
                            ? t("studio.anotherTry", { credits: extraPrice("visuals", s.id).credits })
                            : t("studio.regenPicture", { credits: extraPrice("visuals", s.id).credits })}
                      </button>
                      {[...(project.versions?.visuals || [])].reverse().find((version) => !version.accepted) && (
                        <button
                          className="btn ghost"
                          disabled={Boolean(busy) || Boolean(pendingRegen)}
                          onClick={() => {
                            const previous = [...(project.versions?.visuals || [])].reverse().find((version) => !version.accepted);
                            if (previous) restore("visuals", previous.id, s.id);
                          }}
                        >
                          {busy === `restore-visual-${s.id}` ? t("studio.restoring") : t("studio.usePreviousFree")}
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
          <h2>{next ? t("studio.stepTitle", { label: stepLabel(next.id) }) : t("steps.ready")}</h2>
          {!project.idea && (
            <p className="lede">
              {isInvite ? t("studio.introInvite") : isImage ? t("studio.introImage") : t("studio.introVideo")}
            </p>
          )}
          {project.idea && !project.visuals && isImage && (
            <>
              <p><b>{project.idea.title}</b></p>
              <p className="lede">{project.idea.concept}</p>
              <p className="hint">{project.idea.visualDirection}</p>
              <VersionCompare step="idea" versions={project.versions?.idea || []} onRestore={restore} busy={Boolean(busy)} t={t} />
            </>
          )}
          {isInvite && project.idea && (
            <p className="hint">{t("studio.inviteHint")}</p>
          )}
          {project.idea && !project.script && !isImage && (
            <>
              <p><b>{project.idea.title}</b></p>
              <p className="lede">{project.idea.concept}</p>
              <p className="hint">{project.idea.visualDirection}</p>
              <VersionCompare step="idea" versions={project.versions?.idea || []} onRestore={restore} busy={Boolean(busy)} t={t} />
            </>
          )}
          {!isImage && project.script && !project.visuals && (
            <>
              <p className="lede">{t("studio.scriptReady")}</p>
              <VersionCompare step="script" versions={project.versions?.script || []} onRestore={restore} busy={Boolean(busy)} t={t} />
            </>
          )}
          {!isImage && project.visuals && !project.audioUrl && (
            <p className="lede">
              {placeholderCount
                ? t(placeholderCount === 1 ? "studio.framesFail" : "studio.framesFailMany", { count: placeholderCount })
                : t("studio.framesOk")}
            </p>
          )}
          {project.audioUrl && !project.captions && (
            <>
              <p><b>{project.voice?.voicePreset || project.voice?.voice}</b></p>
              <p className="lede">{project.voice?.notes}</p>
              {audioSrc && <audio controls src={audioSrc} style={{ width: "100%", marginTop: 12 }} />}
            </>
          )}
          {project.captions && !project.hasVideo && <p className="lede">{t("studio.captionsReady")}</p>}
          {project.hasImages && (
            <>
              <p className="ok">
                {t(isInvite ? "studio.inviteReady" : "studio.pictureReady", { credits: project.creditsUsed })}
              </p>
              <p className="hint">{t(isInvite ? "studio.inviteKeep" : "studio.pictureKeep")}</p>
              {(project.versions?.visuals || []).length < 2 ? (
                <p className="hint" style={{ marginTop: 12 }}>
                  {t("studio.compareHint")}
                </p>
              ) : (
                <PictureCompare
                  versions={project.versions?.visuals || []}
                  srcs={versionSrcs}
                  liveSrc={imageSrcs[project.visuals?.[0]?.sceneId ?? 1]}
                  previewId={previewVersionId}
                  busy={Boolean(busy)}
                  poster={isPoster}
                  onPreview={setPreviewVersionId}
                  onRestore={(versionId) => restore("visuals", versionId)}
                  t={t}
                />
              )}
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn ghost" type="button" onClick={sharePreview}>
                  {shareCopied ? t("studio.shareCopied") : t("studio.share")}
                </button>
                {isInvite
                  ? project.visuals
                      ?.filter((visual) => !visual.placeholder && imageSrcs[visual.sceneId])
                      .slice(0, 1)
                      .map((visual) => (
                        <a key={visual.sceneId} className="btn" href={imageSrcs[visual.sceneId]} download="invitation.jpg">
                          {t("studio.downloadInvite")}
                        </a>
                      ))
                  : project.visuals?.map((visual, i) => {
                      const src = imageSrcs[visual.sceneId];
                      if (!src || visual.placeholder) return null;
                      return (
                        <a key={visual.sceneId} className="btn" href={src} download={`still-${i + 1}.jpg`}>
                          {t("studio.downloadN", { n: i + 1 })}
                        </a>
                      );
                    })}
              </div>
              {project.feedback ? (
                <p className="ok" style={{ marginTop: 16 }}>{t("studio.thanksPost")}</p>
              ) : (
                <div style={{ marginTop: 20 }}>
                  <p className="lede">{t("studio.publishPost")}</p>
                  <div className="row" style={{ marginTop: 8 }}>
                    {[
                      ["yes", "studio.yes"],
                      ["edits", "studio.edits"],
                      ["no", "studio.no"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={`btn ${publishable === value ? "accent" : "ghost"}`}
                        onClick={() => setPublishable(value)}
                      >
                        {t(label)}
                      </button>
                    ))}
                  </div>
                  {publishable && publishable !== "yes" && (
                    <div style={{ marginTop: 12 }}>
                      <p className="hint">{t("studio.whatWrong")}</p>
                      {[
                        ["Images", "studio.fbImages"],
                        ["Idea", "studio.fbIdea"],
                        ["Brand style", "studio.fbBrand"],
                        ["Too generic", "studio.fbGeneric"],
                        ["Not useful", "studio.fbUseful"],
                      ].map(([reason, key]) => (
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
                          {t(key)}
                        </label>
                      ))}
                    </div>
                  )}
                  {publishable && (
                    <button className="btn" style={{ marginTop: 12 }} type="button" onClick={sendFeedback}>
                      {t("studio.send")}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
          {project.hasVideo && (
            <>
              <p className="ok">{t("studio.reelReady", { credits: project.creditsUsed })}</p>
              <p className="hint">{t("studio.reelKeep")}</p>
              <div className="row" style={{ marginTop: 18 }}>
                {videoSrc && (
                  <a className="btn" href={videoSrc} download="reel.mp4">
                    {t("studio.downloadMp4")}
                  </a>
                )}
                <button className="btn ghost" type="button" onClick={sharePreview}>
                  {shareCopied ? t("studio.shareCopied") : t("studio.share")}
                </button>
              </div>
              {project.feedback ? (
                <p className="ok" style={{ marginTop: 16 }}>{t("studio.thanksReel")}</p>
              ) : (
                <div style={{ marginTop: 20 }}>
                  <p className="lede">{t("studio.publishReel")}</p>
                  <div className="row" style={{ marginTop: 8 }}>
                    {[
                      ["yes", "studio.yes"],
                      ["edits", "studio.edits"],
                      ["no", "studio.no"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={`btn ${publishable === value ? "accent" : "ghost"}`}
                        onClick={() => setPublishable(value)}
                      >
                        {t(label)}
                      </button>
                    ))}
                  </div>
                  {publishable && publishable !== "yes" && (
                    <div style={{ marginTop: 12 }}>
                      <p className="hint">{t("studio.whatWrong")}</p>
                      {[
                        ["Voice", "studio.fbVoice"],
                        ["Script", "studio.fbScript"],
                        ["Images", "studio.fbImages"],
                        ["Captions", "studio.fbCaptions"],
                        ["Brand style", "studio.fbBrand"],
                        ["Too generic", "studio.fbGeneric"],
                        ["Not useful", "studio.fbUseful"],
                      ].map(([reason, key]) => (
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
                          {t(key)}
                        </label>
                      ))}
                    </div>
                  )}
                  {publishable && (
                    <button className="btn" style={{ marginTop: 12 }} type="button" onClick={sendFeedback}>
                      {t("studio.send")}
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
                  ? t("studio.makeStep2x", { label: stepLabel(next.id).toLowerCase(), credits: extraPrice(next.id).credits })
                  : t("studio.makeStep", { label: stepLabel(next.id).toLowerCase(), credits: extraPrice(next.id).credits })}
            </button>
          )}
          {pendingRegen && STEP_REASONS[pendingRegen.step] && (
            <div style={{ marginTop: 16 }}>
              <p className="lede">{t("studio.whyFail")}</p>
              <div className="field" style={{ marginTop: 8 }}>
                <select value={regenReason} onChange={(e) => setRegenReason(e.target.value)}>
                  <option value="">{t("studio.chooseReason")}</option>
                  {STEP_REASONS[pendingRegen.step].map((reason) => (
                    <option key={reason.id} value={reason.id}>
                      {t(`reasons.${reason.id}`)}
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
                    placeholder={t("studio.reasonNote")}
                  />
                </div>
              )}
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => goRegen(false)}>
                  {t("studio.skip")}
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={Boolean(busy) || (regenReason === "other" && regenNote.trim().length < 2)}
                  onClick={() => goRegen(Boolean(regenReason))}
                >
                  {t("studio.tryAgain")}
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
                  ? t("studio.keepOrTry", { credits: extraPrice(lastDone.id).credits })
                  : t("studio.notThis", { label: stepLabel(lastDone.id).toLowerCase(), credits: extraPrice(lastDone.id).credits })}
            </button>
          )}
          {STEPS.some((s) => doneThrough(project, s.id)) && (
            <div style={{ marginTop: 18 }}>
              <p className="hint">
                {t("studio.keepFree")}
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
                      ? t("studio.anotherStep", { label: stepLabel(s.id).toLowerCase(), credits: extraPrice(s.id).credits })
                      : t("studio.regenStep", { label: stepLabel(s.id).toLowerCase(), credits: extraPrice(s.id).credits })}
                </button>
              ))}
            </div>
          )}
          {error && (
            <p className="err">
              {error}
              {(error.toLowerCase().includes("credit") || error.includes("кредит")) && (
                <>
                  {" "}
                  <Link to="/app/billing">{t("studio.buyCredits")}</Link>
                </>
              )}
            </p>
          )}
          <p className="hint" style={{ marginTop: 18 }}>
            {t(isInvite ? "studio.usedInvite" : isImage ? "studio.usedImage" : "studio.usedReel", { credits: project.creditsUsed })}
          </p>
        </div>
      </div>
    </div>
  );
}
