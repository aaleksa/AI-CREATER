import assert from "node:assert/strict";
import { saveCertificateVariants } from "./pipeline.js";

const textState = {
  title: "Gift certificate",
  note: "",
  lang: "en",
  codes: true,
  layout: { x: 0.5, y: 0.5, scale: 1 },
  style: { font: "brand", accent: "", ink: "", panel: "soft", words: true },
  logo: "brand",
  items: [{ name: "Alex", gift: "Coffee", giftNote: "Enjoy!", validFrom: "2025-01-01", validUntil: "2025-12-31", code: "ABC-123" }],
};

const blankState = {
  ...textState,
  style: { ...textState.style, words: false },
};

const saved = saveCertificateVariants({} as any, textState as any);
const updated = saveCertificateVariants(saved as any, blankState as any);

assert.equal(updated.variants?.text?.style.words, true);
assert.equal(updated.variants?.blank?.style.words, false);
assert.equal(updated.style.words, false);
assert.equal(updated.variants?.text?.items[0].name, "Alex");
assert.equal(updated.variants?.blank?.items[0].name, "Alex");
console.log("certificate variants test passed");
