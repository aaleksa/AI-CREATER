import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fetchMedia, type BrandKitRow } from "../lib/api";
import { useLocale } from "../i18n/locale";
import { ImageUploadError, prepareImage } from "../lib/imageUpload";

const TONES = [
  { id: "warm", labelKey: "brand.toneWarm", exKey: "brand.toneWarmEx", text: "Warm and friendly. Like a regular, not an ad." },
  { id: "professional", labelKey: "brand.tonePro", exKey: "brand.toneProEx", text: "Professional and polished. Clear, short, never stiff." },
  { id: "playful", labelKey: "brand.tonePlay", exKey: "brand.tonePlayEx", text: "Fun and playful. Light. Never try-hard." },
  { id: "calm", labelKey: "brand.toneCalm", exKey: "brand.toneCalmEx", text: "Calm and minimal. Unhurried. Quiet, not luxury-speak." },
];

function toneOf(text: string) {
  return TONES.find((item) => text === item.text || (text && text.startsWith(item.text.split(".")[0])));
}

const HEX = /^#[0-9A-Fa-f]{6}$/;
const DEFAULT_PRIMARY = "#C45C26";
const DEFAULT_SECONDARY = "#F4EFE8";

function luminance(hex: string) {
  const channel = (start: number) => {
    const v = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string) {
  if (!HEX.test(a) || !HEX.test(b)) return 21;
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Same line the server prints on photos: "@name · site". */
function contactLine(instagram: string, website: string) {
  const handle = instagram.trim().replace(/[?#].*$/, "").replace(/\/+$/, "").replace(/^https?:\/\/[^/]*\//i, "").replace(/^@+/, "").split("/").pop() || "";
  const site = website.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "").slice(0, 40);
  return [/^[A-Za-z0-9._]{1,30}$/.test(handle) ? `@${handle}` : "", site].filter(Boolean).join("  ·  ");
}

function goTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "center" });
  if (typeof (el as HTMLElement).focus === "function") (el as HTMLElement).focus({ preventScroll: true });
}

function snapshot(form: typeof empty, logoOnPhotos: boolean, contactOnPhotos: boolean) {
  // Photos and logo save on their own, so they do not count as unsaved.
  const { logo_url, ref_place_url, ref_people_url, ref_product_url, font_url, ...rest } = form;
  void logo_url; void ref_place_url; void ref_people_url; void ref_product_url; void font_url;
  return JSON.stringify({ ...rest, logoOnPhotos, contactOnPhotos });
}

const TYPES = [
  { id: "", labelKey: "brand.typeNone", hintKey: "brand.typeNoneHint" },
  { id: "salon", labelKey: "brand.typeSalon", hintKey: "brand.typeSalonHint" },
  { id: "cafe", labelKey: "brand.typeCafe", hintKey: "brand.typeCafeHint" },
  { id: "fitness", labelKey: "brand.typeFitness", hintKey: "brand.typeFitnessHint" },
  { id: "other", labelKey: "brand.typeOther", hintKey: "brand.typeOtherHint" },
];

const FONTS = ["Fraunces", "Outfit", "Playfair Display", "IBM Plex Sans", "Nunito", "Montserrat"];
/** Shipped with the app (public/fonts), so the server can print the business name in them. */
const BUILTIN_FONTS = ["Nunito", "Montserrat"];

const REF_SLOTS = [
  { id: "place" as const, labelKey: "brand.refPlace", hintKey: "brand.refPlaceHint" },
  { id: "people" as const, labelKey: "brand.refPeople", hintKey: "brand.refPeopleHint" },
  { id: "product" as const, labelKey: "brand.refProduct", hintKey: "brand.refProductHint" },
];

const empty = {
  business_name: "",
  logo_url: "",
  primary_color: DEFAULT_PRIMARY,
  secondary_color: DEFAULT_SECONDARY,
  font: "Fraunces",
  tone_of_voice: TONES[0].text,
  tone_note: "",
  website: "",
  instagram: "",
  address: "",
  vertical: "",
  vertical_note: "",
  ref_place_url: "",
  ref_people_url: "",
  ref_product_url: "",
  font_url: "",
  logo_position: "bottom-right",
};

