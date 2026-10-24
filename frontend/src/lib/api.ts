import { currentLocale, translateError } from "../i18n/locale";

const TOKEN = "auteur.token";

export type User = { id: string; email: string; name: string; created_at?: string };
export type Me = {
  user: User;
  credits: number;
  subscription: { plan_id: string; plan_name: string; monthly_credits: number; status: string } | null;
  isAdmin?: boolean;
  emailVerified?: boolean;
};
export type AdminTable = { name: string; total: number; limit: number; offset: number; columns: string[]; rows: Record<string, unknown>[] };

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type LearnedSummary = {
  generatedAt: string;
  basedOnProjects: number;
  avoid?: string[];
  preferredPace?: string;
  preferredVoice?: string;
  visualNotes?: string;
};
export type BrandKitRow = Record<string, string> & {
  learned_summary?: LearnedSummary | null;
  learned_lines?: string[];
  ready?: boolean;
  ready_projects?: number;
  completeness?: { percent: number; hint: string; nextKey?: string };
  tone_note?: string;
  vertical_note?: string;
  logo_on_photos?: boolean;
};
export const VOICE_CHOICES = ["coral", "nova", "sage", "ash", "onyx", "echo"] as const;
export type VoiceChoice = (typeof VOICE_CHOICES)[number];
/** The scenes' on-screen words as headlines at the top of a voiced Reel. */
export type ReelTitles = { show: boolean; style: "clean" | "box" | "brand"; size: "s" | "m" | "l" };

export type ReelLogo = { show: boolean; corner: "top-left" | "top-right" | "bottom-left" | "bottom-right"; size: "s" | "m" | "l"; endCard: boolean; plate: boolean };
/** Our logo placed by hand: left, top and width as fractions of the picture. */
export type LogoBox = { x: number; y: number; w: number };
export type Shot = {
  subject: string;
  place: string;
  angle: string;
  people: string;
  mood: string;
  words: string;
  summary: string;
};
export type Idea = {
  title: string;
  hook: string;
  concept: string;
  audience: string;
  visualDirection: string;
  shot?: Shot;
  shotConfirmed?: boolean;
};
export type InviteItem = {
  time: string;
  title: string;
  detail: string;
};
/** Designed pages: photography and the owner's words as one layout (picture language, word edits). */
export const POSTER_KINDS = ["invite", "info", "offer", "announce", "review", "greeting", "infographic", "launch", "own"] as const;
export function isPosterKind(kind: string | undefined | null) {
  return Boolean(kind && (POSTER_KINDS as readonly string[]).includes(kind));
}
export type CertificateItem = { name: string; gift: string; giftNote: string; validFrom: string; validUntil: string; code: string };
export type CertificateLayout = { x: number; y: number; scale: number };
export type CertificateFont = "brand" | "montserrat" | "playfair" | "cormorant" | "script";
/** Font and colours of the big words; an empty colour means the studio picks it. */
/** Under the words: a soft wash, a plate that reads on any picture, or nothing. */
export type CertificatePanel = "soft" | "plate" | "none";
/** words: print our words on the design (off = the design exactly as it is). */
export type CertificateStyle = { font: CertificateFont; accent: string; ink: string; panel?: CertificatePanel; words?: boolean };
export type CertificateSettings = {
  title: string;
  note: string;
  lang: "uk" | "en";
  codes: boolean;
  /** Where the block of words sits and how big it is; the same for every certificate of the design. */
  layout?: CertificateLayout;
  style?: CertificateStyle;
  /** Whose logo tops the words: the brand kit's, a file for this certificate, or none. */
  logo?: "brand" | "own" | "none";
  /** The design is the owner's own picture, not painted from a brief: no brief or idea to show. */
  ownDesign?: boolean;
  /** The words in the forms were read off the owner's design, which still shows them. */
  readFromDesign?: boolean;
  /** From the server: this certificate has its own logo file / the brand kit (if used) has a logo. */
  /** The selected design (picture take): place, font, colours and logo are saved for it alone. */
  take?: string;
  ownLogo?: boolean;
  brandLogo?: boolean;
  /** Set once the logo is dragged off the words: its own centre and size; null = above the heading. */
  logoLayout?: CertificateLayout | null;
  /** Where each person's logo is (centre and size, shares of the page), from the server; null = no logo prints. */
  logoBoxes?: ({ x: number; y: number; w: number; h: number } | null)[];
  items: CertificateItem[];
  /** Size of each person's block of words (share of the page), from the server — for the drag frame. */
  boxes?: { w: number; h: number }[];
};

