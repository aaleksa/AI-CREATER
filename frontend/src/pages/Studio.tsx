import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ApiError, SHAPE_RATIO, api, fetchMedia, refreshMe, type ArchiveState, type BrandKitRow, type InviteCard, type LogoBox, type Project, type Shot } from "../lib/api";
import { copyText } from "../lib/copy";
import { downloadName, shapeLabel } from "../lib/fileName";
import { prepareImage } from "../lib/imageUpload";
import BrandToggle from "../components/BrandToggle";
import ExampleImages, { useProjectImageSrcs } from "../components/ExampleImages";
import { useLocale } from "../i18n/locale";

const VIDEO_STEPS = [
  { id: "idea", cost: 5 },
  { id: "script", cost: 10 },
  { id: "visuals", cost: 40 },
  { id: "voice", cost: 30 },
  { id: "captions", cost: 10 },
  { id: "render", cost: 55 },
] as const;

/** Closed until we need a public preview link and a publishability metric. */
const SHOW_SHARE_AND_PUBLISH = false;

function asText(value: unknown) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function readableLine(text: unknown) {
  return asText(text)
    .replace(/([a-zа-яіїєґ])([A-ZА-ЯІЇЄҐ])/g, "$1 $2")
    .replace(/^(title|end)\s*card\s*:?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

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
    voice: project.audioUrl || project.voiceOff,
    captions: project.captions || project.captionsOff,
    render: project.hasVideo,
  };
  return Boolean(map[step]);
}

/** Remembered per browser: whether "Changes to the selected picture" is open. */
const EDITS_OPEN_KEY = "auteur.studio.editsOpen";