const LOGO_POSITIONS = [
  { id: "top-left", labelKey: "brand.cornerTopLeft" },
  { id: "top-right", labelKey: "brand.cornerTopRight" },
  { id: "bottom-left", labelKey: "brand.cornerBottomLeft" },
  { id: "bottom-right", labelKey: "brand.cornerBottomRight" },
];

function applyKit(kit: BrandKitRow) {
  const hex = (value: string | undefined, fallback: string) =>
    value && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : fallback;
  return {
    business_name: kit.business_name || "",
    logo_url: kit.logo_url || "",
    primary_color: hex(kit.primary_color, "#C45C26"),
    secondary_color: hex(kit.secondary_color, "#F4EFE8"),
    font: kit.font || "Fraunces",
    tone_of_voice: kit.tone_of_voice || TONES[0].text,
    tone_note: kit.tone_note || "",
    website: kit.website || "",
    instagram: kit.instagram || "",
    address: kit.address || "",
    vertical: kit.vertical || "",
    vertical_note: kit.vertical_note || "",
    ref_place_url: kit.ref_place_url || "",
    ref_people_url: kit.ref_people_url || "",
    ref_product_url: kit.ref_product_url || "",
    font_url: kit.font_url || "",
    logo_position: LOGO_POSITIONS.some((item) => item.id === kit.logo_position) ? kit.logo_position : "bottom-right",
  };
}

const OWN_FONT = "AuteurBrandFont";

/** Loads the uploaded font file into the page so the sketch uses the real letters. */
function useKitFont(path: string, version: string) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    if (!path) return;
    let face: FontFace | null = null;
    let live = true;
    fetchMedia(path)
      .then((blob) => blob.arrayBuffer())
      .then((buffer) => new FontFace(OWN_FONT, buffer).load())
      .then((loaded) => {
        if (!live) return;
        face = loaded;
        document.fonts.add(loaded);
        setReady(true);
      })
      .catch(() => setReady(false));
    return () => {
      live = false;
      if (face) document.fonts.delete(face);
    };
  }, [path, version]);
  return ready;
}

function useKitImage(path: string) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!path.startsWith("/brand/")) {
      setSrc(path.startsWith("http") ? path : "");
      return;
    }
    let url = "";
    fetchMedia(path)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => setSrc(""));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [path]);
  return src;
}