export type InviteCard = {
  name: string;
  date: string;
  time: string;
  place: string;
  address?: string;
  intro?: string;
  closing?: string;
  lines?: string[];
  program?: InviteItem[];
};
export type ScriptScene = {
  id: number;
  time: string;
  onScreen: string;
  voiceover: string;
  visualPrompt: string;
  /** The owner's own words for what the frame shows. */
  frameWish?: string;
};
export type ArchiveState = {
  used: number;
  limit: number;
  planId: string;
  atLimit: boolean;
  oldestId: string | null;
  oldestPrompt: string | null;
};
export const SHAPE_RATIO: Record<string, string> = {
  square: "1 / 1",
  portrait: "4 / 5",
  portrait34: "3 / 4",
  a5: "1414 / 1000",
  a5p: "1000 / 1414",
  story: "9 / 16",
  wide: "191 / 100",
  tall: "2 / 3",
};

export type Project = {
  id: string;
  type: string;
  prompt: string;
  imageIntent?: string;
  pictureLanguage?: "en" | "uk" | "";
  useBrand?: boolean;
  imageFormat?: "square" | "portrait" | "portrait34" | "story" | "wide" | "a5" | "tall" | "";
  refs?: { id: string; url: string }[];
  invite?: InviteCard | null;
  certificate?: CertificateSettings | null;
  status: string;
  currentStep: string;
  idea: Idea | null;
  script: { durationSec: number; cta: string; scenes: ScriptScene[] } | null;
  visuals: { sceneId: number; imageUrl: string; prompt: string; placeholder?: boolean; clean?: string; logoCorner?: string; logoBox?: LogoBox }[] | null;
  voice: { voicePreset?: string; voice: string; voiceId?: string; script: string; notes: string } | null;
  /** Which voice reads this Reel next time it is recorded. */
  voiceChoice?: VoiceChoice;
  captions: { cues: { start: number; end: number; text: string; scene?: number }[] } | null;
  audioUrl: string | null;
  outputUrl: string | null;
  hasVideo: boolean;
  /** Reel made without a voiceover: captions are the on-screen words, the video has a quiet track. */
  voiceOff?: boolean;
  voiceTakeSaved?: boolean;
  /** Reel made without burned-in captions. */
  captionsOff?: boolean;
  /** The owner's own track under the Reel: volume 0–100, starts from `start` seconds of the track. */
  music?: { name: string; durationSec: number; volume: number; start: number } | null;
  /** Changes when the video file is replaced, so the player loads it again. */
  videoStamp?: number;
  /** Logo over the Reel and the end card; null until the owner changes it (the Brand Kit decides). */
  reelLogo?: Partial<ReelLogo> | null;
  /** The video was paid once on this Reel: making it again is free. */
  renderPaid?: boolean;
  /** How burned-in captions look on the Reel. */
  captionStyle?: "clean" | "box" | "brand";
  reelTitles?: ReelTitles;
  hasImages: boolean;
  creditsUsed: number;
  stepAttempts: Record<string, number>;
  /** Tries of each frame (by scene id): the set it came in plus each redo of that frame. */
  frameAttempts?: Record<string, number>;
  maxStepAttempts: number;
  maxRegenerates: number;
  extraAttemptMultiplier: number;
  runningStep: string | null;
  feedback: { publishable: string; reasons: string[] } | null;
  versions: {
    idea: StepVersion<Idea>[];
    script: StepVersion<{ durationSec: number; cta: string; scenes: ScriptScene[] }>[];
    visuals?: (StepVersion<{ sceneId: number; imageUrl: string; prompt: string; placeholder?: boolean; clean?: string; logoCorner?: string; logoBox?: LogoBox }[]> & {
      ourLogo?: boolean;
      shape?: string;
    })[];
  };
  previewUrl: string | null;
  previewExpiresAt: string | null;
  createdAt: string;
  updatedAt?: string;
};
/** What comes back free with this version: its script (for an idea), its frames, a voice for its words and its captions. */
export type VersionKeeps = { script?: boolean; frames: boolean; voice: boolean; captions: boolean };
export type StepVersion<T> = { id: string; accepted: boolean; createdAt: string; payload: T | null; keeps?: VersionKeeps };

