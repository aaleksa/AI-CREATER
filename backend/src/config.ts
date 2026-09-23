import "dotenv/config";

export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  openaiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
  openaiImageModel: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst",
  openaiMaxInputChars: Number(process.env.OPENAI_MAX_INPUT_CHARS || 100000),
  stripeSecret: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  appUrl: process.env.APP_URL || "http://localhost:5173",
};

export const MIN_PROMPT_CHARS = 8;
export const MAX_PROMPT_CHARS = 2000;
export const FREE_CREDITS = 200;

export const CREDIT_COSTS = {
  idea: 5,
  script: 10,
  visuals: 40,
  voice: 30,
  captions: 10,
  render: 55,
} as const;

export const FULL_VIDEO_COST = Object.values(CREDIT_COSTS).reduce((a, b) => a + b, 0);

/** One DALL·E frame. 40 / 5 scenes. FROZEN with the rest of §9. */
export const VISUAL_SCENE_CREDITS = 8;
export const IMAGE_SLIDE_COUNT = 1;
export const INVITE_SLIDE_COUNT = IMAGE_SLIDE_COUNT;
/** Public preview link. Not a permanent Download URL. */
export const PREVIEW_TTL_DAYS = 7;
export const FULL_IMAGE_COST = CREDIT_COSTS.idea + IMAGE_SLIDE_COUNT * VISUAL_SCENE_CREDITS;
export const FULL_INVITE_COST = FULL_IMAGE_COST;
export const FULL_POSTER_COST = FULL_IMAGE_COST;

export function visualMinLive(sceneCount: number) {
  return Math.max(1, Math.ceil((sceneCount * 3) / 5));
}

/** First Make + this many retries at list price. Further tries stay allowed at 2× — user chooses to pay. */
export const MAX_REGENERATES_PER_STEP = 2;
export const MAX_STEP_ATTEMPTS = 1 + MAX_REGENERATES_PER_STEP;
export const EXTRA_ATTEMPT_MULTIPLIER = 2;

export function attemptCost(baseCredits: number, attemptsSoFar: number) {
  return baseCredits * (attemptsSoFar >= MAX_STEP_ATTEMPTS ? EXTRA_ATTEMPT_MULTIPLIER : 1);
}

/** Finished mp4s kept on disk at once. Evict only after UI confirm (§5.3). */
export const ARCHIVE_LIMITS: Record<string, number> = {
  free: 10,
  creator: 30,
  pro: 60,
  business: 120,
};

export const ARCHIVE_FULL_ERROR =
  "This plan is full. Confirm to take the oldest Reel off disk (download it first if you still need it), or delete one from the Library.";

export const CREDIT_PACKS = [
  { id: "pack_200", credits: 200, price_gbp: 499, label: "200 credits" },
  { id: "pack_600", credits: 600, price_gbp: 1299, label: "600 credits" },
  { id: "pack_1500", credits: 1500, price_gbp: 2999, label: "1,500 credits" },
];