export default function Brand() {
  const { t, te } = useLocale();
  const [form, setForm] = useState(empty);
  const [saved, setSaved] = useState(false);
  const [savedSnap, setSavedSnap] = useState("");
  const [error, setError] = useState("");
  const [learnedFrom, setLearnedFrom] = useState(0);
  const [learnedLines, setLearnedLines] = useState<string[]>([]);
  const [readyProjects, setReadyProjects] = useState(0);
  const [ownNote, setOwnNote] = useState(false);
  const [logoOnPhotos, setLogoOnPhotos] = useState(false);
  const [contactOnPhotos, setContactOnPhotos] = useState(false);
  const logoSrc = useKitImage(form.logo_url);
  const placeSrc = useKitImage(form.ref_place_url);
  const peopleSrc = useKitImage(form.ref_people_url);
  const productSrc = useKitImage(form.ref_product_url);
  const refSrc = { place: placeSrc, people: peopleSrc, product: productSrc };
  const [fontVersion, setFontVersion] = useState(0);
  const ownFont = useKitFont(form.font_url, `${form.font}:${fontVersion}`);
  const typeFamily = ownFont ? `"${OWN_FONT}", ${form.font}` : form.font;

  function side(kit: BrandKitRow) {
    setLearnedFrom(kit.learned_summary?.basedOnProjects || 0);
    setLearnedLines(kit.learned_lines || []);
    setReadyProjects(kit.ready_projects || 0);
  }

  // Whole kit from the server: after load and after Save.
  function apply(kit: BrandKitRow) {
    const next = applyKit(kit);
    const stamp = kit.logo_on_photos === true || kit.logo_on_photos === "1" || Number(kit.logo_on_photos) === 1;
    setForm(next);
    side(kit);
    setOwnNote(Boolean(kit.tone_note));
    setLogoOnPhotos(stamp);
    const contact = Boolean(Number(kit.contact_on_photos));
    setContactOnPhotos(contact);
    setSavedSnap(snapshot(next, stamp, contact));
  }

  // Logo and photos save on their own. Do not overwrite what is still being typed.
  function applyImages(kit: BrandKitRow) {
    const next = applyKit(kit);
    setForm((f) => ({
      ...f,
      logo_url: next.logo_url,
      ref_place_url: next.ref_place_url,
      ref_people_url: next.ref_people_url,
      ref_product_url: next.ref_product_url,
    }));
    side(kit);
  }

  useEffect(() => {
    api.brand().then((d) => {
      if (!d.brandKit) return;
      apply(d.brandKit);
    });
  }, [t]);

  const dirty = savedSnap !== "" && snapshot(form, logoOnPhotos, contactOnPhotos) !== savedSnap;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!HEX.test(form.primary_color) || !HEX.test(form.secondary_color)) {
      setError(t("brand.badColour"));
      return;
    }
    try {
      const instagram = form.instagram.trim().replace(/^@+/, "");
      const { brandKit } = await api.saveBrand({
        ...form,
        instagram: instagram ? `@${instagram}` : "",
        website: form.website.trim(),
        logo_on_photos: logoOnPhotos,
        contact_on_photos: contactOnPhotos,
      });
      apply(brandKit);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("brand.fallbackSave"));
    }
  }

  async function readKitFile(file: File | undefined, send: (dataUrl: string) => Promise<void>, fallback: string, keepAlpha = false) {
    if (!file) return;
    setError("");
    let image = "";
    try {
      image = await prepareImage(file, { keepAlpha });
    } catch (err) {
      setError(err instanceof ImageUploadError && err.reason === "tooBig" ? t("brand.tooBig") : t("brand.badType"));
      return;
    }
    try {
      await send(image);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : fallback);
    }
  }

  async function onLogo(file: File | undefined) {
    await readKitFile(
      file,
      async (image) => {
        const { brandKit } = await api.uploadLogo(image);
        applyImages(brandKit);
      },
      t("brand.fallbackLogo"),
      true
    );
  }

  async function removeLogo() {
    setError("");
    try {
      const { brandKit } = await api.deleteLogo();
      applyImages(brandKit);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("brand.fallbackRemoveLogo"));
    }
  }

  // The server sets the title type to the uploaded font's own name, so that counts as saved.
  function applyFont(kit: BrandKitRow) {
    const next = applyKit(kit);
    setForm((f) => ({ ...f, font: next.font, font_url: next.font_url }));
    setSavedSnap((snap) => (snap ? JSON.stringify({ ...JSON.parse(snap), font: next.font }) : snap));
    setFontVersion((v) => v + 1);
    side(kit);
  }

  function onFont(file: File | undefined) {
    if (!file) return;
    setError("");
    if (file.size > 2 * 1024 * 1024 || !/\.(ttf|otf)$/i.test(file.name)) {
      setError(t("brand.badFont"));
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        applyFont((await api.uploadFont(String(reader.result || ""))).brandKit);
      } catch (err) {
        setError(err instanceof Error ? te(err.message) : t("brand.fallbackFont"));
      }
    };
    reader.readAsDataURL(file);
  }

  async function removeFont() {
    setError("");
    try {
      applyFont((await api.deleteFont()).brandKit);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("brand.fallbackRemoveFont"));
    }
  }

  async function onRef(slot: "place" | "people" | "product", file: File | undefined) {
    readKitFile(
      file,
      async (image) => {
        const { brandKit } = await api.uploadBrandRef(slot, image);
        applyImages(brandKit);
      },
      t("brand.fallbackRef")
    );
  }

  async function removeRef(slot: "place" | "people" | "product") {
    setError("");
    try {
      const { brandKit } = await api.deleteBrandRef(slot);
      applyImages(brandKit);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("brand.fallbackRemoveRef"));
    }
  }

  async function resetLearning() {
    if (!window.confirm(t("brand.resetConfirm"))) return;
    try {
      const { brandKit } = await api.resetLearning();
      applyImages(brandKit);
    } catch (err) {
      setError(err instanceof Error ? te(err.message) : t("brand.fallbackReset"));
    }
  }

  function discard() {
    setError("");
    api.brand().then((d) => {
      if (d.brandKit) apply(d.brandKit);
    });
  }

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const tone = toneOf(form.tone_of_voice);
  const stampText = contactLine(form.instagram, form.website);
  const canStamp =
    Boolean(logoSrc) || ((Boolean(form.font_url) || BUILTIN_FONTS.includes(form.font)) && Boolean(form.business_name.trim()));
  const lowContrast = contrast(form.primary_color, form.secondary_color) < 3;
  const checks = [
    { key: "colours", label: t("brand.checkColours"), done: form.primary_color.toUpperCase() !== DEFAULT_PRIMARY || form.secondary_color.toUpperCase() !== DEFAULT_SECONDARY, target: "primary_color" },
    { key: "tone", label: t("brand.checkTone"), done: Boolean(tone), target: "brand-tone" },
    { key: "name", label: t("brand.checkName"), done: Boolean(form.business_name.trim()), target: "business_name" },
    { key: "type", label: t("brand.checkType"), done: Boolean(form.vertical), target: "brand-vertical" },
    { key: "logo", label: t("brand.checkLogo"), done: Boolean(logoSrc), target: "brand-logo" },
  ];
  const doneCount = checks.filter((item) => item.done).length;

  const sections = [
    { id: "brand-business", label: t("brand.navBusiness") },
    { id: "brand-look", label: t("brand.navLook") },
    { id: "brand-assets", label: t("brand.navAssets") },
    { id: "brand-contacts", label: t("brand.navContacts") },
  ];

  function Tile({
    id,
    label,
    src,
    contain,
    onPick,
    onRemove,
    hint: tileHint,
  }: {
    id: string;
    label: string;
    src: string;
    contain?: boolean;
    onPick: (file: File | undefined) => void;
    onRemove: () => void;
    hint?: string;
  }) {
    return (
      <div className="tile">
        <label htmlFor={id} className={`tile-img${src ? "" : " empty"}${contain ? " contain" : ""}`}>
          {src ? <img src={src} alt="" /> : <span>+ {t("brand.tileEmpty")}</span>}
        </label>
        <b>{label}</b>
        {tileHint && <span className="hint">{tileHint}</span>}
        <div className="tile-actions">
          <label className="btn ghost" htmlFor={id}>{src ? t("brand.replaceRef") : t("brand.addRef")}</label>
          {src && (
            <button className="btn ghost" type="button" onClick={onRemove}>{t("brand.removeRef")}</button>
          )}
        </div>
        <input
          id={id}
          className="sr-only"
          type="file"
          accept="image/*"
          onChange={(e) => {
            onPick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
    );
  }

  const learnedOpen = learnedFrom >= 3 || readyProjects >= 3;

  return (
    <div>
      <h1 className="page-title" style={{ fontSize: 48 }}>{t("brand.title")}</h1>
      <p className="lede">{t("brand.lede")}</p>
      <nav className="brand-nav" aria-label={t("brand.sections")}>
        {sections.map((item) => (
          <button key={item.id} type="button" className="chip-link" onClick={() => goTo(item.id)}>{item.label}</button>
        ))}
      </nav>

      <div className="brand-layout">
        <form onSubmit={onSubmit}>
          <section className="panel brand-section" id="brand-business" tabIndex={-1}>
            <h2>{t("brand.businessTitle")}</h2>
            <p className="hint">{t("brand.businessHint")}</p>
            <div className="field" style={{ marginTop: 14 }}>
              <label htmlFor="business_name">{t("brand.businessName")}</label>
              <input
                id="business_name"
                value={form.business_name}
                onChange={(e) => set("business_name", e.target.value)}
                placeholder={t("brand.businessPh")}
              />
            </div>
            <div className="field" id="brand-vertical" tabIndex={-1}>
              <label>{t("brand.vertical")}</label>
              <p className="hint">{t("brand.verticalHint")}</p>
              <div className="pills" role="group" aria-label={t("brand.vertical")}>
                {TYPES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={form.vertical === item.id}
                    className={`pill ${form.vertical === item.id ? "on" : ""}`}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        vertical: item.id,
                        vertical_note: item.id === "other" ? f.vertical_note : "",
                      }))
                    }
                  >
                    {t(item.labelKey)}
                  </button>
                ))}
              </div>
              <p className="hint pill-hint" aria-live="polite">
                {t((TYPES.find((item) => item.id === form.vertical) || TYPES[0]).hintKey)}
              </p>
              {form.vertical === "other" && (
                <input
                  value={form.vertical_note}
                  onChange={(e) => set("vertical_note", e.target.value)}
                  placeholder={t("brand.verticalOther")}
                  maxLength={80}
                />
              )}
            </div>
            <div className="field">
              <label htmlFor="address">{t("brand.address")}</label>
              <p className="hint">{t("brand.addressHint")}</p>
              <input
                id="address"
                value={form.address}
                maxLength={160}
                autoComplete="street-address"
                onChange={(e) => set("address", e.target.value)}
                placeholder={t("brand.addressPh")}
              />
            </div>
          </section>

          <section className="panel brand-section" id="brand-look" tabIndex={-1}>
            <h2>{t("brand.looks")}</h2>
            <p className="hint">{t("brand.looksHint")}</p>
            <div className="field" style={{ marginTop: 14 }}>
              <label>{t("brand.colours")}</label>
              <p className="hint">{t("brand.coloursHint")}</p>
              <div className="color-row">
                <div>
                  <span className="hint">{t("brand.main")}</span>
                  <div className="color-row">
                    <input type="color" aria-label={t("brand.main")} value={HEX.test(form.primary_color) ? form.primary_color : DEFAULT_PRIMARY} onChange={(e) => set("primary_color", e.target.value)} />
                    <input id="primary_color" value={form.primary_color} aria-invalid={!HEX.test(form.primary_color)} className={HEX.test(form.primary_color) ? "" : "bad"} onChange={(e) => set("primary_color", e.target.value)} />
                  </div>
                </div>
                <div>
                  <span className="hint">{t("brand.soft")}</span>
                  <div className="color-row">
                    <input type="color" aria-label={t("brand.soft")} value={HEX.test(form.secondary_color) ? form.secondary_color : DEFAULT_SECONDARY} onChange={(e) => set("secondary_color", e.target.value)} />
                    <input value={form.secondary_color} aria-invalid={!HEX.test(form.secondary_color)} className={HEX.test(form.secondary_color) ? "" : "bad"} onChange={(e) => set("secondary_color", e.target.value)} />
                  </div>
                </div>
              </div>
              {lowContrast && <p className="hint warn">{t("brand.contrastLow")}</p>}
            </div>
            <div className="field" id="brand-tone" tabIndex={-1}>
              <label>{t("brand.tone")}</label>
              <p className="hint">{t("brand.toneHint")}</p>
              <div className="choice-row tones" role="group" aria-label={t("brand.tone")}>
                {TONES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={tone?.id === item.id}
                    className={`choice ${tone?.id === item.id ? "on" : ""}`}
                    onClick={() => set("tone_of_voice", item.text)}
                  >
                    <b>{t(item.labelKey)}</b>
                    <span className="hint">“{t(item.exKey)}”</span>
                  </button>
                ))}
              </div>
              <button className="btn ghost" type="button" onClick={() => setOwnNote((v) => !v)}>
                {ownNote ? t("brand.hideNote") : t("brand.addNote")}
              </button>
              {ownNote && (
                <textarea
                  value={form.tone_note}
                  onChange={(e) => set("tone_note", e.target.value)}
                  rows={2}
                  maxLength={400}
                  placeholder={t("brand.notePh")}
                  style={{ marginTop: 10 }}
                />
              )}
            </div>
            <div className="field" id="brand-font" tabIndex={-1}>
              <label htmlFor={form.font_url ? "font-file" : "font"}>{t("brand.font")}</label>
              {form.font_url ? (
                <p className="hint">{t("brand.fontInUse", { name: form.font })}</p>
              ) : (
                <>
                  <p className="hint">{t("brand.fontHint")}</p>
                  <select id="font" value={form.font} onChange={(e) => set("font", e.target.value)}>
                    {FONTS.map((font) => (
                      <option key={font}>{font}</option>
                    ))}
                  </select>
                </>
              )}
              <p className="hint" style={{ marginTop: 10 }}>
                <b>{t("brand.fontOwn")}.</b> {t("brand.fontOwnHint")}
              </p>
              <div className="tile-actions">
                <label className="btn ghost" htmlFor="font-file">{form.font_url ? t("brand.replaceFont") : t("brand.addFont")}</label>
                {form.font_url && (
                  <button className="btn ghost" type="button" onClick={removeFont}>{t("brand.removeFont")}</button>
                )}
              </div>
              <input
                id="font-file"
                className="sr-only"
                type="file"
                accept=".ttf,.otf,font/ttf,font/otf"
                onChange={(e) => {
                  onFont(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          </section>

          <section className="panel brand-section" id="brand-assets" tabIndex={-1}>
            <h2>{t("brand.assetsTitle")}</h2>
            <p className="hint">{t("brand.assetsHint")}</p>
            <div className="tiles" id="brand-logo" tabIndex={-1}>
              <Tile id="logo" label={t("brand.logo")} src={logoSrc} contain onPick={onLogo} onRemove={removeLogo} hint={t("brand.logoHint")} />
              {REF_SLOTS.map((slot) => (
                <Tile
                  key={slot.id}
                  id={`ref-${slot.id}`}
                  label={t(slot.labelKey)}
                  src={refSrc[slot.id]}
                  onPick={(file) => onRef(slot.id, file)}
                  onRemove={() => removeRef(slot.id)}
                  hint={t(slot.hintKey)}
                />
              ))}
            </div>
          </section>

          <section className="panel brand-section" id="brand-contacts" tabIndex={-1}>
            <h2>{t("brand.contactsTitle")}</h2>
            <div className="field" style={{ marginTop: 14 }}>
              <label htmlFor="instagram">{t("brand.instagram")}</label>
              <p className="hint">{t("brand.contactHint")}</p>
              <input id="instagram" value={form.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@studio" />
            </div>
            <div className="field">
              <label htmlFor="website">{t("brand.website")}</label>
              <input id="website" value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
            </div>
            <h3 className="where">{t("brand.whereTitle")}</h3>
            <label className={`switch-row${canStamp ? "" : " off"}`}>
              <input type="checkbox" role="switch" checked={logoOnPhotos && canStamp} disabled={!canStamp} onChange={(e) => setLogoOnPhotos(e.target.checked)} />
              <span>
                <b>{logoSrc || !canStamp ? t("brand.logoSwitch") : t("brand.nameSwitch")}</b>
                <span className="hint">{logoSrc ? t("brand.logoSwitchHint") : canStamp ? t("brand.nameSwitchHint") : t("brand.needLogo")}</span>
              </span>
            </label>
            {logoOnPhotos && canStamp && (
              <div className="field" style={{ marginTop: 4 }}>
                <label>{t("brand.corner")}</label>
                <div className="pills" role="group" aria-label={t("brand.corner")}>
                  {LOGO_POSITIONS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={form.logo_position === item.id}
                      className={`pill ${form.logo_position === item.id ? "on" : ""}`}
                      onClick={() => set("logo_position", item.id)}
                    >
                      {t(item.labelKey)}
                    </button>
                  ))}
                </div>
                <p className="hint pill-hint">{t("brand.cornerHint")}</p>
                {contactOnPhotos && stampText && form.logo_position === "bottom-left" && (
                  <p className="hint pill-hint">{t("brand.cornerContactMoves")}</p>
                )}
              </div>
            )}
            <label className={`switch-row${stampText ? "" : " off"}`}>
              <input type="checkbox" role="switch" checked={contactOnPhotos && Boolean(stampText)} disabled={!stampText} onChange={(e) => setContactOnPhotos(e.target.checked)} />
              <span>
                <b>{t("brand.contactSwitch")}</b>
                <span className="hint">{stampText ? t("brand.contactSwitchHint") : t("brand.needContact")}</span>
              </span>
            </label>
          </section>

          <p className="hint" style={{ marginTop: 16 }}>{t("brand.legal")}</p>

          {learnedOpen ? (
            <details className="panel brand-section learned">
              <summary>{t("brand.learnedTitle")}</summary>
              <p className="ok" style={{ marginTop: 12 }}>
                {learnedFrom >= 3 ? t("brand.learned", { n: learnedFrom }) : t("brand.canLearn")}
              </p>
              <p className="lede" style={{ marginTop: 8 }}>
                {learnedLines.length ? learnedLines.join(" · ") : readyProjects >= 3 ? t("brand.resetNow") : t("brand.keepReasons")}
              </p>
              <button className="btn ghost" type="button" style={{ marginTop: 12 }} onClick={resetLearning}>
                {t("brand.reset")}
              </button>
              <p className="hint" style={{ marginTop: 8 }}>{t("brand.resetHint")}</p>
            </details>
          ) : (
            <p className="hint" style={{ marginTop: 16 }}>
              {t("brand.afterThree")} <Link to="/app">{t("brand.makeOne")}</Link>
            </p>
          )}

          {(dirty || error || saved) && (
            <div className="save-bar" role="region" aria-label={t("brand.save")}>
              <div>
                {error && <p className="err" role="alert" style={{ margin: 0 }}>{error}</p>}
                {!error && dirty && <p style={{ margin: 0 }}>{t("brand.unsaved")}</p>}
                {!error && !dirty && saved && <p className="ok" role="status" style={{ margin: 0 }}>{t("brand.saved")}</p>}
              </div>
              <div className="save-actions">
                {dirty && (
                  <button className="btn ghost" type="button" onClick={discard}>{t("brand.discard")}</button>
                )}
                <button className="btn" disabled={!dirty}>{dirty ? t("brand.saveDirty") : t("brand.save")}</button>
              </div>
            </div>
          )}
        </form>

        <aside className="brand-aside">
          <p className="hint">{t("brand.previewHint")}</p>
          <div className="post-mock" style={{ background: form.secondary_color, color: "#1a1612" }}>
            <p className="mock-name" style={{ fontFamily: typeFamily, color: form.primary_color }}>
              {form.business_name.trim() || t("brand.businessPh")}
            </p>
            <hr style={{ borderTop: `3px solid ${form.primary_color}` }} />
            <p className="mock-line" style={{ fontFamily: typeFamily }}>
              “{t((tone || TONES[0]).exKey)}”
            </p>
            {logoOnPhotos && logoSrc && <img src={logoSrc} alt="" className={`mock-logo at-${form.logo_position}`} />}
            {logoOnPhotos && !logoSrc && canStamp && (
              <span className={`mock-wordmark at-${form.logo_position}`} style={{ fontFamily: typeFamily, color: form.primary_color }}>
                {form.business_name.trim()}
              </span>
            )}
            {contactOnPhotos && stampText && (
              <span className={`mock-contact at-${logoOnPhotos && canStamp && form.logo_position === "bottom-left" ? "bottom-right" : "bottom-left"}`}>
                {stampText}
              </span>
            )}
          </div>
          <p className="hint" style={{ marginTop: 8 }}>{t("brand.previewNote")}</p>

          <div className="checklist">
            <p className="checklist-title">
              {t("brand.checkTitle")} · {t("brand.checkCount", { done: doneCount, total: checks.length })}
            </p>
            <ul>
              {checks.map((item) => (
                <li key={item.key}>
                  <button type="button" className={item.done ? "done" : ""} onClick={() => goTo(item.target)}>
                    <span aria-hidden>{item.done ? "✓" : "○"}</span> {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