function PictureCompare({
  versions,
  srcs,
  liveSrc,
  onPreview,
  onDelete,
  onKeepCurrent,
  busy,
  previewId,
  poster,
  ratio,
  t,
}: {
  versions: { id: string; accepted: boolean; shape?: string }[];
  srcs: Record<string, string>;
  liveSrc?: string;
  onPreview: (versionId: string) => void;
  onDelete: (versionId: string) => void;
  onKeepCurrent: () => void;
  busy: boolean;
  previewId: string | null;
  poster?: boolean;
  ratio?: string;
  t: (path: string, vars?: Record<string, string | number>) => string;
}) {
  if (versions.length < 2) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <p className="hint">{t("studio.compareLast")}</p>
      {versions.length > 2 && (
        <button type="button" className="btn ghost compare-delete" disabled={busy} onClick={onKeepCurrent}>
          {t("studio.keepCurrentOnly")}
        </button>
      )}
      <div className="compare-grid">
        {versions.map((version, index) => {
          const src = srcs[version.id] || (version.accepted ? liveSrc : "");
          const showing = previewId === version.id || (!previewId && version.accepted);
          const shape = version.shape ? shapeLabel(version.shape, t) : "";
          const label = [t("studio.takeN", { n: index + 1 }), shape].filter(Boolean).join(" · ");
          const takeRatio = (version.shape && SHAPE_RATIO[version.shape]) || ratio;
          return (
            <div key={version.id} className="compare-item">
              <button
                type="button"
                className={`compare-card pick${showing ? " on" : ""}`}
                onClick={() => onPreview(version.id)}
                aria-pressed={showing}
                aria-label={showing ? `${label}. ${t("studio.selectedTake")}` : label}
              >
                <p className="hint">{showing ? `${t("studio.selectedTake")} · ${label}` : label}</p>
                {src ? (
                  <img className={`compare-still${poster ? " poster" : ""}`} style={takeRatio ? { aspectRatio: takeRatio, objectFit: "contain" } : undefined} src={src} alt="" />
                ) : (
                  <p className="hint">{t("studio.gone")}</p>
                )}
              </button>
              {!showing && (
                <button
                  type="button"
                  className="btn ghost compare-delete"
                  disabled={busy}
                  onClick={() => onDelete(version.id)}
                  aria-label={`${t("studio.deleteTake")} · ${label}`}
                >
                  {t("studio.deleteTake")}
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
      <p className="hint">{t(step === "script" ? "studio.scriptCompare" : "studio.ideaCompare")}</p>
      <div className="compare-grid">
        {versions.map((version, index) => (
          <div key={version.id} className={`compare-card${version.accepted ? " on" : ""}`}>
            <p className="hint">{version.accepted ? t("studio.current") : t("studio.takeN", { n: index + 1 })}</p>
            {step === "idea" ? (
              <>
                <p><b>{asText(version.payload?.title)}</b></p>
                <p className="hint">{asText(version.payload?.hook || version.payload?.concept)}</p>
              </>
            ) : (
              <>
                <p className="hint">{asText(version.payload?.cta)}</p>
                <p className="hint">{asText(version.payload?.scenes?.[0]?.voiceover)}</p>
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
  const missedExamples = Number((useLocation().state as { missedExamples?: number } | null)?.missedExamples) || 0;
  const { t, te } = useLocale();
  const [project, setProject] = useState<Project | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [scene, setScene] = useState(0);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [musicSrc, setMusicSrc] = useState<string | null>(null);
  const [musicDraft, setMusicDraft] = useState<{ volume: number; start: number } | null>(null);
  const [brief, setBrief] = useState("");
  const refSrcs = useProjectImageSrcs(project?.refs);
  const [briefSaved, setBriefSaved] = useState(false);
  const [briefCopied, setBriefCopied] = useState(false);
  const [briefSaving, setBriefSaving] = useState(false);
  const [publishable, setPublishable] = useState("");
  const [reasons, setReasons] = useState<string[]>([]);
  const [imageSrcs, setImageSrcs] = useState<Record<number, string>>({});
  const [versionSrcs, setVersionSrcs] = useState<Record<string, string>>({});
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
  const [copyEdit, setCopyEdit] = useState("");
  const [copyEditOpen, setCopyEditOpen] = useState(false);
  const [copyEditImage, setCopyEditImage] = useState("");
  const [pendingRegen, setPendingRegen] = useState<{ step: string; sceneId?: number } | null>(null);
  const [regenReason, setRegenReason] = useState("");
  const [regenNote, setRegenNote] = useState("");
  const [shareCopied, setShareCopied] = useState(false);
  const [archive, setArchive] = useState<ArchiveState | null>(null);
  const [kit, setKit] = useState<BrandKitRow | null>(null);
  const [pickedCorner, setPickedCorner] = useState("");
  const [reformatTo, setReformatTo] = useState("");
  const [viewStep, setViewStep] = useState<string | null>(null);
  const [scriptDraft, setScriptDraft] = useState<{ cta: string; scenes: { id: number; onScreen: string; voiceover: string }[] } | null>(null);
  const [capsDraft, setCapsDraft] = useState<{ start: number; end: number; text: string }[] | null>(null);
  // A half-made edit belongs to the step it was opened on.
  useEffect(() => {
    setScriptDraft(null);
    setCapsDraft(null);
  }, [viewStep]);
  const [placing, setPlacing] = useState<{ box: LogoBox; markRatio: number; pictureRatio: number; baseSrc: string; markSrc: string } | null>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const [editsOpen, setEditsOpen] = useState(() => localStorage.getItem(EDITS_OPEN_KEY) === "1");
  const [inviteDraft, setInviteDraft] = useState<InviteCard>(EMPTY_INVITE);
  const [inviteSaved, setInviteSaved] = useState(false);
  const [shotEditOpen, setShotEditOpen] = useState(false);
  const [shotDraft, setShotDraft] = useState<Shot | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api.project(id).then((d) => {
      if (cancelled) return;
      setProject(d.project);
      setArchive(d.archive || null);
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
        setKit(d.brandKit);
      })
      .catch(() => {
        setKit(null);
      });
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
  }, [id, project?.hasVideo, project?.videoStamp]);

  const musicKey = project?.music ? `${project.music.name}|${project.music.durationSec}` : "";
  useEffect(() => {
    setMusicDraft(null);
    if (!id || !musicKey) {
      setMusicSrc(null);
      return;
    }
    let cancelled = false;
    let url = "";
    fetchMedia(`/projects/${id}/music`)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setMusicSrc(url);
      })
      .catch(() => {
        if (!cancelled) setMusicSrc(null);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, musicKey]);

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
        const stamp = encodeURIComponent(project.updatedAt || "");
        const blob = await fetchMedia(`${visual.imageUrl}${visual.imageUrl.includes("?") ? "&" : "?"}t=${stamp}`);
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
  const shapeRatio = isImage && project?.imageFormat ? SHAPE_RATIO[project.imageFormat] : undefined;
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
    // Without a voice the captions are the scenes' own words: free.
    if (step === "captions" && project?.voiceOff) return { extra: false, credits: 0 };
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
  const acceptedVersionId = project?.versions?.visuals?.find((version) => version.accepted)?.id;
  const selectedVersionId = previewVersionId || acceptedVersionId;
  const frame = previewVersionId ? versionSrcs[previewVersionId] || "" : currentFrame;
  const workingVersionId = selectedVersionId || undefined;
  const downloadSrc = frame && !frame.startsWith("linear") ? frame : currentFrame;
  const makingPicture = Boolean(busy === "visuals" || (typeof busy === "string" && busy.startsWith("visual-")));
  const frameIsPlaceholder = Boolean(project?.visuals?.[scene]?.placeholder);
  const placeholderCount = project?.visuals?.filter((v) => v.placeholder).length ?? 0;
  const logoCorner = pickedCorner || kit?.logo_position || "bottom-right";
  // A logo placed by hand is not in a corner: no corner pill lights up until they pick one.
  const shownLogoBox = (project?.versions?.visuals?.find((v) => v.accepted)?.payload || project?.visuals)?.[scene]?.logoBox;
  const litCorner = pickedCorner || (shownLogoBox ? "" : logoCorner);
  const shownVersion = project?.versions?.visuals?.find((version) => version.id === (previewVersionId || acceptedVersionId));
  const frameHasOurLogo = shownVersion ? Boolean(shownVersion.ourLogo) : Boolean(project?.visuals?.[scene]?.clean);
  const hasBrandMark = Boolean(
    kit && (kit.logo_url || ((kit.font_url || ["Nunito", "Montserrat"].includes(kit.font)) && String(kit.business_name || "").trim()))
  );
  // With the brand kit and "logo on photos", the AI leaves a spot and we stamp the logo ourselves — no manual block.
  const currentShape = project?.imageFormat || (isPoster ? "tall" : "square");
  // Lines of the Reel script in different alphabets: Ukrainian words on screen, English voice, or the other way round.
  const reelLanguagesMixed = useMemo(() => {
    const lines = [project?.script?.cta, ...(project?.script?.scenes || []).flatMap((sc) => [sc.onScreen, sc.voiceover])];
    const kinds = new Set(
      lines
        .map((line) => String(line || ""))
        .filter((line) => /\p{L}{3}/u.test(line))
        .map((line) => ((line.match(/\p{Script=Cyrillic}/gu) || []).length > (line.match(/[A-Za-z]/g) || []).length ? "uk" : "en"))
    );
    return kinds.size > 1;
  }, [project?.script]);
  const shownTake = (project?.versions?.visuals || []).findIndex((version) => version.id === (previewVersionId || acceptedVersionId));
  const autoLogo = Boolean((project?.useBrand ?? true) && hasBrandMark && kit?.logo_on_photos);
  const caption = readableLine(
    project?.captions?.cues?.[scene]?.text || project?.script?.scenes?.[scene]?.onScreen || project?.idea?.title || ""
  );

  async function execute(
    step: string,
    regenerate = false,
    sceneId?: number,
    feedback?: { reason?: string; note?: string },
    evictOldest = false,
    extra?: { pictureLanguage?: string; keepStill?: boolean; keepStillVersionId?: string; copyEdit?: string; copyEditImage?: string; reformat?: string }
  ) {
    if (!id) return;
    setBusy(sceneId ? `visual-${sceneId}` : step);
    setError("");
    try {
      const { project: nextProject, archive: nextArchive } = await api.runStep(
        id,
        step,
        regenerate,
        sceneId,
        feedback,
        evictOldest,
        extra
      );
      setPreviewVersionId(null);
      setProject(nextProject);
      if (nextArchive) setArchive(nextArchive);
      setBrief(nextProject.prompt);
      if (nextProject.invite) setInviteDraft(draftFromInvite(nextProject.invite));
      if (extra?.copyEdit) {
        setCopyEdit("");
        setCopyEditImage("");
        setCopyEditOpen(false);
      }
      refreshMe();
      setPendingRegen(null);
      setRegenReason("");
      setRegenNote("");
    } catch (err) {
      if (!evictOldest && step === "render" && err instanceof ApiError && err.code === "archive_full") {
        const oldest = archive?.oldestPrompt || t("studio.oldestReel");
        const ok = window.confirm(t("studio.confirmArchive", { limit: archive?.limit ?? 10, oldest }));
        if (ok) {
          await execute(step, regenerate, sceneId, feedback, true);
          return;
        }
      }
      setError(err instanceof Error ? te(err.message) : t("studio.failStep"));
    } finally {
      setBusy(null);
    }
  }

  async function remakeLanguage(lang: "en" | "uk") {
    if (!id || !project) return;
    if (brief.trim() !== project.prompt) {
      try {
        const { project: saved } = await api.updatePrompt(id, brief);
        setProject(saved);
      } catch (err) {
        setError(err instanceof Error ? te(err.message) : t("studio.failBrief"));
        return;
      }
    }
    const sceneId = project.visuals?.[scene]?.sceneId ?? 1;
    const price = extraPrice("visuals", sceneId);
    if (price.extra) {
      const ok = window.confirm(t("studio.confirm2x", { credits: price.credits }));
      if (!ok) return;
    }
    await execute("visuals", true, sceneId, undefined, false, {
      keepStill: true,
      pictureLanguage: lang,
      keepStillVersionId: workingVersionId,
    });
  }

  async function applyCopyEdit() {
    if (!id || !project) return;
    const note = copyEdit.replace(/\s+/g, " ").trim();
    if (note.length < 4) {
      setError(t("studio.editPictureNeed"));
      return;
    }
    const sceneId = project.visuals?.[scene]?.sceneId ?? 1;
    const price = extraPrice("visuals", sceneId);
    if (price.extra) {
      const ok = window.confirm(t("studio.confirm2x", { credits: price.credits }));
      if (!ok) return;
    }
    await execute("visuals", true, sceneId, undefined, false, {
      keepStill: true,
      copyEdit: note,
      copyEditImage: copyEditImage || undefined,
      keepStillVersionId: workingVersionId,
    });
  }

  /** Keeps a hand-placed logo inside the picture and at a usable size. Height follows the logo's own shape. */
  function fitBox(box: LogoBox, markRatio: number, pictureRatio: number): LogoBox {
    const heightPerWidth = pictureRatio / markRatio;
    const w = Math.min(Math.max(box.w, 0.04), 0.8, 1 / heightPerWidth);
    const h = w * heightPerWidth;
    return { w, x: Math.min(Math.max(box.x, 0), 1 - w), y: Math.min(Math.max(box.y, 0), 1 - h) };
  }

  async function startPlacing() {
    if (!id || !project) return;
    const sceneId = project.visuals?.[scene]?.sceneId ?? 1;
    setBusy("place");
    setError("");
    try {
      const layout = await api.logoLayout(id, sceneId);
      const [base, mark] = await Promise.all([
        fetchMedia(`/projects/${id}/logo/base?sceneId=${sceneId}`),
        fetchMedia(`/projects/${id}/logo/mark`),
      ]);
      setPlacing({
        ...layout,
        box: fitBox(layout.box, layout.markRatio, layout.pictureRatio),
        baseSrc: URL.createObjectURL(base),
        markSrc: URL.createObjectURL(mark),
      });
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("studio.logoFail"));
    } finally {
      setBusy(null);
    }
  }

  function stopPlacing() {
    if (placing) {
      URL.revokeObjectURL(placing.baseSrc);
      URL.revokeObjectURL(placing.markSrc);
    }
    setPlacing(null);
  }

  async function savePlacing() {
    if (!id || !project || !placing) return;
    const sceneId = project.visuals?.[scene]?.sceneId ?? 1;
    setBusy("logo");
    setError("");
    try {
      const { project: nextProject } = await api.stampLogo(id, sceneId, "", undefined, placing.box);
      stopPlacing();
      setPreviewVersionId(null);
      setProject(nextProject);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("studio.logoFail"));
    } finally {
      setBusy(null);
    }
  }

  function startDrag(e: ReactPointerEvent, mode: "move" | "resize") {
    if (!placing || !phoneRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = phoneRef.current.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, box: placing.box };
    const { markRatio, pictureRatio } = placing;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / rect.width;
      const dy = (ev.clientY - start.y) / rect.height;
      const next =
        mode === "move"
          ? { ...start.box, x: start.box.x + dx, y: start.box.y + dy }
          : { ...start.box, w: start.box.w + dx };
      setPlacing((p) => (p ? { ...p, box: fitBox(next, markRatio, pictureRatio) } : p));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  /** Arrow keys move the logo; with Shift they change its size. */
  function nudgeLogo(e: ReactKeyboardEvent) {
    if (!placing) return;
    const step = 0.01;
    const keys: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const delta = keys[e.key];
    if (!delta) return;
    e.preventDefault();
    const { box, markRatio, pictureRatio } = placing;
    const next = e.shiftKey ? { ...box, w: box.w + delta[0] - delta[1] } : { ...box, x: box.x + delta[0], y: box.y + delta[1] };
    setPlacing({ ...placing, box: fitBox(next, markRatio, pictureRatio) });
  }

  async function pickMusic(file: File | undefined) {
    if (!id || !file) return;
    if (file.size > 20 * 1024 * 1024) {
      setError(t("studio.musicTooBig"));
      return;
    }
    setBusy("music");
    setError("");
    try {
      const { project: nextProject } = await api.uploadMusic(id, file);
      setProject(nextProject);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("studio.failStep"));
    } finally {
      setBusy(null);
    }
  }

  async function saveMusic() {
    if (!id || !musicDraft) return;
    setBusy("music");
    setError("");
    try {
      const { project: nextProject } = await api.updateMusic(id, musicDraft);
      setMusicDraft(null);
      setProject(nextProject);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("studio.failStep"));
    } finally {
      setBusy(null);
    }
  }

  async function dropMusic() {
    if (!id) return;
    setBusy("music-off");
    setError("");
    try {
      const { project: nextProject } = await api.removeMusic(id);
      setProject(nextProject);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("studio.failStep"));
    } finally {
      setBusy(null);
    }
  }

  async function translateReel(lang: "en" | "uk") {
    if (!id || !project?.script) return;
    if ((project.audioUrl || project.captions || project.hasVideo) && !window.confirm(t("studio.reelLangConfirm"))) return;
    setBusy(`lang-${lang}`);
    setError("");
    try {
      const { project: nextProject } = await api.translateScript(id, lang);
      setScriptDraft(null);
      setProject(nextProject);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("studio.failStep"));
    } finally {
      setBusy(null);
    }
  }

  async function saveScriptDraft() {
    if (!id || !project?.script || !scriptDraft) return;
    const voiceChanged = scriptDraft.scenes.some((sc) => sc.voiceover.trim() !== (project.script?.scenes.find((x) => x.id === sc.id)?.voiceover || "").trim());
    const ask = voiceChanged && project.audioUrl ? t("studio.scriptEditVoiceConfirm") : project.captions || project.hasVideo ? t("studio.scriptEditConfirm") : "";
    if (ask && !window.confirm(ask)) return;
    setBusy("edit-script");
    setError("");
    try {
      const { project: nextProject } = await api.editScript(id, scriptDraft);
      setScriptDraft(null);
      setProject(nextProject);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("studio.failStep"));
    } finally {
      setBusy(null);
    }
  }

  async function saveCapsDraft() {
    if (!id || !capsDraft) return;
    if (project?.hasVideo && !window.confirm(t("studio.captionsToggleConfirm"))) return;
    setBusy("edit-captions");
    setError("");
    try {
      const { project: nextProject } = await api.editCaptions(id, capsDraft);
      setCapsDraft(null);
      setProject(nextProject);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("studio.failStep"));
    } finally {
      setBusy(null);
    }
  }

  async function toggleCaptions(off: boolean) {
    if (!id) return;
    if (project?.hasVideo && !window.confirm(t("studio.captionsToggleConfirm"))) return;
    setBusy(off ? "captions-off" : "captions-on");
    setError("");
    try {
      const { project: nextProject } = await api.setCaptionsOff(id, off);
      setViewStep(null);
      setProject(nextProject);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("studio.failStep"));
    } finally {
      setBusy(null);
    }
  }

  async function toggleVoice(off: boolean) {
    if (!id) return;
    if (!off && !window.confirm(t("studio.voiceOnConfirm"))) return;
    if (off && project?.captions && !window.confirm(t("studio.voiceOffConfirm"))) return;
    setBusy(off ? "voice-off" : "voice-on");
    setError("");
    try {
      const { project: nextProject } = await api.setVoiceOff(id, off);
      setViewStep(null);
      setProject(nextProject);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("studio.failStep"));
    } finally {
      setBusy(null);
    }
  }

  async function applyReformat() {
    if (!id || !project || !reformatTo) return;
    const sceneId = project.visuals?.[scene]?.sceneId ?? 1;
    const price = extraPrice("visuals", sceneId);
    if (price.extra) {
      const ok = window.confirm(t("studio.confirm2x", { credits: price.credits }));
      if (!ok) return;
    }
    await execute("visuals", true, sceneId, undefined, false, {
      keepStill: true,
      reformat: reformatTo,
      keepStillVersionId: workingVersionId,
    });
    setReformatTo("");
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
    if (step === "render" && archive?.atLimit && !project.hasVideo) {
      const oldest = archive.oldestPrompt || t("studio.oldestReel");
      const ok = window.confirm(t("studio.confirmArchive", { limit: archive.limit, oldest }));
      if (!ok) return;
      if (regenerate && STEP_REASONS[step]) {
        setPendingRegen({ step, sceneId });
        setRegenReason("");
        setRegenNote("");
        return;
      }
      await execute(step, regenerate, sceneId, undefined, true);
      return;
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
    await execute(
      pendingRegen.step,
      true,
      pendingRegen.sceneId,
      withReason && regenReason ? { reason: regenReason, note: regenNote } : undefined,
      Boolean(archive?.atLimit && pendingRegen.step === "render" && project && !project.hasVideo)
    );
  }

  async function changeLogo(remove: boolean) {
    if (!id || !project) return;
    const sceneId = project.visuals?.[scene]?.sceneId ?? 1;
    setBusy(remove ? "logo-off" : "logo");
    setError("");
    try {
      const picked = previewVersionId || undefined;
      const { project: nextProject } = remove
        ? await api.removeLogo(id, sceneId, picked)
        : await api.stampLogo(id, sceneId, logoCorner, picked);
      setPreviewVersionId(null);
      setProject(nextProject);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t(remove ? "studio.logoRemoveFail" : "studio.logoFail"));
    } finally {
      setBusy(null);
    }
  }

  async function tidyTakes(run: () => Promise<{ project: Project }>, confirmText: string) {
    if (!id || !window.confirm(confirmText)) return;
    setBusy("takes");
    setError("");
    try {
      const { project: nextProject } = await run();
      setPreviewVersionId(null);
      setProject(nextProject);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("studio.failDeleteTake"));
    } finally {
      setBusy(null);
    }
  }

  /** Clicking a take makes it the picture: free, no AI, and the list shows it as selected. */
  async function pickTake(versionId: string) {
    if (!id || !project || busy) return;
    stopPlacing();
    const version = project.versions?.visuals?.find((item) => item.id === versionId);
    if (!version || version.accepted) {
      setPreviewVersionId(null);
      return;
    }
    setPreviewVersionId(versionId);
    setBusy("pick");
    setError("");
    try {
      const { project: nextProject } = await api.restoreVersion(id, "visuals", versionId);
      setProject(nextProject);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("studio.failRestore"));
    } finally {
      setPreviewVersionId(null);
      setBusy(null);
    }
  }

  function deleteTake(versionId: string) {
    if (!id) return;
    void tidyTakes(() => api.deletePictureVersion(id, versionId), t("studio.deleteTakeConfirm"));
  }

  function keepCurrentOnly() {
    if (!id || !project) return;
    const others = (project.versions?.visuals || []).filter((version) => !version.accepted).length;
    void tidyTakes(() => api.keepCurrentPicture(id), t("studio.keepCurrentConfirm", { n: others }));
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

  function openShotEdit() {
    const shot = project?.idea?.shot;
    setShotDraft({
      summary: shot?.summary || "",
      subject: shot?.subject || "",
      place: shot?.place || "",
      angle: shot?.angle || "",
      people: shot?.people || "",
      mood: shot?.mood || "",
      words: shot?.words || "",
    });
    setError("");
    setShotEditOpen(true);
  }

  async function changeShot() {
    if (!id || !shotDraft) return;
    if (!shotDraft.subject.trim() && !shotDraft.summary.trim()) {
      setError(t("studio.shotEmpty"));
      return;
    }
    setBusy("shot");
    setError("");
    try {
      const { project: nextProject } = await api.updateShot(id, { shot: shotDraft });
      setProject(nextProject);
      setShotDraft(null);
      setShotEditOpen(false);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("studio.failStep"));
    } finally {
      setBusy(null);
    }
  }

  async function shootThis() {
    if (!id || !project) return;
    setBusy("shot");
    setError("");
    try {
      const { project: nextProject } = await api.updateShot(id, { confirm: true });
      setProject(nextProject);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("studio.failStep"));
      setBusy(null);
      return;
    }
    setBusy(null);
    await run("visuals");
  }

  async function sharePreview() {
    if (!id) return;
    setError("");
    try {
      const { url } = await api.sharePreview(id);
      if (await copyText(url)) {
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2500);
        return;
      }
      setError(`${t("studio.copyFail")} ${url}`);
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
      <div className="field">
        <label htmlFor="brief">{t("studio.briefLabel")}</label>
        <textarea
          id="brief"
          className="brief-box"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          maxLength={2000}
          rows={10}
        />
      </div>
      <ExampleImages
        items={(project.refs || []).map((ref) => ({ id: ref.id, src: refSrcs[ref.id] || "" }))}
        note={
          missedExamples && !(project.refs || []).length
            ? t("briefImages.missed", { n: missedExamples })
            : t("briefImages.nextTime")
        }
        onAdd={async (image) => {
          const { refs } = await api.addProjectRef(project.id, image);
          setProject((p) => (p ? { ...p, refs } : p));
        }}
        onRemove={async (slot) => {
          const { refs } = await api.deleteProjectRef(project.id, slot);
          setProject((p) => (p ? { ...p, refs } : p));
        }}
      />
      <div className="row" style={{ marginBottom: 20 }}>
        <button className="btn ghost" type="button" disabled={briefSaving} onClick={saveBrief}>
          {briefSaving ? t("studio.savingBrief") : t("studio.saveBrief")}
        </button>
        <button
          className="btn ghost"
          type="button"
          disabled={!brief.trim()}
          onClick={async () => {
            if (await copyText(brief)) {
              setBriefCopied(true);
              setTimeout(() => setBriefCopied(false), 2500);
              return;
            }
            const box = document.getElementById("brief") as HTMLTextAreaElement | null;
            box?.focus();
            box?.select();
            setError(t("studio.copyFail"));
          }}
        >
          {briefCopied ? t("studio.briefCopied") : t("studio.copyBrief")}
        </button>
        {briefSaved && <span className="ok">{t("studio.briefSaved")}</span>}
      </div>
      {error && (
        <p className="err" style={{ marginTop: -8, marginBottom: 16 }}>
          {error}
        </p>
      )}
      <BrandToggle
        locked
        value={project.useBrand ?? true}
        ask={t(project.useBrand ?? true ? "studio.brandLockedOn" : "studio.brandLockedOff")}
        onLabel={t("studio.useBrandOn")}
        onHint={t("home.useBrandHint")}
        offLabel={t("studio.useBrandOff")}
        offHint={t("home.skipBrandHint")}
        usingLabel={t("studio.brandUsing")}
        kit={kit}
      />
      <nav className="steps" aria-label={t("studio.stepsNav")}>
        {STEPS.map((s, i) => {
          const isDone = doneThrough(project, s.id);
          const isCurrent = next?.id === s.id;
          const isViewing = viewStep === s.id;
          const skipped = (s.id === "voice" && project.voiceOff) || (s.id === "captions" && project.captionsOff);
          const label = `${i + 1}. ${stepLabel(s.id)}${skipped ? ` · ${t(s.id === "voice" ? "studio.voiceOffShort" : "studio.captionsOffShort")}` : ""}`;
          // Done steps open a look back at their result; the current step brings you back to work.
          return isDone || next?.id === s.id ? (
            <button
              key={s.id}
              type="button"
              className={`step ${isDone ? "done" : ""} ${isCurrent ? "on" : ""} ${isViewing ? "viewing" : ""}`}
              aria-current={isCurrent ? "step" : undefined}
              aria-pressed={isViewing}
              onClick={() => setViewStep(isDone && next?.id !== s.id && viewStep !== s.id ? s.id : null)}
            >
              {label}
            </button>
          ) : (
            <span key={s.id} className="step">
              {label}
            </span>
          );
        })}
      </nav>

      <div className={`studio${isImage ? " image" : ""}`}>
        <div className={isImage ? "studio-preview" : undefined}>
          <div ref={phoneRef} className={`phone${isImage ? " post" : ""}${isPoster ? " poster" : ""}${isInvite ? " invite" : ""}`} style={{ ...(shapeRatio ? { aspectRatio: shapeRatio } : {}), ...(typeof frame === "string" && frame.startsWith("linear") ? { background: frame } : {}) }}>
            {project.hasVideo && videoSrc ? (
              <video className="phone-video" src={videoSrc} controls playsInline />
            ) : (
              <>
                {frame && !frame.startsWith("linear") && (
                  <div className="phone-frame" style={{ backgroundImage: `url(${placing ? placing.baseSrc : frame})` }} />
                )}
                {placing && (
                  <div
                    className="logo-place"
                    role="slider"
                    aria-label={t("studio.placeAria")}
                    aria-valuenow={Math.round(placing.box.w * 100)}
                    tabIndex={0}
                    style={{
                      left: `${placing.box.x * 100}%`,
                      top: `${placing.box.y * 100}%`,
                      width: `${placing.box.w * 100}%`,
                      aspectRatio: String(placing.markRatio),
                    }}
                    onPointerDown={(e) => startDrag(e, "move")}
                    onKeyDown={nudgeLogo}
                  >
                    <img src={placing.markSrc} alt="" draggable={false} />
                    <span className="logo-place-handle" onPointerDown={(e) => startDrag(e, "resize")} aria-hidden />
                  </div>
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
                {!isImage && <div className="caption">{caption}</div>}
              </>
            )}
          </div>
          {isImage && project.hasImages && (
            <p className="hint studio-preview-label">
              {placing
                ? t("studio.previewPlacing")
                : t("studio.previewSelected", {
                    take: shownTake >= 0 ? t("studio.takeN", { n: shownTake + 1 }) : t("studio.current"),
                    shape: shapeLabel(currentShape, t),
                  })}
            </p>
          )}
          {!isImage && project.script && (
            <div className="scenes">
              {project.script.scenes.map((s, i) => (
                <div key={s.id} className="scene">
                  <button className="scene-pick" onClick={() => setScene(i)}>
                    <b>{s.time}</b>
                    <span>{readableLine(isImage ? s.onScreen : s.voiceover)}</span>
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

        {viewStep && (
          <div className="panel step-review">
            <div className="row" style={{ marginBottom: 8 }}>
              <h2 style={{ margin: 0 }}>{t("studio.reviewTitle", { label: stepLabel(viewStep) })}</h2>
              <button type="button" className="btn ghost" onClick={() => setViewStep(null)}>
                {next ? t("studio.reviewBack", { label: stepLabel(next.id) }) : t("studio.reviewBackDone")}
              </button>
            </div>
            <p className="hint">{t("studio.reviewHint")}</p>
            {viewStep === "idea" && project.idea && (
              <>
                <p><b>{asText(project.idea.title)}</b></p>
                {asText(project.idea.hook) && <p>{asText(project.idea.hook)}</p>}
                <p className="lede">{asText(project.idea.concept)}</p>
                {asText(project.idea.shot?.summary) && <p className="hint">{asText(project.idea.shot?.summary)}</p>}
                <VersionCompare step="idea" versions={project.versions?.idea || []} onRestore={restore} busy={Boolean(busy)} t={t} />
              </>
            )}
            {viewStep === "script" && project.script && scriptDraft && (
              <div className="draft-editor">
                <label className="shot-field">
                  <span>{t("studio.scriptCta")}</span>
                  <input value={scriptDraft.cta} maxLength={200} onChange={(e) => setScriptDraft({ ...scriptDraft, cta: e.target.value })} />
                </label>
                {scriptDraft.scenes.map((sc, i) => (
                  <fieldset key={sc.id} className="draft-scene">
                    <legend className="hint">{t("studio.reviewScene", { n: i + 1 })}</legend>
                    <label className="shot-field">
                      <span>{t("studio.scriptOnScreen")}</span>
                      <input
                        value={sc.onScreen}
                        maxLength={120}
                        onChange={(e) => setScriptDraft({ ...scriptDraft, scenes: scriptDraft.scenes.map((x) => (x.id === sc.id ? { ...x, onScreen: e.target.value } : x)) })}
                      />
                    </label>
                    <label className="shot-field">
                      <span>{t("studio.scriptVoiceover")}</span>
                      <textarea
                        rows={2}
                        value={sc.voiceover}
                        maxLength={400}
                        onChange={(e) => setScriptDraft({ ...scriptDraft, scenes: scriptDraft.scenes.map((x) => (x.id === sc.id ? { ...x, voiceover: e.target.value } : x)) })}
                      />
                    </label>
                  </fieldset>
                ))}
                <p className="hint">{t("studio.scriptEditHint")}</p>
                <div className="action-row">
                  <button type="button" className="btn" disabled={Boolean(busy)} onClick={saveScriptDraft}>
                    {busy === "edit-script" ? t("studio.voiceOffSaving") : t("studio.editSave")}
                  </button>
                  <button type="button" className="btn ghost" disabled={Boolean(busy)} onClick={() => setScriptDraft(null)}>
                    {t("studio.placeCancel")}
                  </button>
                </div>
              </div>
            )}
            {viewStep === "script" && project.script && !scriptDraft && (
              <>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    setScriptDraft({
                      cta: project.script?.cta || "",
                      scenes: (project.script?.scenes || []).map((sc) => ({ id: sc.id, onScreen: sc.onScreen || "", voiceover: sc.voiceover || "" })),
                    })
                  }
                >
                  {t("studio.scriptEdit")}
                </button>
                <div className="reel-lang">
                  <span className="hint">{t("studio.reelLangAsk")}</span>
                  <button type="button" className="btn ghost" disabled={Boolean(busy)} onClick={() => translateReel("en")}>
                    {busy === "lang-en" ? t("studio.reelLangWorking") : t("studio.reelLangEn")}
                  </button>
                  <button type="button" className="btn ghost" disabled={Boolean(busy)} onClick={() => translateReel("uk")}>
                    {busy === "lang-uk" ? t("studio.reelLangWorking") : t("studio.reelLangUk")}
                  </button>
                </div>
                {project.script.cta && <p><b>{asText(project.script.cta)}</b></p>}
                <ol className="review-list">
                  {project.script.scenes.map((sc) => (
                    <li key={sc.id}>
                      {asText(sc.time) && <span className="hint">{t("studio.reviewAt", { time: asText(sc.time) })} · </span>}
                      <b>{asText(sc.onScreen)}</b>
                      <p className="hint" style={{ margin: "2px 0 0" }}>{asText(sc.voiceover)}</p>
                    </li>
                  ))}
                </ol>
                <VersionCompare step="script" versions={project.versions?.script || []} onRestore={restore} busy={Boolean(busy)} t={t} />
              </>
            )}
            {viewStep === "visuals" &&
              (isImage ? (
                <p className="lede">{t("studio.reviewPicture")}</p>
              ) : (
                <div className="review-frames">
                  {(project.visuals || []).map((v, i) => (
                    <figure key={v.sceneId}>
                      {imageSrcs[v.sceneId] ? <img src={imageSrcs[v.sceneId]} alt="" /> : <span className="example-loading" />}
                      <figcaption className="hint">{t("studio.reviewScene", { n: i + 1 })}</figcaption>
                    </figure>
                  ))}
                </div>
              ))}
            {viewStep === "voice" && project.voiceOff && <p className="lede">{t("studio.voiceOffNow")}</p>}
            {viewStep === "voice" && !project.voiceOff && (
              <>
                <p><b>{asText(project.voice?.voicePreset || project.voice?.voice)}</b></p>
                {asText(project.voice?.notes) && <p className="lede">{asText(project.voice?.notes)}</p>}
                {audioSrc && <audio controls src={audioSrc} style={{ width: "100%", marginTop: 12 }} />}
              </>
            )}
            {viewStep === "captions" && project.captionsOff && <p className="lede">{t("studio.captionsOffNow")}</p>}
            {viewStep === "captions" && project.captions && capsDraft && (
              <div className="draft-editor">
                {capsDraft.map((cue, i) => (
                  <div key={i} className="draft-cue">
                    <input
                      type="number"
                      step="0.1"
                      min={0}
                      aria-label={t("studio.capsStart")}
                      value={cue.start}
                      onChange={(e) => setCapsDraft(capsDraft.map((c, j) => (j === i ? { ...c, start: Number(e.target.value) } : c)))}
                    />
                    <input
                      type="number"
                      step="0.1"
                      min={0}
                      aria-label={t("studio.capsEnd")}
                      value={cue.end}
                      onChange={(e) => setCapsDraft(capsDraft.map((c, j) => (j === i ? { ...c, end: Number(e.target.value) } : c)))}
                    />
                    <input
                      className="draft-cue-text"
                      aria-label={t("studio.capsText")}
                      value={cue.text}
                      maxLength={120}
                      onChange={(e) => setCapsDraft(capsDraft.map((c, j) => (j === i ? { ...c, text: e.target.value } : c)))}
                    />
                    <button type="button" className="btn ghost" aria-label={t("studio.capsRemove")} onClick={() => setCapsDraft(capsDraft.filter((_, j) => j !== i))}>
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    const last = capsDraft[capsDraft.length - 1];
                    const start = last ? last.end : 0;
                    setCapsDraft([...capsDraft, { start, end: Math.round((start + 3) * 10) / 10, text: "" }]);
                  }}
                >
                  + {t("studio.capsAdd")}
                </button>
                <p className="hint">{t("studio.capsEditHint")}</p>
                <div className="action-row">
                  <button type="button" className="btn" disabled={Boolean(busy)} onClick={saveCapsDraft}>
                    {busy === "edit-captions" ? t("studio.voiceOffSaving") : t("studio.editSave")}
                  </button>
                  <button type="button" className="btn ghost" disabled={Boolean(busy)} onClick={() => setCapsDraft(null)}>
                    {t("studio.placeCancel")}
                  </button>
                </div>
              </div>
            )}
            {viewStep === "captions" && project.captions && !capsDraft && (
              <button type="button" className="btn ghost" disabled={Boolean(busy)} onClick={() => setCapsDraft(project.captions?.cues.map((c) => ({ ...c })) || [])}>
                {t("studio.capsEdit")}
              </button>
            )}
            {viewStep === "captions" && project.captions && !capsDraft && (
              <ol className="review-list">
                {project.captions.cues.map((cue, i) => (
                  <li key={i}>
                    <span className="hint">
                      {cue.start.toFixed(1)}–{cue.end.toFixed(1)} с
                    </span>{" "}
                    {asText(cue.text)}
                  </li>
                ))}
              </ol>
            )}
            {viewStep === "render" && <p className="lede">{t("studio.reviewVideo")}</p>}
          </div>
        )}
        <div className="panel" hidden={Boolean(viewStep)}>
          <h2>{next ? t("studio.stepTitle", { label: stepLabel(next.id) }) : t("steps.ready")}</h2>
          {lastDone && (
            <button type="button" className="btn ghost step-back" onClick={() => setViewStep(lastDone.id)}>
              {t("studio.prevStep", { label: stepLabel(lastDone.id) })}
            </button>
          )}
          {!project.idea && (
            <p className="lede">
              {isInvite ? t("studio.introInvite") : isImage ? t("studio.introImage") : t("studio.introVideo")}
            </p>
          )}
          {project.idea && !project.visuals && isImage && (
            <>
              <p><b>{asText(project.idea.title)}</b></p>
              <p className="lede">{asText(project.idea.concept)}</p>
              {project.idea.shot?.summary ? (
                <div className="shot-card">
                  <p className="hint" style={{ margin: 0 }}>{t("studio.shotTitle")}</p>
                  <p className="shot-summary">{asText(project.idea.shot.summary)}</p>
                  <dl className="shot-list">
                    {(
                      [
                        ["subject", "studio.shotSubject"],
                        ["place", "studio.shotPlace"],
                        ["angle", "studio.shotAngle"],
                        ["people", "studio.shotPeople"],
                        ["mood", "studio.shotMood"],
                        ["words", "studio.shotWords"],
                      ] as const
                    )
                      .filter(([key]) => asText(project.idea?.shot?.[key]))
                      .map(([key, label]) => (
                        <div key={key}>
                          <dt>{t(label)}</dt>
                          <dd>{asText(project.idea?.shot?.[key])}</dd>
                        </div>
                      ))}
                  </dl>
                  <p className="hint" style={{ margin: 0 }}>{t("studio.shotHint")}</p>
                  {shotEditOpen && shotDraft ? (
                    <div className="shot-edit">
                      <p className="hint" style={{ margin: 0 }}>{t("studio.shotEditHint")}</p>
                      {(
                        [
                          ["summary", "studio.shotSummary", 280],
                          ["subject", "studio.shotSubject", 240],
                          ["place", "studio.shotPlace", 160],
                          ["angle", "studio.shotAngle", 160],
                          ["people", "studio.shotPeople", 160],
                          ["mood", "studio.shotMood", 160],
                          ["words", "studio.shotWords", 200],
                        ] as const
                      ).map(([key, label, max]) => (
                        <label key={key} className="shot-field">
                          <span>{t(label)}</span>
                          <textarea
                            value={shotDraft[key]}
                            onChange={(e) => setShotDraft((d) => (d ? { ...d, [key]: e.target.value } : d))}
                            maxLength={max}
                            rows={key === "summary" || key === "subject" ? 2 : 1}
                            placeholder={key === "words" ? t("studio.shotWordsPlaceholder") : key === "people" ? t("studio.shotPeoplePlaceholder") : ""}
                          />
                        </label>
                      ))}
                      <div className="action-row">
                        <button type="button" className="btn ghost" disabled={Boolean(busy)} onClick={() => { setShotEditOpen(false); setShotDraft(null); }}>
                          {t("studio.editPictureClose")}
                        </button>
                        <button type="button" className="btn" disabled={Boolean(busy)} onClick={changeShot}>
                          {busy === "shot" ? t("studio.shotChanging") : t("studio.shotSave")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="action-row">
                      <button type="button" className="btn accent" disabled={Boolean(busy) || Boolean(pendingRegen)} onClick={shootThis}>
                        {busy === "shot" || busy === "visuals"
                          ? makingLabel
                          : t("studio.shotYes", { credits: extraPrice("visuals").credits })}
                      </button>
                      <button type="button" className="btn ghost" disabled={Boolean(busy)} onClick={openShotEdit}>
                        {t("studio.shotChange")}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="hint">{asText(project.idea.visualDirection)}</p>
              )}
              <VersionCompare step="idea" versions={project.versions?.idea || []} onRestore={restore} busy={Boolean(busy)} t={t} />
            </>
          )}
          {isInvite && project.idea && !project.hasImages && (
            <p className="hint">{t("studio.inviteHint")}</p>
          )}
          {project.idea && !project.script && !isImage && (
            <>
              <p><b>{asText(project.idea.title)}</b></p>
              <p className="lede">{asText(project.idea.concept)}</p>
              <p className="hint">{asText(project.idea.visualDirection)}</p>
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
              <p><b>{asText(project.voice?.voicePreset || project.voice?.voice)}</b></p>
              <p className="lede">{asText(project.voice?.notes)}</p>
              {audioSrc && <audio controls src={audioSrc} style={{ width: "100%", marginTop: 12 }} />}
            </>
          )}
          {project.captions && !project.hasVideo && <p className="lede">{t("studio.captionsReady")}</p>}
          {archive?.atLimit && !project.hasVideo && !isImage && (
            <p className="hint">{t("studio.archiveWarn", { limit: archive.limit })}</p>
          )}
          {!project.hasVideo && !project.hasImages && (project.status === "expired" || project.status === "ready") && (
            <p className="hint">{t("studio.fileGone")}</p>
          )}
          {project.hasImages && (
            <>
              <div className="ready-block">
                <p className="ok">
                  {t(isInvite ? "studio.inviteReady" : "studio.pictureReady", { credits: project.creditsUsed })}
                </p>
                {shapeLabel(currentShape, t) && (
                  <p className="hint">{t("studio.shapeNow", { shape: shapeLabel(currentShape, t) })}</p>
                )}
                <p className="hint">{t(isInvite ? "studio.inviteKeep" : "studio.pictureKeep")}</p>
                <div className="action-row">
                  {downloadSrc && !String(downloadSrc).startsWith("linear") && (
                    <a
                      className="btn accent"
                      href={downloadSrc}
                      download={downloadName(project, t, "jpg")}
                    >
                      {t(isInvite ? "studio.downloadInvite" : "studio.downloadN", { n: 1 })}
                    </a>
                  )}
                  {SHOW_SHARE_AND_PUBLISH && (
                    <button className="btn ghost" type="button" onClick={sharePreview}>
                      {shareCopied ? t("studio.shareCopied") : t("studio.share")}
                    </button>
                  )}
                </div>
                {isImage && (
                <details
                  className="edit-block"
                  open={editsOpen}
                  onToggle={(e) => {
                    const open = e.currentTarget.open;
                    setEditsOpen(open);
                    localStorage.setItem(EDITS_OPEN_KEY, open ? "1" : "0");
                  }}
                >
                  <summary className="edit-block-head">
                    <h3>{t("studio.editBlockTitle")}</h3>
                    <p className="hint">{t("studio.editBlockHint")}</p>
                  </summary>
                {isPoster && (
                  <div style={{ marginTop: 16 }}>
                    <p className="hint">{t("studio.samePictureHint")}</p>
                    <div className="action-row">
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={Boolean(busy)}
                        onClick={() => remakeLanguage("en")}
                      >
                        {makingPicture
                          ? t("studio.makingPicture")
                          : t("studio.samePictureEn", { credits: extraPrice("visuals", project.visuals?.[scene]?.sceneId ?? 1).credits })}
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={Boolean(busy)}
                        onClick={() => remakeLanguage("uk")}
                      >
                        {makingPicture
                          ? t("studio.makingPicture")
                          : t("studio.samePictureUk", { credits: extraPrice("visuals", project.visuals?.[scene]?.sceneId ?? 1).credits })}
                      </button>
                    </div>
                  </div>
                )}
                {isImage && (
                  <div style={{ marginTop: 16 }}>
                    {!copyEditOpen ? (
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={Boolean(busy)}
                        onClick={() => {
                          setError("");
                          setCopyEditOpen(true);
                        }}
                      >
                        {t("studio.editPictureAsk")}
                      </button>
                    ) : (
                      <div className="edit-picture-panel">
                        <div className="row" style={{ marginBottom: 8 }}>
                          <p className="hint" style={{ margin: 0 }}>{t("studio.editPictureAsk")}</p>
                          <button
                            type="button"
                            className="btn ghost"
                            disabled={Boolean(busy)}
                            onClick={() => {
                              setCopyEditOpen(false);
                              setCopyEdit("");
                              setCopyEditImage("");
                              setError("");
                            }}
                          >
                            {t("studio.editPictureClose")}
                          </button>
                        </div>
                        <p className="hint">{t("studio.editPictureHint")}</p>
                        <textarea
                          className="brief-box"
                          value={copyEdit}
                          onChange={(e) => setCopyEdit(e.target.value)}
                          maxLength={400}
                          rows={3}
                          placeholder={t("studio.editPicturePlaceholder")}
                          autoFocus
                          style={{ minHeight: 88, marginTop: 8 }}
                        />
                        <div className="edit-example">
                          {copyEditImage ? (
                            <div className="example">
                              <img src={copyEditImage} alt={t("studio.editExampleAlt")} />
                              <button
                                type="button"
                                className="example-x"
                                aria-label={t("briefImages.remove")}
                                disabled={Boolean(busy)}
                                onClick={() => setCopyEditImage("")}
                              >
                                ×
                              </button>
                            </div>
                          ) : (
                            <label className={`btn ghost${busy ? " off" : ""}`}>
                              + {t("studio.editExampleAdd")}
                              <input
                                className="sr-only"
                                type="file"
                                accept="image/*"
                                disabled={Boolean(busy)}
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  e.target.value = "";
                                  if (!file) return;
                                  setError("");
                                  try {
                                    setCopyEditImage(await prepareImage(file));
                                  } catch {
                                    setError(t("briefImages.badFile"));
                                  }
                                }}
                              />
                            </label>
                          )}
                          <span className="hint">{t("studio.editExampleHint")}</span>
                        </div>
                        {error && (
                          <p className="err" style={{ marginTop: 8 }}>
                            {error}
                          </p>
                        )}
                        <div className="action-row" style={{ marginTop: 10 }}>
                          <button
                            type="button"
                            className="btn ghost"
                            disabled={Boolean(busy)}
                            onClick={applyCopyEdit}
                          >
                            {makingPicture
                              ? t("studio.makingPicture")
                              : t("studio.editPictureApply", { credits: extraPrice("visuals", project.visuals?.[scene]?.sceneId ?? 1).credits })}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {isImage && (
                  <div style={{ marginTop: 16 }}>
                    <p className="hint">
                      <b>{t("studio.reformatAsk")}</b> · {t("studio.reformatHint")}
                    </p>
                    <div className="pills" role="group" aria-label={t("studio.reformatAsk")}>
                      {(["square", "portrait", "portrait34", "story", "wide"] as const)
                        .filter((shape) => shape !== currentShape)
                        .map((shape) => (
                          <button
                            key={shape}
                            type="button"
                            aria-pressed={reformatTo === shape}
                            className={`pill ${reformatTo === shape ? "on" : ""}`}
                            disabled={Boolean(busy)}
                            onClick={() => setReformatTo(reformatTo === shape ? "" : shape)}
                          >
                            {t(`shapes.${shape}`)}
                          </button>
                        ))}
                    </div>
                    {reformatTo && (
                      <div className="action-row" style={{ marginTop: 10 }}>
                        <button type="button" className="btn ghost" disabled={Boolean(busy)} onClick={applyReformat}>
                          {makingPicture
                            ? t("studio.makingPicture")
                            : t("studio.reformatApply", {
                                shape: t(`shapes.${reformatTo}Hint`).split(" · ")[0],
                                credits: extraPrice("visuals", project.visuals?.[scene]?.sceneId ?? 1).credits,
                              })}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {isImage && autoLogo && frameHasOurLogo && (
                  <div style={{ marginTop: 16 }}>
                    <p className="hint">{t("studio.placeAutoHint")}</p>
                    {placing ? (
                      <div className="logo-place-panel">
                        <p className="hint">{t("studio.placeHint")}</p>
                        <label className="hint logo-place-size">
                          {t("studio.placeSize")}
                          <input
                            type="range"
                            min={4}
                            max={80}
                            value={Math.round(placing.box.w * 100)}
                            onChange={(e) => {
                              const w = Number(e.target.value) / 100;
                              setPlacing((p) =>
                                p ? { ...p, box: fitBox({ ...p.box, x: p.box.x + (p.box.w - w) / 2, w }, p.markRatio, p.pictureRatio) } : p
                              );
                            }}
                          />
                        </label>
                        <div className="action-row">
                          <button type="button" className="btn" disabled={Boolean(busy)} onClick={savePlacing}>
                            {busy === "logo" ? t("studio.logoAdding") : t("studio.placeSave")}
                          </button>
                          <button type="button" className="btn ghost" disabled={Boolean(busy)} onClick={stopPlacing}>
                            {t("studio.placeCancel")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      hasBrandMark && (
                        <div className="action-row" style={{ marginTop: 10 }}>
                          <button type="button" className="btn ghost" disabled={Boolean(busy)} onClick={startPlacing}>
                            {busy === "place" ? t("studio.placeOpening") : t("studio.placeOpen")}
                          </button>
                        </div>
                      )
                    )}
                  </div>
                )}
                {isImage && !autoLogo && (
                  <div style={{ marginTop: 16 }}>
                    <p className="hint">{t(frameHasOurLogo ? "studio.logoOnIt" : "studio.logoAsk")}</p>
                    {hasBrandMark && (
                        <div className="pills" role="group" aria-label={t("brand.corner")}>
                          {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map((corner) => (
                            <button
                              key={corner}
                              type="button"
                              aria-pressed={litCorner === corner}
                              className={`pill ${litCorner === corner ? "on" : ""}`}
                              onClick={() => setPickedCorner(corner)}
                            >
                              {t(
                                corner === "top-left"
                                  ? "brand.cornerTopLeft"
                                  : corner === "top-right"
                                    ? "brand.cornerTopRight"
                                    : corner === "bottom-left"
                                      ? "brand.cornerBottomLeft"
                                      : "brand.cornerBottomRight"
                              )}
                            </button>
                          ))}
                        </div>
                    )}
                    <div className="action-row" style={{ marginTop: 10 }}>
                      {hasBrandMark && (
                        <button type="button" className="btn ghost" disabled={Boolean(busy)} onClick={() => changeLogo(false)}>
                          {busy === "logo" ? t("studio.logoAdding") : t(frameHasOurLogo ? "studio.logoMove" : "studio.logoAdd")}
                        </button>
                      )}
                      {frameHasOurLogo && (
                        <button type="button" className="btn ghost" disabled={Boolean(busy)} onClick={() => changeLogo(true)}>
                          {busy === "logo-off" ? t("studio.logoRemoving") : t("studio.logoRemove")}
                        </button>
                      )}
                    </div>
                    {placing ? (
                      <div className="logo-place-panel">
                        <p className="hint">{t("studio.placeHint")}</p>
                        <label className="hint logo-place-size">
                          {t("studio.placeSize")}
                          <input
                            type="range"
                            min={4}
                            max={80}
                            value={Math.round(placing.box.w * 100)}
                            onChange={(e) => {
                              const w = Number(e.target.value) / 100;
                              setPlacing((p) =>
                                p ? { ...p, box: fitBox({ ...p.box, x: p.box.x + (p.box.w - w) / 2, w }, p.markRatio, p.pictureRatio) } : p
                              );
                            }}
                          />
                        </label>
                        <div className="action-row">
                          <button type="button" className="btn" disabled={Boolean(busy)} onClick={savePlacing}>
                            {busy === "logo" ? t("studio.logoAdding") : t("studio.placeSave")}
                          </button>
                          <button type="button" className="btn ghost" disabled={Boolean(busy)} onClick={stopPlacing}>
                            {t("studio.placeCancel")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      hasBrandMark && (
                        <div className="action-row" style={{ marginTop: 10 }}>
                          <button type="button" className="btn ghost" disabled={Boolean(busy)} onClick={startPlacing}>
                            {busy === "place" ? t("studio.placeOpening") : t("studio.placeOpen")}
                          </button>
                        </div>
                      )
                    )}
                    {hasBrandMark ? (
                      <>
                        <p className="hint" style={{ marginTop: 6 }}>{t("studio.logoUndo")}</p>
                        <p className="hint">
                          {t("studio.logoCornerHint")} <Link to="/app/brand">{t("nav.brand")}</Link>
                        </p>
                      </>
                    ) : (
                      <p className="hint">
                        {t("studio.logoNeedKit")} <Link to="/app/brand">{t("nav.brand")}</Link>
                      </p>
                    )}
                  </div>
                )}
                </details>
                )}
              </div>
              <div className="ready-block">
                {(project.versions?.visuals || []).length < 2 ? (
                  <p className="hint">{t("studio.compareHint")}</p>
                ) : (
                  <PictureCompare
                    versions={project.versions?.visuals || []}
                    srcs={versionSrcs}
                    liveSrc={imageSrcs[project.visuals?.[0]?.sceneId ?? 1]}
                    previewId={previewVersionId}
                    poster={isPoster}
                    ratio={shapeRatio}
                    onPreview={pickTake}
                    onDelete={deleteTake}
                    onKeepCurrent={keepCurrentOnly}
                    busy={Boolean(busy)}
                    t={t}
                  />
                )}
              </div>
              {SHOW_SHARE_AND_PUBLISH && (project.feedback ? (
                <p className="ok" style={{ marginTop: 16 }}>{t("studio.thanksPost")}</p>
              ) : (
                <div className="ready-block">
                  <p className="hint">{t("studio.publishPost")}</p>
                  <div className="choice-row tones">
                    {[
                      ["yes", "studio.yes"],
                      ["edits", "studio.edits"],
                      ["no", "studio.no"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={`choice ${publishable === value ? "on" : ""}`}
                        onClick={() => setPublishable(value)}
                      >
                        <b>{t(label)}</b>
                      </button>
                    ))}
                  </div>
                  {publishable && publishable !== "yes" && (
                    <div>
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
                    <button className="btn" type="button" onClick={sendFeedback}>
                      {t("studio.send")}
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
          {project.hasVideo && (
            <>
              <p className="ok">{t("studio.reelReady", { credits: project.creditsUsed })}</p>
              <p className="hint">{t("studio.reelKeep")}</p>
              <div className="row" style={{ marginTop: 18 }}>
                {videoSrc && (
                  <a className="btn" href={videoSrc} download={downloadName(project, t, "mp4")}>
                    {t("studio.downloadMp4")}
                  </a>
                )}
                {SHOW_SHARE_AND_PUBLISH && (
                  <button className="btn ghost" type="button" onClick={sharePreview}>
                    {shareCopied ? t("studio.shareCopied") : t("studio.share")}
                  </button>
                )}
              </div>
              {SHOW_SHARE_AND_PUBLISH && (project.feedback ? (
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
              ))}
            </>
          )}

          {next && !(isImage && next.id === "visuals" && project.idea?.shot?.summary) && (
            <div className="action-row" style={{ marginTop: 18 }}>
              <button className="btn accent" disabled={Boolean(busy) || Boolean(pendingRegen)} onClick={() => run(next.id)}>
                {busy && busy === next.id
                  ? makingLabel
                  : next.id === "captions" && project.voiceOff
                    ? t("studio.makeCaptionsFree")
                    : extraPrice(next.id).extra
                      ? t("studio.makeStep2x", { label: stepLabel(next.id).toLowerCase(), credits: extraPrice(next.id).credits })
                      : t("studio.makeStep", { label: stepLabel(next.id).toLowerCase(), credits: extraPrice(next.id).credits })}
              </button>
              {next.id === "voice" && (
                <button className="btn ghost" disabled={Boolean(busy) || Boolean(pendingRegen)} onClick={() => toggleVoice(true)}>
                  {busy === "voice-off" ? t("studio.voiceOffSaving") : t("studio.voiceOff")}
                </button>
              )}
              {next.id === "captions" && (
                <button className="btn ghost" disabled={Boolean(busy) || Boolean(pendingRegen)} onClick={() => toggleCaptions(true)}>
                  {busy === "captions-off" ? t("studio.voiceOffSaving") : t("studio.captionsOff")}
                </button>
              )}
            </div>
          )}
          {!isImage && project.script && reelLanguagesMixed && !viewStep && (
            <div className="voice-off-note">
              <p className="hint" style={{ margin: 0 }}>{t("studio.reelLangMixed")}</p>
              <div className="reel-lang">
                <span className="hint">{t("studio.reelLangAsk")}</span>
                <button type="button" className="btn ghost" disabled={Boolean(busy)} onClick={() => translateReel("en")}>
                  {busy === "lang-en" ? t("studio.reelLangWorking") : t("studio.reelLangEn")}
                </button>
                <button type="button" className="btn ghost" disabled={Boolean(busy)} onClick={() => translateReel("uk")}>
                  {busy === "lang-uk" ? t("studio.reelLangWorking") : t("studio.reelLangUk")}
                </button>
              </div>
            </div>
          )}
          {next?.id === "voice" && <p className="hint" style={{ marginTop: 6 }}>{t("studio.voiceOffHint")}</p>}
          {next?.id === "captions" && <p className="hint" style={{ marginTop: 6 }}>{t("studio.captionsOffHint")}</p>}
          {project.captionsOff && !isImage && (
            <div className="voice-off-note">
              <p className="hint" style={{ margin: 0 }}>{t("studio.captionsOffNow")}</p>
              <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => toggleCaptions(false)}>
                {t("studio.captionsOn")}
              </button>
            </div>
          )}
          {project.voiceOff && !isImage && (
            <div className="voice-off-note">
              <p className="hint" style={{ margin: 0 }}>{t("studio.voiceOffNow")}</p>
              <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => toggleVoice(false)}>
                {t("studio.voiceOn")}
              </button>
            </div>
          )}
          {!isImage && project.script && !viewStep && (
            <div className="music-block">
              <p className="music-title">{t("studio.musicTitle")}</p>
              {!project.music ? (
                <>
                  <p className="hint" style={{ margin: 0 }}>{t("studio.musicHint")}</p>
                  <label className={`btn ghost${busy ? " disabled" : ""}`}>
                    {busy === "music" ? t("studio.musicUploading") : t("studio.musicAdd")}
                    <input
                      type="file"
                      accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,audio/ogg,audio/flac,.mp3,.m4a,.aac,.wav,.ogg,.flac"
                      hidden
                      disabled={Boolean(busy)}
                      onChange={(e) => {
                        pickMusic(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </>
              ) : (
                <>
                  <p className="hint" style={{ margin: 0 }}>
                    <b>{project.music.name}</b> · {t("studio.musicLength", { sec: Math.round(project.music.durationSec) })}
                  </p>
                  {musicSrc && <audio controls src={musicSrc} style={{ width: "100%" }} />}
                  <label className="music-row">
                    <span>{t("studio.musicVolume", { n: (musicDraft || project.music).volume })}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={(musicDraft || project.music).volume}
                      disabled={Boolean(busy)}
                      onChange={(e) => setMusicDraft({ ...(musicDraft || project.music!), volume: Number(e.target.value) })}
                    />
                  </label>
                  <label className="music-row">
                    <span>{t("studio.musicStart")}</span>
                    <input
                      type="number"
                      min={0}
                      max={Math.max(0, Math.floor(project.music.durationSec - 1))}
                      step={1}
                      value={(musicDraft || project.music).start}
                      disabled={Boolean(busy)}
                      onChange={(e) => setMusicDraft({ ...(musicDraft || project.music!), start: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </label>
                  <p className="hint" style={{ margin: 0 }}>{t(project.voiceOff ? "studio.musicAlone" : "studio.musicUnderVoice")}</p>
                  <div className="row">
                    {musicDraft && (
                      <button className="btn accent" type="button" disabled={Boolean(busy)} onClick={saveMusic}>
                        {busy === "music" ? t("studio.musicSaving") : t(project.hasVideo ? "studio.musicApplyVideo" : "studio.musicApply")}
                      </button>
                    )}
                    <label className={`btn ghost${busy ? " disabled" : ""}`}>
                      {t("studio.musicReplace")}
                      <input
                        type="file"
                        accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,audio/ogg,audio/flac,.mp3,.m4a,.aac,.wav,.ogg,.flac"
                        hidden
                        disabled={Boolean(busy)}
                        onChange={(e) => {
                          pickMusic(e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={dropMusic}>
                      {busy === "music-off" ? t("studio.musicSaving") : t("studio.musicRemove")}
                    </button>
                  </div>
                </>
              )}
              <p className="hint" style={{ margin: 0 }}>{t(project.hasVideo ? "studio.musicFreeNow" : "studio.musicLater")}</p>
            </div>
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
          {lastDone && !project.hasImages && !project.hasVideo && (
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
