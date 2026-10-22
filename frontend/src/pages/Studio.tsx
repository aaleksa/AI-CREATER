import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ApiError, SHAPE_RATIO, api, fetchMedia, refreshMe, type ArchiveState, type BrandKitRow, type InviteCard, type LogoBox, type Project, type ReelLogo, type ReelTitles, type Shot, VOICE_CHOICES, type VoiceChoice } from "../lib/api";
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

/**
 * A line's language: Ukrainian when it has Ukrainian words, English when it has everyday English words. Addresses and
 * names ("Eltham High Street, London SE9 1TX") are neither, so they never make a script look mixed.
 */
const ENGLISH_WORDS = /\b(the|and|to|for|with|you|your|our|we|us|is|are|of|at|in|on|this|it|join|come|see|get|be|all|now|here|every|help)\b/i;
function lineLanguage(line: string): "uk" | "en" | "" {
  return /\p{Script=Cyrillic}{3}/u.test(line) ? "uk" : ENGLISH_WORDS.test(line) ? "en" : "";
}

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

/** Light colour: dark words go on it (same split as the renderer). */
function hexLight(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const v = parseInt(m[1], 16);
  return (0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255 > 0.6;
}

/** Longest call to action the end card shows at a readable size (the server keeps the same limit). */
const CTA_MAX = 90;
/** Pick who reads the Reel; each voice can be heard first (a short sample, made once). */
function VoicePicker({
  value,
  onPick,
  disabled,
  lang,
  t,
}: {
  value: VoiceChoice;
  onPick: (voice: VoiceChoice) => void;
  disabled: boolean;
  lang: "uk" | "en";
  t: (path: string, vars?: Record<string, string | number>) => string;
}) {
  const [playing, setPlaying] = useState<VoiceChoice | "">("");
  const audio = useRef<HTMLAudioElement | null>(null);
  async function listen(voice: VoiceChoice) {
    audio.current?.pause();
    setPlaying(voice);
    try {
      const blob = await fetchMedia(`/projects/voice-samples/${voice}?lang=${lang}`);
      const url = URL.createObjectURL(blob);
      const player = new Audio(url);
      audio.current = player;
      player.onended = () => {
        setPlaying("");
        URL.revokeObjectURL(url);
      };
      await player.play();
    } catch {
      setPlaying("");
    }
  }
  return (
    <div className="voice-picker" role="radiogroup" aria-label={t("studio.voicePick")}>
      {VOICE_CHOICES.map((voice) => (
        <div key={voice} className={`voice-option${value === voice ? " on" : ""}`}>
          <button type="button" role="radio" aria-checked={value === voice} className="voice-pick" disabled={disabled} onClick={() => onPick(voice)}>
            <b>{t(`studio.voice_${voice}`)}</b>
            <span className="hint">{t(`studio.voiceHint_${voice}`)}</span>
          </button>
          <button type="button" className="btn ghost tiny" onClick={() => listen(voice)} aria-label={t("studio.voiceListen")}>
            {playing === voice ? "…" : "▶"}
          </button>
        </div>
      ))}
    </div>
  );
}

const REEL_CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
/** Same boxes the renderer uses on a 1080×1920 Reel. */
const REEL_LOGO_BOX = { s: [170, 110], m: [230, 150], l: [300, 200] } as const;

/** A white or very light logo gets a dark plate, everything else a light one — the same test the renderer runs. */
function markIsLight(img: HTMLImageElement) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 48;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, 48, 48);
    const data = ctx.getImageData(0, 0, 48, 48).data;
    let sum = 0;
    let count = 0;
    for (let i = 0; i + 3 < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      count += 1;
    }
    return count > 0 && sum / count > 0.62;
  } catch {
    return false;
  }
}

/** Where the logo will sit on the finished Reel, drawn over the phone while there is no video yet. */
function ReelLogoPreview({ mark, logo, plate }: { mark: { src: string; w: number; h: number; dark: boolean }; logo: ReelLogo; plate: boolean }) {
  const [boxW, boxH] = REEL_LOGO_BOX[logo.size];
  const scale = Math.min(boxW / mark.w, boxH / mark.h);
  const w = mark.w * scale;
  const h = mark.h * scale;
  const pad = plate ? Math.max(14, Math.min(w, h) * 0.16) : 0;
  const pct = (px: number) => `${(px / 1080) * 100}%`;
  const side = pct(48);
  return (
    <div
      className={`reel-logo-preview${plate ? (mark.dark ? " plate-dark" : " plate-light") : ""}`}
      style={{
        width: pct(w + pad * 2),
        padding: pct(pad),
        left: logo.corner.endsWith("left") ? side : undefined,
        right: logo.corner.endsWith("right") ? side : undefined,
        top: logo.corner.startsWith("top") ? "12%" : undefined,
        bottom: logo.corner.startsWith("bottom") ? "22%" : undefined,
      }}
      aria-hidden
    >
      <img src={mark.src} alt="" style={{ width: "100%", aspectRatio: `${w} / ${h}` }} />
    </div>
  );
}