function localeHeaders(extra?: HeadersInit): HeadersInit {
  const token = localStorage.getItem(TOKEN);
  const locale = currentLocale();
  return {
    "Content-Type": "application/json",
    "Accept-Language": locale === "uk" ? "uk" : "en",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra || {}),
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const locale = currentLocale();
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: localeHeaders(init?.headers),
    });
  } catch {
    throw new ApiError(translateError(locale, "We can’t reach the studio. Check your internet and try again."), 503);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok) {
    throw new ApiError(translateError(locale, data.error || "Something went wrong. Try again in a minute."), res.status, data.code);
  }
  return data as T;
}

export const api = {
  signup: (body: { name: string; email: string; password: string }) =>
    request<{ token: string; user: User }>("/auth/signup", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<{ token: string; user: User }>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  me: () => request<Me>("/auth/me"),
  verifyEmail: (token: string) =>
    request<{ ok: true }>("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) }),
  resendVerification: () => request<{ verified: boolean }>("/auth/verify-email/resend", { method: "POST" }),
  verifyEmailCode: (code: string) =>
    request<{ verified: boolean }>("/auth/verify-email/code", { method: "POST", body: JSON.stringify({ code }) }),
  forgotPassword: (email: string) =>
    request<{ ok: true }>("/auth/password/forgot", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) =>
    request<{ token: string; user: User }>("/auth/password/reset", { method: "POST", body: JSON.stringify({ token, password }) }),
  adminImportPart: (uploadId: string, index: number, part: Blob) =>
    request<{ received: number }>(`/admin/import/${uploadId}/part/${index}`, {
      method: "POST",
      body: part,
      headers: { "Content-Type": "application/octet-stream" },
    }),
  adminImportFinish: (uploadId: string) =>
    request<{ email: string; accountExisted: boolean; projects: number; versions: number; files: number }>(
      `/admin/import/${uploadId}/finish`,
      { method: "POST" }
    ),
  adminTables: () => request<{ tables: { name: string; rows: number }[] }>("/admin/tables"),
  adminTable: (name: string, offset = 0, limit = 50) =>
    request<AdminTable>(`/admin/tables/${encodeURIComponent(name)}?offset=${offset}&limit=${limit}`),
  projects: () => request<{ projects: Project[]; archive?: ArchiveState; fullVideoCost: number }>("/projects"),
  project: (id: string) =>
    request<{ project: Project; archive?: ArchiveState; costs: Record<string, number>; fullVideoCost: number }>(
      `/projects/${id}`
    ),
  createProject: (type: string, prompt: string, imageIntent?: string, useBrand = true, pictureLanguage?: string, imageFormat?: string) =>
    request<{ project: Project }>("/projects", {
      method: "POST",
      body: JSON.stringify({ type, prompt, imageIntent, useBrand, pictureLanguage, imageFormat }),
    }),
  deleteProject: (id: string) => request<{ ok: boolean }>(`/projects/${id}`, { method: "DELETE" }),
  updatePrompt: (id: string, prompt: string) =>
    request<{ project: Project }>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify({ prompt }) }),
  updateUseBrand: (id: string, useBrand: boolean) =>
    request<{ project: Project }>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify({ useBrand }) }),
  translateCertificate: (id: string, lang: "uk" | "en") =>
    request<{ project: Project }>(`/projects/${id}/certificate/translate`, { method: "POST", body: JSON.stringify({ lang }) }),
  saveCertificate: (id: string, certificate: CertificateSettings) =>
    request<{ project: Project }>(`/projects/${id}/certificate`, { method: "PATCH", body: JSON.stringify(certificate) }),
  updateInvite: (id: string, invite: InviteCard) =>
    request<{ project: Project }>(`/projects/${id}/invite`, { method: "PATCH", body: JSON.stringify({ invite }) }),
  runStep: (
    id: string,
    step: string,
    regenerate = false,
    sceneId?: number,
    feedback?: { reason?: string; note?: string },
    evictOldest = false,
    extra?: { pictureLanguage?: string; keepStill?: boolean; keepStillVersionId?: string; copyEdit?: string; copyEditImage?: string; reformat?: string }
  ) => {
    const idempotencyKey = crypto.randomUUID();
    return request<{ project: Project; archive?: ArchiveState }>(`/projects/${id}/steps/${step}`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        regenerate,
        sceneId,
        idempotencyKey,
        feedbackReason: feedback?.reason || undefined,
        feedbackNote: feedback?.note || undefined,
        evictOldest: evictOldest || undefined,
        pictureLanguage: extra?.pictureLanguage,
        keepStill: extra?.keepStill || undefined,
        keepStillVersionId: extra?.keepStillVersionId || undefined,
        copyEdit: extra?.copyEdit || undefined,
        reformat: extra?.reformat || undefined,
        copyEditImage: extra?.copyEditImage || undefined,
      }),
    });
  },
  stampLogo: (id: string, sceneId: number, position: string, versionId?: string, box?: LogoBox) =>
    request<{ project: Project }>(`/projects/${id}/logo`, {
      method: "POST",
      body: JSON.stringify({ sceneId, position, versionId, box }),
    }),
  logoLayout: (id: string, sceneId: number) =>
    request<{ box: LogoBox; markRatio: number; pictureRatio: number }>(`/projects/${id}/logo/layout?sceneId=${sceneId}`),
  removeLogo: (id: string, sceneId: number, versionId?: string) =>
    request<{ project: Project }>(
      `/projects/${id}/logo?sceneId=${sceneId}${versionId ? `&versionId=${encodeURIComponent(versionId)}` : ""}`,
      { method: "DELETE" }
    ),
  deletePictureVersion: (id: string, versionId: string) =>
    request<{ project: Project }>(`/projects/${id}/versions/visuals/${versionId}`, { method: "DELETE" }),
  keepCurrentPicture: (id: string) =>
    request<{ project: Project }>(`/projects/${id}/versions/visuals/keep-current`, { method: "POST" }),
  editScript: (id: string, body: { cta?: string; scenes: { id: number; onScreen: string; voiceover: string; frameWish?: string }[] }) =>
    request<{ project: Project }>(`/projects/${id}/script`, { method: "PATCH", body: JSON.stringify(body) }),
  uploadMusic: async (id: string, file: File) => {
    const locale = currentLocale();
    let res: Response;
    try {
      res = await fetch(`/projects/${id}/music`, {
        method: "POST",
        headers: localeHeaders({ "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) }),
        body: file,
      });
    } catch {
      throw new ApiError(translateError(locale, "We can’t reach the studio. Check your internet and try again."), 503);
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string; project?: Project };
    if (!res.ok) throw new ApiError(translateError(locale, data.error || "Something went wrong. Try again in a minute."), res.status, data.code);
    return data as { project: Project };
  },
  updateMusic: (id: string, body: { volume?: number; start?: number }) =>
    request<{ project: Project }>(`/projects/${id}/music`, { method: "PATCH", body: JSON.stringify(body) }),
  setVoiceChoice: (id: string, voice: VoiceChoice) =>
    request<{ project: Project }>(`/projects/${id}/voice-choice`, { method: "PATCH", body: JSON.stringify({ voice }) }),
  forkReel: (id: string, step: "idea" | "script", versionId: string) =>
    request<{ project: Project }>(`/projects/${id}/fork`, { method: "POST", body: JSON.stringify({ step, versionId }) }),
  remakeVideo: (id: string) => request<{ project: Project }>(`/projects/${id}/remake`, { method: "POST" }),
  updateCaptionStyle: (id: string, style: "clean" | "box" | "brand") =>
    request<{ project: Project }>(`/projects/${id}/captions-style`, { method: "PATCH", body: JSON.stringify({ style }) }),
  updateReelTitles: (id: string, body: Partial<ReelTitles>) =>
    request<{ project: Project }>(`/projects/${id}/titles`, { method: "PATCH", body: JSON.stringify(body) }),
  updateReelLogo: (id: string, body: Partial<ReelLogo>) =>
    request<{ project: Project }>(`/projects/${id}/reel-logo`, { method: "PATCH", body: JSON.stringify(body) }),
  uploadCertificateLogo: async (id: string, file: File) => {
    const locale = currentLocale();
    let res: Response;
    try {
      res = await fetch(`/projects/${id}/certificate/logo`, {
        method: "POST",
        headers: localeHeaders({ "Content-Type": file.type || "application/octet-stream" }),
        body: file,
      });
    } catch {
      throw new ApiError(translateError(locale, "We can’t reach the studio. Check your internet and try again."), 503);
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string; project?: Project };
    if (!res.ok) throw new ApiError(translateError(locale, data.error || "Something went wrong. Try again in a minute."), res.status, data.code);
    return data as { project: Project };
  },
  createOwnPicture: async (file: Blob, name: string, useBrand: boolean) => {
    const locale = currentLocale();
    let res: Response;
    try {
      res = await fetch(`/projects/own`, {
        method: "POST",
        headers: localeHeaders({
          "Content-Type": file.type || "application/octet-stream",
          "X-File-Name": encodeURIComponent(name),
          "X-Use-Brand": useBrand ? "1" : "0",
        }),
        body: file,
      });
    } catch {
      throw new ApiError(translateError(locale, "We can’t reach the studio. Check your internet and try again."), 503);
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string; project?: Project };
    if (!res.ok) throw new ApiError(translateError(locale, data.error || "Something went wrong. Try again in a minute."), res.status, data.code);
    return data as { project: Project };
  },
  /** index: for a certificate, whose finished certificate (with its words) to take. */
  createOwnFromProject: (sourceId: string, useBrand: boolean, index?: number) =>
    request<{ project: Project }>(`/projects/own/from/${sourceId}`, { method: "POST", body: JSON.stringify({ useBrand, index }) }),
  reshapePicture: (id: string, body: { format: string; mode: "crop" | "fit"; background?: string; focusX?: number; focusY?: number }) =>
    request<{ project: Project }>(`/projects/${id}/reshape`, { method: "POST", body: JSON.stringify(body) }),
  /** What the change of shape would look like — a small JPEG, nothing saved. */
  reshapePreview: async (id: string, body: { format: string; mode: "crop" | "fit"; background?: string; focusX?: number; focusY?: number }) => {
    const locale = currentLocale();
    const res = await fetch(`/projects/${id}/reshape/preview`, { method: "POST", headers: localeHeaders(), body: JSON.stringify(body) });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(translateError(locale, data.error || "Something went wrong. Try again in a minute."), res.status);
    }
    return res.blob();
  },
  /** Create → Certificate → your own design: the uploaded file becomes the design (cut or fitted to A5). */
  createCertificateFromUpload: async (file: Blob, name: string, useBrand: boolean, mode: "crop" | "fit", background: string) => {
    const locale = currentLocale();
    let res: Response;
    try {
      res = await fetch(`/projects/certificate-design`, {
        method: "POST",
        headers: localeHeaders({
          "Content-Type": file.type || "application/octet-stream",
          "X-File-Name": encodeURIComponent(name),
          "X-Use-Brand": useBrand ? "1" : "0",
          "X-Mode": mode,
          "X-Background": background,
        }),
        body: file,
      });
    } catch {
      throw new ApiError(translateError(locale, "We can’t reach the studio. Check your internet and try again."), 503);
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string; project?: Project };
    if (!res.ok) throw new ApiError(translateError(locale, data.error || "Something went wrong. Try again in a minute."), res.status, data.code);
    return data as { project: Project };
  },
  makeCertificate: (id: string, body: { mode: "crop" | "fit"; background?: string; useBrand?: boolean }) =>
    request<{ project: Project }>(`/projects/${id}/make-certificate`, { method: "POST", body: JSON.stringify(body) }),
  removeCertificateLogo: (id: string) => request<{ project: Project }>(`/projects/${id}/certificate/logo`, { method: "DELETE" }),
  removeMusic: (id: string) => request<{ project: Project }>(`/projects/${id}/music`, { method: "DELETE" }),
  translateScript: (id: string, lang: "en" | "uk") =>
    request<{ project: Project }>(`/projects/${id}/script/translate`, { method: "POST", body: JSON.stringify({ lang }) }),
  editCaptions: (id: string, cues: { start: number; end: number; text: string }[]) =>
    request<{ project: Project }>(`/projects/${id}/captions`, { method: "PATCH", body: JSON.stringify({ cues }) }),
  setCaptionsOff: (id: string, off: boolean) =>
    request<{ project: Project }>(`/projects/${id}/captions-off`, { method: "POST", body: JSON.stringify({ off }) }),
  setVoiceOff: (id: string, off: boolean) =>
    request<{ project: Project }>(`/projects/${id}/voice-off`, { method: "POST", body: JSON.stringify({ off }) }),
  updateShot: (id: string, body: { confirm?: boolean; shot?: Shot }) =>
    request<{ project: Project }>(`/projects/${id}/shot`, { method: "POST", body: JSON.stringify(body) }),
  saveFeedback: (id: string, publishable: string, reasons: string[]) =>
    request<{ project: Project }>(`/projects/${id}/feedback`, {
      method: "POST",
      body: JSON.stringify({ publishable, reasons }),
    }),
  sharePreview: (id: string) => request<{ url: string; expiresAt: string }>(`/projects/${id}/share`, { method: "POST" }),
  restoreVersion: (id: string, step: "idea" | "script" | "visuals", versionId: string, sceneId?: number) =>
    request<{ project: Project }>(`/projects/${id}/versions/${step}/${versionId}/restore`, {
      method: "POST",
      body: JSON.stringify(sceneId ? { sceneId } : {}),
    }),
  updateProfile: (body: { name?: string; email?: string; currentPassword?: string }) =>
    request<{ token: string; user: User }>("/auth/profile", { method: "PATCH", body: JSON.stringify(body) }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ token: string }>("/auth/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
  logoutAll: () => request<{ ok: boolean }>("/auth/logout-all", { method: "POST" }),
  deleteAccount: (password: string) =>
    request<{ ok: boolean }>("/auth/account", { method: "DELETE", body: JSON.stringify({ password }) }),
  addProjectRef: (id: string, image: string) =>
    request<{ refs: { id: string; url: string }[] }>(`/projects/${id}/refs`, { method: "POST", body: JSON.stringify({ image }) }),
  deleteProjectRef: (id: string, slot: string) =>
    request<{ refs: { id: string; url: string }[] }>(`/projects/${id}/refs/${slot}`, { method: "DELETE" }),
  brand: () => request<{ brandKit: BrandKitRow | null }>("/brand"),
  saveBrand: (body: Record<string, string | boolean>) =>
    request<{ brandKit: BrandKitRow }>("/brand", { method: "PUT", body: JSON.stringify(body) }),
  uploadLogo: (image: string) =>
    request<{ brandKit: BrandKitRow }>("/brand/logo", { method: "POST", body: JSON.stringify({ image }) }),
  deleteLogo: () => request<{ brandKit: BrandKitRow }>("/brand/logo", { method: "DELETE" }),
  uploadFont: (font: string) =>
    request<{ brandKit: BrandKitRow }>("/brand/font", { method: "POST", body: JSON.stringify({ font }) }),
  deleteFont: () => request<{ brandKit: BrandKitRow }>("/brand/font", { method: "DELETE" }),
  uploadBrandRef: (slot: "place" | "people" | "product", image: string) =>
    request<{ brandKit: BrandKitRow }>(`/brand/ref/${slot}`, { method: "POST", body: JSON.stringify({ image }) }),
  deleteBrandRef: (slot: "place" | "people" | "product") =>
    request<{ brandKit: BrandKitRow }>(`/brand/ref/${slot}`, { method: "DELETE" }),
  resetLearning: () => request<{ brandKit: BrandKitRow }>("/brand/learning/reset", { method: "POST" }),
  plans: () =>
    request<{
      plans: { id: string; name: string; price_gbp: number; monthly_credits: number; description: string }[];
      packs: { id: string; credits: number; price_gbp: number; label: string }[];
      frozenPrices: boolean;
      checkoutEnabled?: boolean;
      costs: Record<string, number>;
      fullVideoCost: number;
    }>("/billing/plans"),
  credits: () =>
    request<{
      balance: { credits: number } | null;
      transactions: { id: string; amount: number; type: string; description: string; created_at: string }[];
      generations: { id: string; type: string; provider: string; model: string; actual_cost_gbp: number; credits_used: number; status: string; created_at: string }[];
      economics: {
        actualCostGbp: { text: number; image: number; tts: number; render: number; failed: number; retries: number; total: number };
        readyReels: number;
        costPerReadyReelGbp: number;
        note: string;
      };
    }>("/billing/credits"),
  checkout: (body: { planId?: string; packId?: string }) =>
    request<{ url: string; mode: string }>("/billing/checkout", { method: "POST", body: JSON.stringify(body) }),
};

export function saveSession(token: string) {
  localStorage.setItem(TOKEN, token);
}
export function clearSession() {
  localStorage.removeItem(TOKEN);
}
export function hasSession() {
  return Boolean(localStorage.getItem(TOKEN));
}

export function refreshMe() {
  window.dispatchEvent(new Event("auteur:refresh"));
}

export async function fetchMedia(path: string) {
  const locale = currentLocale();
  const token = localStorage.getItem(TOKEN);
  const res = await fetch(path, {
    cache: "no-store",
    headers: {
      "Accept-Language": locale === "uk" ? "uk" : "en",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new ApiError(translateError(locale, "This file isn’t ready yet."), res.status);
  return res.blob();
}
