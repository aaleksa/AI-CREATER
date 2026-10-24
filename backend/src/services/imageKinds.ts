/**
 * Designed pages: photography and the owner's words as one layout. The AI paints the words, so the picture language,
 * the "tall" default shape and the word-edit tools apply to all of them.
 */
export const POSTER_INTENTS = ["invite", "info", "offer", "announce", "review", "greeting", "infographic", "launch", "own"] as const;
/** Made from a picture the owner already has (an upload or a picture made here), never from a brief on Create. */
export const OWN_INTENT = "own";

export function isPosterKind(kind: string) {
  return (POSTER_INTENTS as readonly string[]).includes(kind);
}