function VersionCompare({
  step,
  versions,
  onRestore,
  onFork,
  busy,
  t,
}: {
  step: "idea" | "script";
  versions: {
    id: string;
    accepted: boolean;
    payload: { title?: string; concept?: string; hook?: string; cta?: string; scenes?: { id: number; voiceover: string }[] } | null;
    keeps?: { script?: boolean; frames: boolean; voice: boolean; captions: boolean };
  }[];
  onRestore: (step: "idea" | "script", id: string) => void;
  onFork?: (step: "idea" | "script", id: string) => void;
  busy: boolean;
  t: (path: string, vars?: Record<string, string | number>) => string;
}) {
  if (versions.length < 2) return null;
  const numbered = versions.map((version, index) => ({ version, n: index + 1 }));
  const ordered = [...numbered.filter((item) => item.version.accepted), ...numbered.filter((item) => !item.version.accepted).reverse()];
  return (
    <details className="edit-block versions">
      <summary className="edit-block-head">
        <h3>{t(step === "script" ? "studio.scriptVersions" : "studio.ideaVersions", { n: versions.length })}</h3>
        <p className="hint">{t(step === "script" ? "studio.scriptCompare" : "studio.ideaCompare")}</p>
      </summary>
      <ol className="version-list">
        {ordered.map(({ version, n }) => {
          const line =
            step === "idea"
              ? asText(version.payload?.title) || asText(version.payload?.hook || version.payload?.concept)
              : asText(version.payload?.cta) || asText(version.payload?.scenes?.[0]?.voiceover);
          const more = step === "idea" ? asText(version.payload?.hook || version.payload?.concept) : asText(version.payload?.scenes?.[0]?.voiceover);
          return (
            <li key={version.id} className={`version-row${version.accepted ? " on" : ""}`}>
              <span className="version-tag">{version.accepted ? t("studio.current") : t("studio.takeN", { n })}</span>
              <span className="version-text">
                <b>{line}</b>
                {more && more !== line && <span className="hint">{more}</span>}
                {!version.accepted && version.keeps && (() => {
                  const back = [
                    version.keeps.script ? t("studio.backScript") : "",
                    version.keeps.frames ? t("studio.backFrames") : "",
                    version.keeps.voice ? t("studio.backVoice") : "",
                  ].filter(Boolean);
                  return back.length ? <span className="version-keeps">{t("studio.backWith", { list: back.join(", ") })}</span> : null;
                })()}
              </span>
              <span className="version-actions">
                {!version.accepted && (
                  <button className="btn ghost tiny" type="button" disabled={busy} onClick={() => onRestore(step, version.id)}>
                    {t("studio.useVersionShort")}
                  </button>
                )}
                {onFork && (
                  <button className="btn ghost tiny" type="button" disabled={busy} onClick={() => onFork(step, version.id)} title={t("studio.forkHint")}>
                    {t("studio.forkShort")}
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </details>
  );
}

export default function Studio() {
  const { id } = useParams();
  const navigate = useNavigate();
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
  const [briefOpen, setBriefOpen] = useState(false);
  const [soundTab, setSoundTab] = useState<"captions" | "titles" | "logo" | "music" | "voice">("voice");
  const [soundOpen, setSoundOpen] = useState<boolean | null>(null);
  const [paidOpen, setPaidOpen] = useState(false);
  const [busySince, setBusySince] = useState(0);
  const [busyTick, setBusyTick] = useState(0);
  const [doneNote, setDoneNote] = useState("");
  const lastBusy = useRef<string | null>(null);
  const videoAtStart = useRef(false);
  const reasonRef = useRef<HTMLDivElement>(null);
  const [reelMark, setReelMark] = useState<{ src: string; w: number; h: number; dark: boolean } | null>(null);
  const [reelMarkChecked, setReelMarkChecked] = useState("");
  const [scenesOpen, setScenesOpen] = useState<boolean | null>(null);
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
  const [scriptDraft, setScriptDraft] = useState<{ cta: string; scenes: { id: number; onScreen: string; voiceover: string; frameWish: string }[] } | null>(null);
  /** Scenes whose "what I want in the frame" just changed: their frames change only when redone. */
  const [wishRedo, setWishRedo] = useState<number[]>([]);
  const [capsDraft, setCapsDraft] = useState<{ start: number; end: number; text: string }[] | null>(null);
  // A half-made edit belongs to the step it was opened on.
  useEffect(() => {
    setScriptDraft(null);
    setCapsDraft(null);
    setWishRedo([]);
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

  const markKey = project && project.type !== "image_post" && project.useBrand !== false && (kit?.logo_url || kit?.business_name) ? `${kit?.logo_url || ""}|${kit?.business_name || ""}|${kit?.font || ""}` : "";
  useEffect(() => {
    if (!id || !markKey) {
      setReelMark(null);
      return;
    }
    let cancelled = false;
    let url = "";
    fetchMedia(`/projects/${id}/logo/mark`)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          if (cancelled) return;
          setReelMark({ src: url, w: img.naturalWidth, h: img.naturalHeight, dark: markIsLight(img) });
          setReelMarkChecked(markKey);
        };
        img.src = url;
      })
      .catch(() => {
        if (!cancelled) setReelMark(null);
      })
      .finally(() => {
        if (!cancelled) setReelMarkChecked(markKey);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, markKey]);

  useEffect(() => {
    if (!busy) return;
    videoAtStart.current = Boolean(project?.hasVideo);
    setBusySince(Date.now());
    setBusyTick(0);
    setDoneNote("");
    const timer = window.setInterval(() => setBusyTick((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    const finished = lastBusy.current;
    lastBusy.current = busy;
    if (busy || !finished || error) return;
    const note = doneText(finished);
    if (!note) return;
    setDoneNote(note);
    const timer = window.setTimeout(() => setDoneNote(""), note === t("studio.doneVideoDown") ? 12000 : 6000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  // "Why didn't it work?" comes first: bring it into view, or the redo seems to do nothing.
  useEffect(() => {
    if (!pendingRegen) return;
    const timer = window.setTimeout(() => reasonRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    return () => window.clearTimeout(timer);
  }, [pendingRegen]);

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
  /** The step as the object of "Make …": "Зробити ідею", "Зробити відео". */
  const stepObject = (id: string) =>
    t(`stepsMake.${id === "visuals" ? (isInvite ? "invitation" : isImage ? "pictures" : "visuals") : id}`);
  const next = useMemo(() => STEPS.find((s) => project && !doneThrough(project, s.id)), [project, isImage, isInvite]);
  const lastDone = useMemo(() => [...STEPS].reverse().find((s) => project && doneThrough(project, s.id)), [project, isImage, isInvite]);
  const extraPrice = (step: string, sceneId?: number) => {
    // Without a voice the captions are the scenes' own words: free.
    if (step === "captions" && project?.voiceOff) return { extra: false, credits: 0 };
    // The video is paid once per Reel; making it again is free.
    if (step === "render" && (project?.renderPaid || project?.hasVideo)) return { extra: false, credits: 0 };
    const base = sceneId ? 8 : STEPS.find((s) => s.id === step)?.cost ?? 0;
    // A frame counts its own tries; other steps count theirs.
    const used = sceneId ? (project?.frameAttempts?.[String(sceneId)] ?? 1) : (project?.stepAttempts?.[step] ?? 0);
    const included = project?.maxStepAttempts ?? 3;
    const mult = used >= included ? (project?.extraAttemptMultiplier ?? 2) : 1;
    return { extra: used >= included, credits: base * mult };
  };
  const prices = { video: extraPrice("render").credits, voice: extraPrice("voice").credits, caps: extraPrice("captions").credits };
  /** "Made again" list for what this project already has: frames/picture, voice, captions from the voice, video. */
  function redoCost(what: { script?: boolean; frames?: boolean; voice?: boolean; captions?: boolean; video?: boolean }) {
    const parts: string[] = [];
    let total = 0;
    const add = (key: string, n: number) => {
      parts.push(t(key, { n }));
      total += n;
    };
    if (what.script && !isImage && project?.script) add("studio.redoScript", extraPrice("script").credits);
    if (what.frames && project?.visuals?.length) add(isImage ? "studio.redoPicture" : "studio.redoFrames", extraPrice("visuals").credits);
    if (what.voice && !project?.voiceOff && project?.audioUrl) add("studio.redoVoice", prices.voice);
    if (what.captions && project?.captions && !project.voiceOff) add("studio.redoCaps", prices.caps);
    if (what.video && project?.hasVideo && prices.video > 0) add("studio.redoVideo", prices.video);
    return { list: parts.join(", "), total };
  }

  /** The confirm before bringing back an older idea or script: free to pick, but say what has to be made again. */
  function restoreAsk(step: "idea" | "script", versionId: string) {
    const version = (step === "idea" ? project?.versions?.idea : project?.versions?.script)?.find((v) => v.id === versionId);
    const keeps = version?.keeps;
    if (step === "script" && !isImage) {
      const older = project?.versions?.script?.find((v) => v.id === versionId)?.payload;
      const now = project?.script;
      const sameScenes =
        Boolean(older && now) &&
        older!.scenes.length === now!.scenes.length &&
        older!.scenes.every((sc, i) => sc.id === now!.scenes[i].id && (sc.visualPrompt || "").trim() === (now!.scenes[i].visualPrompt || "").trim());
      if (sameScenes) {
        const voiceChanged = older!.scenes.some((sc, i) => (sc.voiceover || "").trim() !== (now!.scenes[i].voiceover || "").trim());
        const redo = voiceChanged && !keeps?.voice ? redoCost({ voice: true, captions: true, video: true }) : { list: "", total: 0 };
        return redo.total ? t("studio.restoreScriptSamePaid", redo) : t("studio.restoreScriptSameFree");
      }
    }
    if (!keeps || isImage) {
      const redo = step === "idea" ? redoCost({ script: true, frames: true, voice: true, captions: true, video: true }) : redoCost({ frames: true, voice: true, captions: true, video: true });
      return redo.total ? t(step === "idea" ? "studio.restoreIdeaPaid" : "studio.restoreScriptNewPaid", redo) : t("studio.restoreFree");
    }
    if (step === "idea" && !keeps.script) {
      const redo = redoCost({ script: true, frames: true, voice: true, captions: true, video: true });
      return redo.total ? t("studio.restoreIdeaPaid", redo) : t("studio.restoreFree");
    }
    const back = [
      step === "idea" ? t("studio.backScript") : "",
      keeps.frames ? t("studio.backFrames") : "",
      keeps.voice ? t("studio.backVoice") : "",
    ].filter(Boolean);
    const redo = redoCost({ frames: !keeps.frames, voice: !keeps.voice, captions: !keeps.captions, video: true });
    return redo.total
      ? t("studio.restoreBranchPaid", { back: back.join(", ") || t("studio.backNothing"), list: redo.list, total: redo.total })
      : t("studio.restoreBranchFree", { back: back.join(", ") || t("studio.backNothing") });
  }


  /** What a Reel still needs before its video: voice (unless "no voice"), captions (unless "no captions"), the video. */
  const finishSteps = (() => {
    if (isImage || !project?.visuals?.length || project.hasVideo) return [] as string[];
    const steps: string[] = [];
    if (!project.voiceOff && !project.audioUrl) steps.push("voice");
    if (!project.captionsOff && !project.captions) steps.push("captions");
    steps.push("render");
    return steps;
  })();
  const finishTotal = finishSteps.reduce((sum, step) => sum + extraPrice(step).credits, 0);

  async function finishReel() {
    if (!finishSteps.length) return;
    const names = finishSteps.map((step) => t(step === "render" ? "studio.videoNoun" : step === "voice" ? "studio.voiceNoun" : "studio.captionsNoun")).join(", ");
    if (finishTotal > 0 && !window.confirm(t("studio.finishConfirm", { list: names, total: finishTotal }))) return;
    for (const step of finishSteps) {
      const ok = await execute(step);
      if (!ok) return;
    }
  }

  // Translating is free itself; what it clears has to be made again. Only what this Reel already has is counted.
  // What a translation makes again: nothing for the voice when its words are already in that language (only the
  // on-screen words change then, and the voice and its captions stay).
  const translateCost = (lang: "en" | "uk") => {
    const parts: string[] = [];
    let total = 0;
    const voiceMoves = (project?.script?.scenes || []).some((sc) => {
      const kind = lineLanguage(String(sc.voiceover || ""));
      return kind !== "" && kind !== lang;
    });
    if (!voiceMoves) return { list: "", total: 0 };
    if (!project?.voiceOff && project?.audioUrl) {
      parts.push(t("studio.redoVoice", { n: prices.voice }));
      total += prices.voice;
    }
    if (project?.captions && !project.voiceOff) {
      parts.push(t("studio.redoCaps", { n: prices.caps }));
      total += prices.caps;
    }
    if (project?.hasVideo && prices.video > 0) {
      parts.push(t("studio.redoVideo", { n: prices.video }));
      total += prices.video;
    }
    return { list: parts.join(", "), total };
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
    const kinds = new Set(lines.map((line) => lineLanguage(String(line || ""))).filter(Boolean));
    return kinds.size > 1;
  }, [project?.script]);
  const shownTake = (project?.versions?.visuals || []).findIndex((version) => version.id === (previewVersionId || acceptedVersionId));
  const autoLogo = Boolean((project?.useBrand ?? true) && hasBrandMark && kit?.logo_on_photos);
  const reelLogo: ReelLogo = {
    show: project?.reelLogo?.show ?? Boolean(kit?.logo_on_photos),
    corner: project?.reelLogo?.corner || ((REEL_CORNERS as readonly string[]).includes(String(kit?.logo_position)) ? (kit?.logo_position as ReelLogo["corner"]) : "bottom-right"),
    size: project?.reelLogo?.size || "m",
    endCard: project?.reelLogo?.endCard ?? true,
    plate: project?.reelLogo?.plate ?? true,
  };
  // A logo, or the business name set in their font: only then is there anything to put on the Reel.
  const reelHasMark = !isImage && project?.useBrand !== false && Boolean(reelMark);
  const reelBrandOff = !isImage && project?.useBrand === false;
  const reelMarkLoading = !reelHasMark && !reelBrandOff && Boolean(kit?.logo_url || kit?.business_name) && reelMarkChecked === "";
  // The end card also works with just the business name.
  const reelCanEndCard = !isImage && !reelBrandOff && Boolean(kit?.logo_url || kit?.business_name);
  const recordedVoice = [project?.voice?.voiceId, project?.voice?.voice].find((name) => (VOICE_CHOICES as readonly string[]).includes(String(name)));
  const voiceName = recordedVoice ? t(`studio.voice_${recordedVoice}`) : asText(project?.voice?.voicePreset || project?.voice?.voice);
  const reelLangIsUk = (() => {
    const kinds = (project?.script?.scenes || []).flatMap((sc) => [sc.voiceover, sc.onScreen]).map((line) => lineLanguage(String(line || "")));
    const uk = kinds.filter((kind) => kind === "uk").length;
    const en = kinds.filter((kind) => kind === "en").length;
    if (uk || en) return uk >= en;
    const text = (project?.script?.scenes || []).map((sc) => sc.voiceover).join(" ");
    return (text.match(/[\u0400-\u04FF]/g) || []).length >= (text.match(/[A-Za-z]/g) || []).length;
  })();
  const sceneNumber = (sceneId: number) => Math.max(0, project?.script?.scenes.findIndex((sc) => sc.id === sceneId) ?? 0) + 1;
  const VIDEO_UPDATES = ["remake", "reel-logo", "caption-style", "reel-titles", "music", "music-off", "captions-on", "captions-off", "edit-captions"];
  // Changes to a finished Reel after which the server makes the video again (or takes it down when a new voice is needed).
  const touchesVideo = (key: string) =>
    VIDEO_UPDATES.includes(key) || ["edit-script", "voice-on", "voice-off", "lang-en", "lang-uk"].includes(key) || key.startsWith("restore-");
  function busyText(key: string | null) {
    if (!key) return "";
    const frame = /^visual-(\d+)$/.exec(key);
    if (frame) return t(project?.hasVideo && !isImage ? "studio.busyFrameVideo" : "studio.busyFrame", { n: sceneNumber(Number(frame[1])) });
    if (key === "visuals") return t(isImage ? "studio.busyPicture" : "studio.busyFrames");
    if (key === "render") return t("studio.busyRender");
    if (key === "voice") return t("studio.busyVoice");
    if (key === "captions") return t("studio.busyCaptions");
    if (key === "idea" || key === "script") return t("studio.busyText");
    if (key === "lang-en" || key === "lang-uk") return t(project?.hasVideo && !isImage ? "studio.busyTranslateVideo" : "studio.busyTranslate");
    if (!isImage && project?.hasVideo && VIDEO_UPDATES.includes(key)) return t("studio.busyVideo");
    if (!isImage && project?.hasVideo && touchesVideo(key)) return t("studio.busySaveVideo");
    return "";
  }
  function doneText(key: string) {
    if (key === "render") return t("studio.doneRender");
    // Whatever the change, a video that was there and is gone now is always said out loud.
    if (!isImage && videoAtStart.current && !project?.hasVideo) return t("studio.doneVideoDown");
    const frame = /^visual-(\d+)$/.exec(key);
    if (frame) return t(project?.hasVideo && !isImage ? "studio.doneFrameVideo" : "studio.doneFrame", { n: sceneNumber(Number(frame[1])) });
    if (!isImage && touchesVideo(key) && videoAtStart.current) return t("studio.doneVideo");
    return "";
  }
  const busyNote = busyText(busy);
  const elapsed = busyNote ? Math.max(busyTick, Math.floor((Date.now() - busySince) / 1000)) : 0;
  const elapsedLabel =
    elapsed < 60 ? t("studio.elapsedSec", { s: elapsed }) : t("studio.elapsedMin", { m: Math.floor(elapsed / 60), s: String(elapsed % 60).padStart(2, "0") });
  // The phone shows what the video will: with a voice, the scene's headline at the top and the caption line that
  // starts in that scene at the bottom; without a voice, the scene's words are the caption.
  const sceneCount = Math.max(1, project?.script?.scenes?.length || 1);
  const sceneLen = Math.max(3, Math.round((project?.script?.durationSec || 30) / sceneCount));
  const allCues = project?.captions?.cues || [];
  const sceneCue = allCues.some((cue) => Number.isInteger(cue.scene))
    ? allCues.find((cue) => cue.scene === scene)
    : allCues.find((cue) => cue.start >= scene * sceneLen - 0.05 && cue.start < (scene + 1) * sceneLen);
  const reelTitles = { show: true, style: "clean" as const, size: "m" as const, ...project?.reelTitles };
  const sceneTitle = !isImage && !project?.voiceOff && reelTitles.show ? readableLine(project?.script?.scenes?.[scene]?.onScreen || "") : "";
  const caption = readableLine(
    project?.voiceOff
      ? project?.script?.scenes?.[scene]?.onScreen || project?.idea?.title || ""
      : sceneCue?.text || project?.script?.scenes?.[scene]?.voiceover?.split(/(?<=[.!?…])\s/)[0] || project?.idea?.title || ""
  );

  async function execute(
    step: string,
    regenerate = false,
    sceneId?: number,
    feedback?: { reason?: string; note?: string },
    evictOldest = false,
    extra?: { pictureLanguage?: string; keepStill?: boolean; keepStillVersionId?: string; copyEdit?: string; copyEditImage?: string; reformat?: string }
  ) {
    if (!id) return false;
    setBusy(sceneId ? `visual-${sceneId}` : step);
    setError("");
    let ok = false;
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
      ok = true;
    } catch (err) {
      if (!evictOldest && step === "render" && err instanceof ApiError && err.code === "archive_full") {
        const oldest = archive?.oldestPrompt || t("studio.oldestReel");
        const evict = window.confirm(t("studio.confirmArchive", { limit: archive?.limit ?? 10, oldest }));
        if (evict) {
          setBusy(null);
          return execute(step, regenerate, sceneId, feedback, true);
        }
      }
      const refunded = err instanceof ApiError && err.code === "credits_refunded";
      setError(`${err instanceof Error ? te(err.message) : t("studio.failStep")}${refunded ? ` ${t("studio.creditsBack")}` : ""}`);
      if (refunded) refreshMe();
    } finally {
      setBusy(null);
    }
    return ok;
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

  /** A new Reel from this idea or script version; this one stays as it is. */
  async function forkFrom(step: "idea" | "script", versionId: string) {
    if (!id) return;
    if (!window.confirm(t("studio.forkConfirm", { video: STEPS.find((s) => s.id === "render")?.cost ?? 55 }))) return;
    setBusy("fork");
    setError("");
    try {
      const { project: copy } = await api.forkReel(id, step, versionId);
      setViewStep(null);
      navigate(`/app/studio/${copy.id}`);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("studio.failStep"));
    } finally {
      setBusy(null);
    }
  }

  async function remakeVideo() {
    if (!id) return;
    setBusy("remake");
    setError("");
    try {
      const { project: nextProject } = await api.remakeVideo(id);
      setProject(nextProject);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("studio.failStep"));
    } finally {
      setBusy(null);
    }
  }

  async function pickVoice(voice: VoiceChoice) {
    if (!id || !project || project.voiceChoice === voice) return;
    setError("");
    try {
      const { project: nextProject } = await api.setVoiceChoice(id, voice);
      setProject(nextProject);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("studio.failStep"));
    }
  }

  async function saveCaptionStyle(style: "clean" | "box" | "brand") {
    if (!id || !project || (project.captionStyle || "clean") === style) return;
    setBusy("caption-style");
    setError("");
    try {
      const { project: nextProject } = await api.updateCaptionStyle(id, style);
      setProject(nextProject);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("studio.failStep"));
    } finally {
      setBusy(null);
    }
  }

  async function saveReelTitles(change: Partial<ReelTitles>) {
    if (!id || !project) return;
    setBusy("reel-titles");
    setError("");
    try {
      const { project: nextProject } = await api.updateReelTitles(id, change);
      setProject(nextProject);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("studio.failStep"));
    } finally {
      setBusy(null);
    }
  }

  async function saveReelLogo(change: Partial<ReelLogo>) {
    if (!id || !project) return;
    setBusy("reel-logo");
    setError("");
    try {
      const { project: nextProject } = await api.updateReelLogo(id, { ...reelLogo, ...change });
      setProject(nextProject);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("studio.failStep"));
    } finally {
      setBusy(null);
    }
  }

  async function translateReel(lang: "en" | "uk") {
    if (!id || !project?.script) return;
    const translateRedo = translateCost(lang);
    const translateVideoNote = project.hasVideo && project.audioUrl && !project.voiceOff ? t("studio.videoDownNote") : "";
    if (translateRedo.total > 0 && !window.confirm(t("studio.reelLangConfirm", { list: translateRedo.list, total: translateRedo.total, videoNote: translateVideoNote }))) return;
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

  /** What saving the draft leaves to redo — new frames for changed wishes, a voice and its captions for new words. */
  function draftPlan() {
    const empty = { voiceChanged: false, wordsChanged: false, frameIds: [] as number[], list: "", total: 0, voiceRedo: null as null | { list: string; total: number } };
    if (!project?.script || !scriptDraft) return empty;
    const was = (sceneId: number) => project.script?.scenes.find((x) => x.id === sceneId);
    const voiceChanged = scriptDraft.scenes.some((sc) => sc.voiceover.trim() !== (was(sc.id)?.voiceover || "").trim());
    const wordsChanged =
      voiceChanged ||
      scriptDraft.cta.trim() !== (project.script.cta || "").trim() ||
      scriptDraft.scenes.some((sc) => sc.onScreen.trim() !== (was(sc.id)?.onScreen || "").trim());
    const frameIds = scriptDraft.scenes
      .filter((sc) => sc.frameWish.trim() !== (was(sc.id)?.frameWish || "").trim())
      .map((sc) => sc.id)
      .filter((sceneId) => project.visuals?.some((v) => v.sceneId === sceneId));
    const parts: string[] = [];
    let total = 0;
    for (const sceneId of frameIds) {
      const n = extraPrice("visuals", sceneId).credits;
      parts.push(t("studio.redoFrameN", { n: sceneNumber(sceneId), credits: n }));
      total += n;
    }
    const voiceRedo = voiceChanged && project.audioUrl && !project.voiceOff ? redoCost({ voice: true, captions: true, video: true }) : null;
    if (voiceRedo?.total) {
      parts.push(voiceRedo.list);
      total += voiceRedo.total;
    }
    return { voiceChanged, wordsChanged, frameIds, list: parts.join(", "), total, voiceRedo };
  }

  /** Save the script; with `update`, also make again what the change needs (frames, voice, captions), then the video. */
  async function saveScriptDraft(update = false) {
    if (!id || !project?.script || !scriptDraft) return;
    const plan = draftPlan();
    if (
      !update &&
      plan.wordsChanged &&
      plan.voiceRedo?.total &&
      !window.confirm(t("studio.scriptEditVoiceConfirm", { ...plan.voiceRedo, videoNote: project.hasVideo ? t("studio.videoDownNote") : "" }))
    )
      return;
    const hadVoice = Boolean(project.audioUrl) && !project.voiceOff;
    const hadCaptions = Boolean(project.captions) && !project.captionsOff;
    const hadVideo = Boolean(project.hasVideo || project.renderPaid);
    setBusy("edit-script");
    setError("");
    let saved: Project | null = null;
    try {
      const { project: nextProject } = await api.editScript(id, scriptDraft);
      setScriptDraft(null);
      setProject(nextProject);
      saved = nextProject;
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("studio.failStep"));
    } finally {
      setBusy(null);
    }
    if (!saved) return;
    if (!update) {
      setWishRedo(plan.frameIds);
      return;
    }
    setViewStep(null);
    for (const sceneId of plan.frameIds) {
      if (!(await execute("visuals", true, sceneId))) return;
    }
    const needVoice = hadVoice && !saved.voiceOff && !saved.audioUrl;
    const needCaptions = !saved.captionsOff && !saved.captions && (needVoice || hadCaptions);
    if (needVoice && !(await execute("voice"))) return;
    if (needCaptions && !(await execute("captions"))) return;
    if (hadVideo && (needVoice || needCaptions || !saved.hasVideo)) await execute("render");
  }


  async function saveCapsDraft() {
    if (!id || !capsDraft) return;
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
    // Back on under a voice: the captions come from the voice again (AI), then the video is made again.
    if (!off && project?.hasVideo && !project.voiceOff && !window.confirm(t("studio.captionsToggleConfirm", { caps: prices.caps }))) return;
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
    const beforeVoiceStep = !project?.visuals?.length;
    if (!off && beforeVoiceStep) {
      /* only the choice is kept; the voice is made (and paid) on its step */
    } else if (!off && project?.voiceTakeSaved) {
      if (!window.confirm(t("studio.voiceBackConfirm"))) return;
    } else if (!off) {
      const parts = [t("studio.redoVoice", { n: prices.voice })];
      let total = prices.voice;
      if (!project?.captionsOff) {
        parts.push(t("studio.redoCaps", { n: prices.caps }));
        total += prices.caps;
      }
      if (!project?.renderPaid && project?.hasVideo) {
        parts.push(t("studio.redoVideo", { n: prices.video }));
        total += prices.video;
      }
      if (!window.confirm(t("studio.voiceOnConfirm", { list: parts.join(", "), total, videoNote: project?.hasVideo ? t("studio.videoDownNote") : "" }))) return;
    }
    if (off && project?.audioUrl && !beforeVoiceStep && !window.confirm(t("studio.voiceOffConfirm"))) return;
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
      const ok = window.confirm(t(step === "render" ? "studio.confirm2xVideo" : "studio.confirm2x", { credits: price.credits }));
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
    const ok = window.confirm(step === "visuals" ? t("studio.restorePicture") : restoreAsk(step, versionId));
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

  const sceneTime = (time: unknown, index?: number) => {
    // With a recorded voice the scenes follow it: show where each one really starts in the video.
    const cues = !project.voiceOff && project.audioUrl ? project.captions?.cues || [] : [];
    if (index != null && cues.length && cues.every((cue) => Number.isInteger(cue.scene))) {
      const first = index === 0 ? 0 : cues.find((cue) => (cue.scene ?? -1) >= index)?.start;
      if (first != null) return t("studio.sceneSec", { time: String(Math.max(0, Math.round(first))) });
    }
    const raw = asText(time).trim();
    return /^\d+(\.\d+)?$/.test(raw) ? t("studio.sceneSec", { time: raw }) : raw;
  };
  const stepNoun = (step: string) => (step === "render" && !isImage ? t("studio.videoNoun") : stepLabel(step).toLowerCase());
  const redoList = (
    <>
      <p className="hint">
        {t("studio.keepFree")}
      </p>
      {STEPS.filter((s) => doneThrough(project, s.id))
        // A switched-off step has nothing to redo (redoing would charge and switch it back on); a finished video has
        // its own free "Update the video".
        .filter((s) => !(s.id === "voice" && project.voiceOff))
        .filter((s) => !(s.id === "captions" && (project.captionsOff || project.voiceOff)))
        .filter((s) => !(s.id === "render" && !isImage && project.hasVideo))
        .map((s) => (
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
              ? t("studio.anotherStep", { label: stepNoun(s.id), credits: extraPrice(s.id).credits })
              : extraPrice(s.id).credits === 0
                ? t("studio.regenStepFree", { label: stepNoun(s.id) })
                : t("studio.regenStep", { label: stepNoun(s.id), credits: extraPrice(s.id).credits })}
        </button>
      ))}
    </>
  );
  const briefFolded = !isImage && Boolean(project.idea) && !briefOpen;
  const stepsNav = (
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
  );

  // Reel settings: set up first (open until the video exists), changed any time after — free.
  const soundCard = (
    <details
      className="edit-block sound-card"
      open={soundOpen ?? !project.hasVideo}
      onToggle={(e) => setSoundOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="edit-block-head">
        <h3>{t("studio.soundTitle")}</h3>
        <p className="hint">
          {[
            reelHasMark ? t(reelLogo.show ? "studio.soundLogoOn" : "studio.soundLogoOff") : "",
            t(project.voiceOff ? "studio.soundVoiceOff" : project.audioUrl ? "studio.soundVoiceOn" : "studio.soundVoiceNot"),
            t(project.captionsOff ? "studio.soundCapsOff" : project.captions ? "studio.soundCapsOn" : "studio.soundCapsNot"),
            !project.voiceOff && !reelTitles.show ? t("studio.soundTitlesOff") : "",
            project.music ? t("studio.soundMusicOn", { name: project.music.name }) : t("studio.soundMusicNot"),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {busyNote && project.hasVideo && (
          <span className="sound-updating" role="status">
            <span className="spinner" aria-hidden />
            {busyNote} <span className="busy-time">{elapsedLabel}</span>
          </span>
        )}
      </summary>
      {!project.hasVideo && <p className="hint sound-setup">{t("studio.soundSetupHint")}</p>}
      <div className="sound-tabs" role="tablist" aria-label={t("studio.soundTitle")}>
        {(
          [
            ["voice", t("studio.tabVoice"), t(project.voiceOff ? "studio.soundVoiceOff" : project.audioUrl ? "studio.soundVoiceOn" : "studio.soundVoiceNot")],
            ["captions", t("studio.tabCaptions"), project.captionsOff ? t("studio.soundCapsOff") : project.captions ? t(`studio.capStyle_${project.captionStyle || "clean"}`) : t("studio.soundCapsNot")],
            ["titles", t("studio.tabTitles"), project.voiceOff ? t("studio.titlesNone") : reelTitles.show ? t(`studio.capStyle_${reelTitles.style}`) : t("studio.titlesHidden")],
            ["logo", t("studio.tabLogo"), reelBrandOff || !reelHasMark ? t("studio.tabLogoNone") : reelLogo.show ? t(`studio.reelCorner_${reelLogo.corner.replace("-", "_")}`) : t("studio.soundLogoOff")],
            ["music", t("studio.tabMusic"), project.music ? project.music.name : t("studio.soundMusicNot")],
          ] as const
        ).map(([key, label, state]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={soundTab === key}
            className={`sound-tab${soundTab === key ? " on" : ""}`}
            onClick={() => setSoundTab(key)}
          >
            <span>{label}</span>
            <small>{state}</small>
          </button>
        ))}
      </div>
      <div className="sound-pane" role="tabpanel">
        {soundTab === "captions" && (
          <>
      {project.captionsOff && (
        <div className="voice-off-note">
          <p className="hint" style={{ margin: 0 }}>{t("studio.captionsOffNow")}</p>
          <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => toggleCaptions(false)}>
            {busy === "captions-on" ? t("studio.reelLogoSaving") : t("studio.captionsOn")}
          </button>
        </div>
      )}
      {!project.captionsOff && !project.captions && next?.id !== "captions" && (
        <div className="voice-off-note">
          <p className="hint" style={{ margin: 0 }}>{t(project.voiceOff ? "studio.captionsLaterNoVoice" : "studio.captionsLater", { caps: prices.caps })}</p>
          <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => toggleCaptions(true)}>
            {busy === "captions-off" ? t("studio.reelLogoSaving") : t("studio.captionsOff")}
          </button>
        </div>
      )}
      {!project.captionsOff && project.captions && project.hasVideo && (
        <div className="voice-off-note">
          <p className="hint" style={{ margin: 0 }}>{t("studio.captionsOnNow")}</p>
          <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => toggleCaptions(true)}>
            {busy === "captions-off" ? t("studio.reelLogoSaving") : t("studio.captionsRemove")}
          </button>
        </div>
      )}
    {!project.captionsOff && (
      <div className="music-block">
        <p className="pane-title">{t("studio.capStyleTitle")}</p>
        <div className="pill-row" role="group" aria-label={t("studio.capStyleTitle")}>
          {(["clean", "box", ...(!reelBrandOff && kit ? ["brand"] : [])] as ("clean" | "box" | "brand")[]).map((style) => (
            <button
              key={style}
              type="button"
              className={`btn ghost tiny${(project.captionStyle || "clean") === style ? " on" : ""}`}
              aria-pressed={(project.captionStyle || "clean") === style}
              disabled={Boolean(busy)}
              onClick={() => saveCaptionStyle(style)}
            >
              {t(`studio.capStyle_${style}`)}
            </button>
          ))}
        </div>
        <p className="hint" style={{ margin: 0 }}>
          {busy === "caption-style" ? t("studio.reelLogoSaving") : t(project.hasVideo ? "studio.capStyleFreeNow" : "studio.capStyleLater")}
        </p>
      </div>
    )}
          </>
        )}
        {soundTab === "titles" && (
          <>
            {project.voiceOff ? (
              <p className="hint" style={{ margin: 0 }}>{t("studio.titlesNoVoice")}</p>
            ) : (
              <div className="music-block">
                <p className="hint" style={{ margin: 0 }}>{t("studio.titlesWhat")}</p>
                <div className="pill-row" role="group" aria-label={t("studio.tabTitles")}>
                  {([true, false] as const).map((show) => (
                    <button
                      key={String(show)}
                      type="button"
                      className={`btn ghost tiny${reelTitles.show === show ? " on" : ""}`}
                      aria-pressed={reelTitles.show === show}
                      disabled={Boolean(busy)}
                      onClick={() => saveReelTitles({ show })}
                    >
                      {t(show ? "studio.titlesShow" : "studio.titlesHide")}
                    </button>
                  ))}
                </div>
                {reelTitles.show && (
                  <>
                    <p className="pane-title">{t("studio.titlesLook")}</p>
                    <div className="pill-row" role="group" aria-label={t("studio.titlesLook")}>
                      {(["clean", "box", ...(!reelBrandOff && kit ? ["brand"] : [])] as ("clean" | "box" | "brand")[]).map((style) => (
                        <button
                          key={style}
                          type="button"
                          className={`btn ghost tiny${reelTitles.style === style ? " on" : ""}`}
                          aria-pressed={reelTitles.style === style}
                          disabled={Boolean(busy)}
                          onClick={() => saveReelTitles({ style })}
                        >
                          {t(`studio.capStyle_${style}`)}
                        </button>
                      ))}
                    </div>
                    <p className="pane-title">{t("studio.titlesSize")}</p>
                    <div className="pill-row" role="group" aria-label={t("studio.titlesSize")}>
                      {(["s", "m", "l"] as const).map((size) => (
                        <button
                          key={size}
                          type="button"
                          className={`btn ghost tiny${reelTitles.size === size ? " on" : ""}`}
                          aria-pressed={reelTitles.size === size}
                          disabled={Boolean(busy)}
                          onClick={() => saveReelTitles({ size })}
                        >
                          {t(`studio.titlesSize_${size}`)}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <p className="hint" style={{ margin: 0 }}>
                  {busy === "reel-titles" ? t("studio.reelLogoSaving") : t(project.hasVideo ? "studio.capStyleFreeNow" : "studio.titlesLater")}
                </p>
              </div>
            )}
          </>
        )}
        {soundTab === "logo" && (
    <div className="music-block">
      <p className="music-title">{t("studio.reelLogoTitle")}</p>
      {reelBrandOff ? (
        <p className="hint" style={{ margin: 0 }}>{t("studio.reelLogoNoBrand")}</p>
      ) : reelMarkLoading ? null : (
        <>
          {!reelHasMark && (
            <p className="hint" style={{ margin: 0 }}>
              {t(reelCanEndCard ? "studio.reelLogoNeedFile" : "studio.reelLogoNeedKit")} <Link to="/app/brand">{t("nav.brand")}</Link>
            </p>
          )}
          {reelHasMark && (
          <>
          <label className="check-row">
            <input type="checkbox" checked={reelLogo.show} disabled={Boolean(busy)} onChange={(e) => saveReelLogo({ show: e.target.checked })} />
            <span>{t("studio.reelLogoShow")}</span>
          </label>
          {reelLogo.show && (
            <>
              <div className="pill-row" role="group" aria-label={t("studio.reelLogoWhere")}>
                <span className="hint">{t("studio.reelLogoWhere")}</span>
                {REEL_CORNERS.map((corner) => (
                  <button
                    key={corner}
                    type="button"
                    className={`btn ghost tiny${reelLogo.corner === corner ? " on" : ""}`}
                    aria-pressed={reelLogo.corner === corner}
                    disabled={Boolean(busy)}
                    onClick={() => saveReelLogo({ corner })}
                  >
                    {t(`studio.reelCorner_${corner.replace("-", "_")}`)}
                  </button>
                ))}
              </div>
              <div className="pill-row" role="group" aria-label={t("studio.reelLogoSize")}>
                <span className="hint">{t("studio.reelLogoSize")}</span>
                {(["s", "m", "l"] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={`btn ghost tiny${reelLogo.size === size ? " on" : ""}`}
                    aria-pressed={reelLogo.size === size}
                    disabled={Boolean(busy)}
                    onClick={() => saveReelLogo({ size })}
                  >
                    {t(`studio.reelLogoSize_${size}`)}
                  </button>
                ))}
              </div>
              {Boolean(kit?.logo_url) && (
                <>
                  <label className="check-row">
                    <input type="checkbox" checked={reelLogo.plate} disabled={Boolean(busy)} onChange={(e) => saveReelLogo({ plate: e.target.checked })} />
                    <span>{t("studio.reelLogoPlate")}</span>
                  </label>
                  <p className="hint" style={{ margin: 0 }}>{t("studio.reelLogoPlateHint")}</p>
                </>
              )}
            </>
          )}
          </>
          )}
          {reelCanEndCard && (
            <>
              <label className="check-row">
                <input type="checkbox" checked={reelLogo.endCard} disabled={Boolean(busy)} onChange={(e) => saveReelLogo({ endCard: e.target.checked })} />
                <span>{t(reelHasMark ? "studio.reelEndCard" : "studio.reelEndCardName")}</span>
              </label>
              <p className="hint" style={{ margin: 0 }}>
                {busy === "reel-logo" ? t("studio.reelLogoSaving") : t(project.hasVideo ? "studio.reelLogoFreeNow" : "studio.reelLogoLater")}
              </p>
            </>
          )}
        </>
      )}
    </div>
        )}
        {soundTab === "music" && (
    <div className="music-block">
      <p className="music-title">{t("studio.musicTitle")}</p>
      {!project.music ? (
        <>
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
          <p className="hint" style={{ margin: 0 }}>{t("studio.musicFiles")}</p>
          <details className="ready-more">
            <summary>{t("studio.musicMore")}</summary>
            <p className="hint">{t("studio.musicHowItSounds")}</p>
          </details>
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
        {soundTab === "voice" && (
          <>
      {project.voiceOff && (
        <div className="voice-off-note">
          <p className="hint" style={{ margin: 0 }}>{t("studio.voiceOffNow")}</p>
          <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => toggleVoice(false)}>
            {busy === "voice-on" ? t("studio.voiceOffSaving") : t(project.voiceTakeSaved ? "studio.voiceBack" : "studio.voiceOn")}
          </button>
        </div>
      )}
            {!project.voiceOff && project.audioUrl && (
              <>
                <p className="hint" style={{ margin: 0 }}>{t("studio.voiceRecorded")}</p>
                {audioSrc && next?.id !== "captions" && <audio controls src={audioSrc} style={{ width: "100%" }} />}
                <p className="pane-title">{t("studio.voicePick")}</p>
                <VoicePicker value={project.voiceChoice || VOICE_CHOICES[0]} onPick={pickVoice} disabled={Boolean(busy)} lang={reelLangIsUk ? "uk" : "en"} t={t} />
                <div className="voice-off-note">
                  <p className="hint" style={{ margin: 0 }}>{t("studio.voiceOffHere")}</p>
                  <button type="button" className="btn ghost" disabled={Boolean(busy) || Boolean(pendingRegen)} onClick={() => toggleVoice(true)}>
                    {busy === "voice-off" ? t("studio.voiceOffSaving") : t("studio.voiceOffDo")}
                  </button>
                </div>
                {(project.voice?.voiceId || VOICE_CHOICES[0]) !== (project.voiceChoice || VOICE_CHOICES[0]) && (
                  <div className="voice-off-note">
                    <p className="hint" style={{ margin: 0 }}>{t("studio.voiceOtherPicked")}</p>
                    <button type="button" className="btn ghost" disabled={Boolean(busy) || Boolean(pendingRegen)} onClick={() => run("voice", true)}>
                      {t("studio.voiceRecordAgain", { credits: extraPrice("voice").credits })}
                    </button>
                  </div>
                )}
              </>
            )}
            {!project.voiceOff && !project.audioUrl && next?.id === "voice" && (
              <p className="hint" style={{ margin: 0 }}>{t("studio.voicePickBelow")}</p>
            )}
            {!project.voiceOff && !project.audioUrl && next?.id !== "voice" && (
                <>
                  <p className="pane-title">{t("studio.voicePick")}</p>
                  <VoicePicker value={project.voiceChoice || VOICE_CHOICES[0]} onPick={pickVoice} disabled={Boolean(busy)} lang={reelLangIsUk ? "uk" : "en"} t={t} />
                  <p className="hint" style={{ margin: 0 }}>{t("studio.voiceLater", { credits: prices.voice })}</p>
                  <div className="voice-off-note">
                    <p className="hint" style={{ margin: 0 }}>{t("studio.voiceSkipHere")}</p>
                    <button type="button" className="btn ghost" disabled={Boolean(busy) || Boolean(pendingRegen)} onClick={() => toggleVoice(true)}>
                      {busy === "voice-off" ? t("studio.voiceOffSaving") : t("studio.voiceOff")}
                    </button>
                  </div>
                </>
              )}
          </>
        )}
      </div>
      <p className="free-line">
        {t("studio.freeShort")}{" "}
        <button type="button" className="link-btn" onClick={() => setPaidOpen((v) => !v)} aria-expanded={paidOpen}>
          {t(paidOpen ? "studio.paidHide" : "studio.paidShow")}
        </button>
      </p>
      {paidOpen && <p className="hint free-more">{t("studio.paidList", prices)}</p>}
    </details>
  );

  return (
    <div>
      {!isImage && stepsNav}
      {briefFolded ? (
        <div className="brief-line">
          <span className="brief-line-label">{t("studio.briefLabel")}</span>
          <span className="brief-line-text">{project.prompt}</span>
          <button className="btn ghost" type="button" onClick={() => setBriefOpen(true)}>
            {t("studio.briefUnfold")}
          </button>
        </div>
      ) : (
        <>
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
                : t(isImage ? "briefImages.nextTime" : "briefImages.nextTimeReel")
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
            {!isImage && project.idea && (
              <button className="btn ghost" type="button" onClick={() => setBriefOpen(false)}>
                {t("studio.briefFold")}
              </button>
            )}
          </div>
          <BrandToggle
            locked
            value={project.useBrand ?? true}
            ask={t(project.useBrand ?? true ? (isImage ? "studio.brandLockedOn" : "studio.brandLockedOnReel") : isImage ? "studio.brandLockedOff" : "studio.brandLockedOffReel")}
            onLabel={t("studio.useBrandOn")}
            onHint={t("home.useBrandHint")}
            offLabel={t("studio.useBrandOff")}
            offHint={t("home.skipBrandHint")}
            usingLabel={t(isImage ? "studio.brandUsing" : "studio.brandUsingReel")}
            kit={kit}
          />
        </>
      )}
      {error && viewStep && (
        <p className="err" style={{ marginTop: -8, marginBottom: 16 }}>
          {error}
        </p>
      )}
      {isImage && stepsNav}

      <div className={`studio${isImage ? " image" : ""}${!isImage && viewStep ? " reviewing" : ""}`}>
        <div className={isImage ? "studio-preview" : "reel-stage"}>
          <div ref={phoneRef} className={`phone${isImage ? " post" : ""}${isPoster ? " poster" : ""}${isInvite ? " invite" : ""}`} style={{ ...(shapeRatio ? { aspectRatio: shapeRatio } : {}), ...(typeof frame === "string" && frame.startsWith("linear") ? { background: frame } : {}) }}>
            {project.hasVideo && videoSrc ? (
              <>
                <video className="phone-video" src={videoSrc} controls playsInline />
                {busyNote && (
                  <div className="phone-busy" aria-hidden>
                    <span className="spinner" />
                  </div>
                )}
              </>
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
                {!isImage && busyNote && (
                  <div className="phone-busy" aria-hidden>
                    <span className="spinner" />
                  </div>
                )}
                {!isImage && sceneTitle && (
                  <div
                    className={`caption phone-title title-${reelTitles.size} cap-${reelTitles.style}${reelLogo.show && reelHasMark && reelLogo.corner.startsWith("top") ? " under-logo" : ""}`}
                    style={reelTitles.style === "brand" && kit?.primary_color ? ({ "--cap-brand": kit.primary_color, "--cap-ink": hexLight(kit.primary_color) ? "#1a1612" : "#ffffff" } as CSSProperties) : undefined}
                  >
                    <span>{sceneTitle}</span>
                  </div>
                )}
                {!isImage && !project.captionsOff && (
                  <div
                    className={`caption${project.captionsOff ? "" : ` cap-${project.captionStyle || "clean"}`}`}
                    style={project.captionStyle === "brand" && kit?.primary_color ? ({ "--cap-brand": kit.primary_color, "--cap-ink": hexLight(kit.primary_color) ? "#1a1612" : "#ffffff" } as CSSProperties) : undefined}
                  >
                    <span>{caption}</span>
                  </div>
                )}
                {!isImage && reelMark && reelHasMark && reelLogo.show && !project.visuals?.some((v) => v.logoCorner) && <ReelLogoPreview mark={reelMark} logo={reelLogo} plate={Boolean(kit?.logo_url) && reelLogo.plate} />}
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
          {!isImage && project.script && !viewStep && (
            <details
              className="scenes-wrap"
              open={scenesOpen ?? !project.hasVideo}
              onToggle={(e) => setScenesOpen((e.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className="edit-block-head">
                <h3>{t("studio.scenesTitle", { n: project.script.scenes.length })}</h3>
                <p className="hint">{t(project.hasVideo ? "studio.scenesHintVideo" : project.visuals ? "studio.scenesHintFrames" : "studio.scenesHint", prices)}</p>
              </summary>
            <div className="scenes">
              {project.script.scenes.map((s, i) => (
                <div key={s.id} className={`scene${scene === i ? " on" : ""}`}>
                  <button className="scene-pick" onClick={() => setScene(i)}>
                    <b>{sceneTime(s.time, i)}</b>
                    <span>{readableLine(isImage ? s.onScreen : s.voiceover)}</span>
                  </button>
                  {project.visuals && (
                    <div className="scene-actions">
                      {project.visuals.find((v) => v.sceneId === s.id)?.placeholder && (
                        <p className="hint">{t("studio.placeholderFail")}</p>
                      )}
                      <button
                        className="btn ghost tiny"
                        disabled={Boolean(busy) || Boolean(pendingRegen)}
                        onClick={() => run("visuals", true, s.id)}
                      >
                        {busy === `visual-${s.id}`
                          ? t(project.hasVideo ? "studio.reshootVideo" : "studio.makingShort")
                          : t(extraPrice("visuals", s.id).extra ? "studio.regenFrame2x" : "studio.regenFrame", { credits: extraPrice("visuals", s.id).credits })}
                      </button>
                      {[...(project.versions?.visuals || [])].reverse().find((version) => !version.accepted) && (
                        <button
                          className="btn ghost tiny"
                          disabled={Boolean(busy) || Boolean(pendingRegen)}
                          onClick={() => {
                            const previous = [...(project.versions?.visuals || [])].reverse().find((version) => !version.accepted);
                            if (previous) restore("visuals", previous.id, s.id);
                          }}
                        >
                          {busy === `restore-visual-${s.id}` ? t("studio.restoring") : t("studio.prevFrameFree")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            </details>
          )}
        </div>

        {viewStep && (
          <div className="panel step-review">
            <div className="review-head">
              <button type="button" className="btn ghost step-back" onClick={() => setViewStep(null)}>
                {next ? t("studio.reviewBack", { label: stepLabel(next.id) }) : t("studio.reviewBackDone")}
              </button>
              <h2>{t("studio.reviewTitle", { label: stepLabel(viewStep) })}</h2>
              <p className="hint">
                {t(
                  viewStep === "script" || viewStep === "captions"
                    ? "studio.reviewHintEdit"
                    : viewStep === "visuals" && !isImage
                      ? project.hasVideo
                        ? "studio.reviewHintFramesVideo"
                        : "studio.reviewHintFrames"
                      : "studio.reviewHint"
                )}
              </p>
            </div>
            {viewStep === "idea" && project.idea && (
              <>
                <p><b>{asText(project.idea.title)}</b></p>
                {asText(project.idea.hook) && <p>{asText(project.idea.hook)}</p>}
                <p className="lede">{asText(project.idea.concept)}</p>
                {asText(project.idea.shot?.summary) && <p className="hint">{asText(project.idea.shot?.summary)}</p>}
                <VersionCompare step="idea" versions={project.versions?.idea || []} onRestore={restore} onFork={isImage ? undefined : forkFrom} busy={Boolean(busy)} t={t} />
              </>
            )}
            {viewStep === "script" && project.script && scriptDraft && (
              <div className="draft-editor">
                {scriptDraft.scenes.map((sc, i) => (
                  <fieldset key={sc.id} className="draft-scene">
                    <legend className="hint">{t("studio.reviewScene", { n: i + 1 })}</legend>
                    <label className="shot-field">
                      <span>{t("studio.scriptOnScreen")}</span>
                      {i === 0 && <span className="field-note">{t(project.voiceOff ? "studio.onScreenNoteNoVoice" : "studio.onScreenNote")}</span>}
                      <input
                        value={sc.onScreen}
                        maxLength={120}
                        onChange={(e) => setScriptDraft({ ...scriptDraft, scenes: scriptDraft.scenes.map((x) => (x.id === sc.id ? { ...x, onScreen: e.target.value } : x)) })}
                      />
                    </label>
                    <label className="shot-field">
                      <span>{t("studio.scriptVoiceover")}</span>
                      {i === 0 && <span className="field-note">{t(project.voiceOff ? "studio.voiceoverNoteNoVoice" : "studio.voiceoverNote")}</span>}
                      <textarea
                        rows={2}
                        value={sc.voiceover}
                        maxLength={400}
                        onChange={(e) => setScriptDraft({ ...scriptDraft, scenes: scriptDraft.scenes.map((x) => (x.id === sc.id ? { ...x, voiceover: e.target.value } : x)) })}
                      />
                    </label>
                    <label className="shot-field">
                      <span>{t("studio.frameWish")}</span>
                      <textarea
                        rows={2}
                        value={sc.frameWish}
                        maxLength={300}
                        placeholder={t("studio.frameWishPlaceholder")}
                        onChange={(e) => setScriptDraft({ ...scriptDraft, scenes: scriptDraft.scenes.map((x) => (x.id === sc.id ? { ...x, frameWish: e.target.value } : x)) })}
                      />
                    </label>
                  </fieldset>
                ))}
                <label className="shot-field">
                  <span className="field-head">
                    {t("studio.scriptCta")}
                    <span className={`char-count${scriptDraft.cta.length > CTA_MAX ? " over" : ""}`}>
                      {scriptDraft.cta.length}/{CTA_MAX}
                    </span>
                  </span>
                  <input
                    value={scriptDraft.cta}
                    maxLength={Math.max(CTA_MAX, (project.script?.cta || "").length)}
                    onChange={(e) => setScriptDraft({ ...scriptDraft, cta: e.target.value })}
                  />
                  <span className="hint">{t(
                      scriptDraft.cta.length <= CTA_MAX
                        ? "studio.ctaHint"
                        : scriptDraft.cta.trim() === (project.script?.cta || "").trim()
                          ? "studio.ctaOld"
                          : "studio.ctaTooLong",
                      { max: CTA_MAX }
                    )}</span>
                </label>
                {(() => {
                  const plan = draftPlan();
                  return plan.voiceChanged && project.audioUrl && !project.voiceOff ? (
                    <div className="voice-warn" role="note">
                      {t(project.hasVideo ? "studio.voiceTextWarnVideo" : "studio.voiceTextWarn", { voice: prices.voice, caps: prices.caps })}
                    </div>
                  ) : null;
                })()}
                <p className="hint">{t("studio.scriptEditHint", prices)}</p>
                <div className="action-row">
                  {(() => {
                    const plan = draftPlan();
                    const blocked = Boolean(busy) || (scriptDraft.cta.length > CTA_MAX && scriptDraft.cta.trim() !== (project.script?.cta || "").trim());
                    return plan.total > 0 ? (
                      <>
                        <button type="button" className="btn accent" disabled={blocked} onClick={() => saveScriptDraft(true)}>
                          {busy === "edit-script" ? t("studio.voiceOffSaving") : t("studio.saveAndUpdate", { list: plan.list, total: plan.total })}
                        </button>
                        <button type="button" className="btn" disabled={blocked} onClick={() => saveScriptDraft(false)}>
                          {t("studio.saveOnly")}
                        </button>
                      </>
                    ) : (
                      <button type="button" className="btn" disabled={blocked} onClick={() => saveScriptDraft(false)}>
                        {busy === "edit-script" ? t("studio.voiceOffSaving") : t("studio.editSave")}
                      </button>
                    );
                  })()}
                  <button type="button" className="btn ghost" disabled={Boolean(busy)} onClick={() => setScriptDraft(null)}>
                    {t("studio.placeCancel")}
                  </button>
                </div>
              </div>
            )}
            {viewStep === "script" && project.script && !scriptDraft && (
              <>
                {wishRedo.length > 0 && (
                  <div className="voice-off-note">
                    <p className="hint" style={{ margin: 0 }}>{t(project.hasVideo ? "studio.wishRedoVideo" : "studio.wishRedo")}</p>
                    <div className="pill-row">
                      {wishRedo.map((sceneId) => {
                        const at = Math.max(0, project.script?.scenes.findIndex((sc) => sc.id === sceneId) ?? 0);
                        return (
                          <button
                            key={sceneId}
                            type="button"
                            className="btn ghost tiny"
                            disabled={Boolean(busy) || Boolean(pendingRegen)}
                            onClick={() => {
                              setScene(at);
                              setViewStep(null);
                              run("visuals", true, sceneId);
                            }}
                          >
                            {t("studio.wishRedoScene", { n: at + 1, credits: extraPrice("visuals", sceneId).credits })}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="review-tools">
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      setScriptDraft({
                        cta: project.script?.cta || "",
                        scenes: (project.script?.scenes || []).map((sc) => ({ id: sc.id, onScreen: sc.onScreen || "", voiceover: sc.voiceover || "", frameWish: sc.frameWish || "" })),
                      })
                    }
                  >
                    {t("studio.scriptEdit")}
                  </button>
                  <div className="seg" role="group" aria-label={t("studio.reelLangAsk")}>
                    <span className="hint">{t("studio.reelLangShort")}</span>
                    <button type="button" className="btn ghost" disabled={Boolean(busy)} onClick={() => translateReel("en")}>
                      {busy === "lang-en" ? t("studio.reelLangWorking") : t("studio.reelLangEnShort")}
                    </button>
                    <button type="button" className="btn ghost" disabled={Boolean(busy)} onClick={() => translateReel("uk")}>
                      {busy === "lang-uk" ? t("studio.reelLangWorking") : t("studio.reelLangUkShort")}
                    </button>
                  </div>
                </div>
                <ol className="review-scenes">
                  {project.script.scenes.map((sc, i) => (
                    <li key={sc.id}>
                      <span className="time-chip">{sceneTime(sc.time, i)}</span>
                      <div>
                        {asText(sc.onScreen) && <b>{asText(sc.onScreen)}</b>}
                        {asText(sc.voiceover) && <p className="hint">{asText(sc.voiceover)}</p>}
                        {asText(sc.frameWish) && (
                          <p className="frame-wish">
                            <span>{t("studio.frameWishShort")}</span> {asText(sc.frameWish)}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
                {asText(project.script.cta) && (
                  <p className="review-cta">
                    <span className="hint">{t("studio.scriptCta")}</span>
                    <b>{asText(project.script.cta)}</b>
                  </p>
                )}
                <VersionCompare step="script" versions={project.versions?.script || []} onRestore={restore} onFork={isImage ? undefined : forkFrom} busy={Boolean(busy)} t={t} />
              </>
            )}
            {viewStep === "visuals" &&
              (isImage ? (
                <p className="lede">{t("studio.reviewPicture")}</p>
              ) : (
                <div className="review-frames">
                  {(project.visuals || []).map((v, i) => {
                    const at = Math.max(0, project.script?.scenes.findIndex((sc) => sc.id === v.sceneId) ?? i);
                    return (
                      <figure key={v.sceneId} className={scene === at ? "on" : undefined}>
                        <button type="button" className="review-frame-pick" onClick={() => setScene(at)} aria-label={t("studio.reviewScene", { n: i + 1 })}>
                          {imageSrcs[v.sceneId] ? <img src={imageSrcs[v.sceneId]} alt="" /> : <span className="example-loading" />}
                        </button>
                        <figcaption className="hint">{t("studio.reviewScene", { n: i + 1 })}</figcaption>
                        <button
                          type="button"
                          className="btn ghost tiny"
                          disabled={Boolean(busy) || Boolean(pendingRegen)}
                          onClick={() => {
                            setScene(at);
                            setViewStep(null);
                            run("visuals", true, v.sceneId);
                          }}
                        >
                          {busy === `visual-${v.sceneId}`
                            ? t("studio.makingShort")
                            : t(extraPrice("visuals", v.sceneId).extra ? "studio.regenFrame2x" : "studio.regenFrame", { credits: extraPrice("visuals", v.sceneId).credits })}
                        </button>
                      </figure>
                    );
                  })}
                </div>
              ))}
            {viewStep === "voice" && project.voiceOff && <p className="lede">{t("studio.voiceOffNow")}</p>}
            {viewStep === "voice" && !project.voiceOff && (
              <>
                <p><b>{voiceName}</b></p>
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
                <p className="hint">{t("studio.capsEditHint", prices)}</p>
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
              <ol className="review-scenes">
                {project.captions.cues.map((cue, i) => (
                  <li key={i}>
                    <span className="time-chip">{t("studio.sceneSec", { time: `${cue.start.toFixed(1)}–${cue.end.toFixed(1)}` })}</span>
                    <div>{asText(cue.text)}</div>
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
              <VersionCompare step="idea" versions={project.versions?.idea || []} onRestore={restore} onFork={isImage ? undefined : forkFrom} busy={Boolean(busy)} t={t} />
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
              <VersionCompare step="idea" versions={project.versions?.idea || []} onRestore={restore} onFork={isImage ? undefined : forkFrom} busy={Boolean(busy)} t={t} />
            </>
          )}
          {!isImage && project.script && !project.visuals && (
            <>
              <p className="lede">{t("studio.scriptReady")}</p>
              <VersionCompare step="script" versions={project.versions?.script || []} onRestore={restore} onFork={isImage ? undefined : forkFrom} busy={Boolean(busy)} t={t} />
            </>
          )}
          {!isImage && project.visuals && !project.hasVideo && ((next?.id === "voice" && !project.renderPaid) || placeholderCount > 0) && (
            <p className="lede">
              {placeholderCount
                ? t(placeholderCount === 1 ? "studio.framesFail" : "studio.framesFailMany", { count: placeholderCount })
                : t("studio.framesOk")}
            </p>
          )}
          {project.audioUrl && next?.id === "captions" && (
            <>
              <p><b>{voiceName}</b></p>
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
              <div className="row ready-actions">
                {videoSrc && (
                  <a className="btn" href={videoSrc} download={downloadName(project, t, "mp4")}>
                    {t("studio.downloadMp4")}
                  </a>
                )}
                <button type="button" className="btn ghost tiny" disabled={Boolean(busy)} onClick={remakeVideo} title={t("studio.remakeHint")}>
                  {busy === "remake" ? t("studio.reelLogoSaving") : t("studio.remakeVideo")}
                </button>
              </div>
              <details className="ready-more">
                <summary>{t("studio.readyMore")}</summary>
                <p className="hint">{t("studio.reelReadyFree")}</p>
                <p className="hint">{t("studio.remakeHint")}</p>
                <p className="hint">{t("studio.reelKeep")}</p>
              </details>
              {SHOW_SHARE_AND_PUBLISH && (
                <div className="row" style={{ marginTop: 6 }}>
                  <button className="btn ghost" type="button" onClick={sharePreview}>
                    {shareCopied ? t("studio.shareCopied") : t("studio.share")}
                  </button>
                </div>
              )}
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

          {!isImage && project.renderPaid && !project.hasVideo && finishSteps.length > 0 && !viewStep && (
            <div className="redo-needed" role="status">
              <p className="redo-needed-title">{t("studio.redoNeededTitle")}</p>
              <ul>
                {finishSteps.map((step) => (
                  <li key={step}>
                    {step === "voice"
                      ? t("studio.redoNeededVoice", { n: extraPrice("voice").credits })
                      : step === "captions"
                        ? project.voiceOff
                          ? t("studio.redoNeededCapsFree")
                          : t("studio.redoNeededCaps", { n: extraPrice("captions").credits })
                        : t("studio.redoNeededVideo")}
                  </li>
                ))}
              </ul>
              <button type="button" className="btn accent" disabled={Boolean(busy) || Boolean(pendingRegen)} onClick={finishReel}>
                {finishTotal > 0
                  ? t("studio.finishReel", { list: finishSteps.map((step) => t(step === "render" ? "studio.videoNoun" : step === "voice" ? "studio.voiceNoun" : "studio.captionsNoun")).join(", "), total: finishTotal })
                  : t("studio.finishReelFree")}
              </button>
            </div>
          )}
          {!isImage && next?.id === "voice" && !project.voiceOff && !viewStep && (
            <div className="voice-choose">
              <p className="pane-title">{t("studio.voicePick")}</p>
              <VoicePicker value={project.voiceChoice || VOICE_CHOICES[0]} onPick={pickVoice} disabled={Boolean(busy)} lang={reelLangIsUk ? "uk" : "en"} t={t} />
            </div>
          )}
          {next && !(isImage && next.id === "visuals" && project.idea?.shot?.summary) && (
            <div className="action-row" style={{ marginTop: 18 }}>
              <button
                className={`btn ${!isImage && project.renderPaid && !project.hasVideo && finishSteps.length > 0 ? "ghost" : "accent"}`}
                disabled={Boolean(busy) || Boolean(pendingRegen)}
                onClick={() => run(next.id)}
              >
                {busy && busy === next.id
                  ? makingLabel
                  : next.id === "captions" && project.voiceOff
                    ? t("studio.makeCaptionsFree")
                    : next.id === "render"
                      ? extraPrice("render").credits === 0
                        ? t("studio.makeVideoFree")
                        : t(extraPrice("render").extra ? "studio.makeVideo2x" : "studio.makeVideo", { credits: extraPrice("render").credits })
                      : extraPrice(next.id).extra
                      ? t("studio.makeStep2x", { label: stepObject(next.id), credits: extraPrice(next.id).credits })
                      : t("studio.makeStep", { label: stepObject(next.id), credits: extraPrice(next.id).credits })}
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
          {finishSteps.length > 1 && !viewStep && !(project.renderPaid && !project.hasVideo) && (
            <div className="finish-row">
              <button type="button" className="link-btn" disabled={Boolean(busy) || Boolean(pendingRegen)} onClick={finishReel} title={t("studio.finishHint")}>
                {finishTotal > 0
                  ? t("studio.finishReel", { list: finishSteps.map((step) => t(step === "render" ? "studio.videoNoun" : step === "voice" ? "studio.voiceNoun" : "studio.captionsNoun")).join(", "), total: finishTotal })
                  : t("studio.finishReelFree")}
              </button>
            </div>
          )}
          {!isImage && project.script && !viewStep && (
            <div className={`lang-note${reelLanguagesMixed ? " mixed" : ""}`}>
              <div className="lang-note-row">
                <p className="lang-note-title">
                  <span aria-hidden>🌐</span> {reelLanguagesMixed ? t("studio.reelLangTitle") : t(reelLangIsUk ? "studio.reelLangNowUk" : "studio.reelLangNowEn")}
                </p>
                <div className="lang-note-pills" role="group" aria-label={t("studio.reelLangAsk")}>
                  {(reelLanguagesMixed ? (reelLangIsUk ? (["uk", "en"] as const) : (["en", "uk"] as const)) : ([reelLangIsUk ? "en" : "uk"] as const)).map((lang) => (
                    <button key={lang} type="button" className="btn ghost tiny" disabled={Boolean(busy)} onClick={() => translateReel(lang)}>
                      {busy === `lang-${lang}`
                        ? t("studio.reelLangWorking")
                        : reelLanguagesMixed
                          ? t(lang === "uk" ? "studio.reelLangUk" : "studio.reelLangEn")
                          : t(lang === "uk" ? "studio.reelLangToUk" : "studio.reelLangToEn")}
                    </button>
                  ))}
                </div>
              </div>
              <details className="lang-note-more">
                <summary>{t("studio.reelLangCost")}</summary>
                {(reelLanguagesMixed ? (reelLangIsUk ? (["uk", "en"] as const) : (["en", "uk"] as const)) : ([reelLangIsUk ? "en" : "uk"] as const)).map((lang) => {
                  const cost = translateCost(lang);
                  const text = cost.total > 0 ? t("studio.reelLangMixedPaid", { list: cost.list, total: cost.total }) : t("studio.reelLangMixedShort");
                  return (
                    <p key={lang} className="hint">
                      {reelLanguagesMixed ? `${t(lang === "uk" ? "studio.reelLangUk" : "studio.reelLangEn")}: ${text}` : text}
                    </p>
                  );
                })}
              </details>
            </div>
          )}
          {next?.id === "voice" && <p className="hint" style={{ marginTop: 6 }}>{t("studio.voiceOffHint")}</p>}
          {next?.id === "captions" && <p className="hint" style={{ marginTop: 6 }}>{t("studio.captionsOffHint")}</p>}
          {!isImage && !viewStep && soundCard}
          {pendingRegen && STEP_REASONS[pendingRegen.step] && (
            <div ref={reasonRef} className="reason-box" style={{ marginTop: 16 }}>
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
          {isImage && lastDone && !project.hasImages && !project.hasVideo && (
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
          {STEPS.some((s) => doneThrough(project, s.id)) &&
            (isImage ? (
              <div style={{ marginTop: 18 }}>{redoList}</div>
            ) : (
              <details className="edit-block redo-card">
                <summary className="edit-block-head">
                  <h3>{t("studio.redoTitle")}</h3>
                  <p className="hint">{t("studio.redoHint")}</p>
                </summary>
                {redoList}
              </details>
            ))}
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
          {!(project.hasVideo && !isImage) && (
            <p className="hint" style={{ marginTop: 18 }}>
              {t(isInvite ? "studio.usedInvite" : isImage ? "studio.usedImage" : "studio.usedReel", { credits: project.creditsUsed })}
            </p>
          )}
        </div>
      </div>
      {!busy && pendingRegen && STEP_REASONS[pendingRegen.step] ? (
        <div className="busy-toast wait" role="status" aria-live="polite">
          <span aria-hidden>↑</span>
          <span>
            {pendingRegen.sceneId
              ? t("studio.waitReasonFrame", { n: sceneNumber(pendingRegen.sceneId) })
              : t("studio.waitReason")}
          </span>
        </div>
      ) : busyNote ? (
        <div className="busy-toast" role="status" aria-live="polite">
          <span className="spinner" />
          <span>{busyNote}</span>
          <span className="busy-time">{elapsedLabel}</span>
        </div>
      ) : doneNote ? (
        <div className={`busy-toast done${doneNote === t("studio.doneVideoDown") ? " down" : ""}`} role="status" aria-live="polite">
          <span aria-hidden>{doneNote === t("studio.doneVideoDown") ? "!" : "✓"}</span>
          <span>{doneNote}</span>
        </div>
      ) : null}
    </div>
  );
}
