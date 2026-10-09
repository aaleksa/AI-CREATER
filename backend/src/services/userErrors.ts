/**
 * Texts the owner may see. Keep them free of service names, keys, file paths and settings —
 * the technical reason goes to the server log. Every text here needs a Ukrainian line in frontend/src/i18n/errors.ts.
 */
export const USER_ERRORS = {
  pictureUnavailable: "We can’t make pictures right now. Try again in a few minutes.",
  pictureBusy: "Lots of requests right now. Try again in a minute.",
  pictureBlocked: "We can’t make a picture from this description. Try saying it a little differently.",
  pictureFailed: "We couldn’t make the picture. Try again — if it happens again, describe it a little differently.",
  frameFailed: "We couldn’t make this frame. Try again — if it happens again, describe it a little differently.",
  framesFailed: "We couldn’t make the frames for the Reel. Try again — if it happens again, describe it a little differently.",
  videoFailed: "We couldn’t put the video together. Try again in a minute.",
  voiceFailed: "We couldn’t record the voice. Try again in a minute.",
  captionsFailed: "We couldn’t make the captions. Try again in a minute.",
  textFailed: "We couldn’t write this right now. Try again in a minute.",
  somethingWrong: "Something went wrong. Try again in a minute.",
  refresh: "Something went wrong. Refresh the page and try again.",
} as const;

type AppError = Error & { status?: number; code?: string };
const SAFE_TEXTS = new Set<string>(Object.values(USER_ERRORS));

/**
 * Errors thrown on purpose carry a 4xx status (or one of USER_ERRORS) and a text meant for the owner.
 * Anything else is a crash or a provider failure: log it, show a plain text.
 */
function isForOwner(err: AppError) {
  const status = Number(err.status) || 500;
  return Boolean(err.message) && ((status >= 400 && status < 500) || SAFE_TEXTS.has(err.message));
}

/** Keeps an owner-facing error as is; logs anything else and swaps it for `text`. */
export function forOwner(error: unknown, where: string, text: string = USER_ERRORS.somethingWrong) {
  const err = (error || {}) as AppError;
  if (isForOwner(err)) return err;
  console.error(`${where} failed`, error);
  return Object.assign(new Error(text), { status: 500 });
}

export function publicError(error: unknown, where: string) {
  const err = forOwner(error, where) as AppError;
  return {
    status: Number(err.status) || 500,
    body: { error: err.message, ...(err.code ? { code: err.code } : {}) },
  };
}
