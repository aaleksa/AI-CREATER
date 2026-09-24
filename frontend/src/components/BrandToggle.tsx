import { useLocale } from "../i18n/locale";

type BrandBits = {
  business_name?: string;
  primary_color?: string;
  secondary_color?: string;
  font?: string;
  tone_of_voice?: string;
  vertical?: string;
  vertical_note?: string;
  logo_url?: string;
  ref_place_url?: string;
  ref_people_url?: string;
  ref_product_url?: string;
  logo_on_photos?: boolean | number | string;
};

export default function BrandToggle({
  value,
  onChange,
  ask,
  onLabel,
  onHint,
  offLabel,
  offHint,
  usingLabel,
  kit,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  ask: string;
  onLabel: string;
  onHint: string;
  offLabel: string;
  offHint: string;
  usingLabel?: string;
  kit?: BrandBits | null;
}) {
  const { t } = useLocale();
  const niche =
    kit?.vertical === "other" ? kit.vertical_note : kit?.vertical;
  const hasKit = Boolean(
    kit &&
      (kit.business_name ||
        kit.primary_color ||
        kit.secondary_color ||
        kit.font ||
        kit.tone_of_voice ||
        niche ||
        kit.logo_url ||
        kit.ref_place_url ||
        kit.ref_people_url ||
        kit.ref_product_url)
  );
  return (
    <div className="brand-toggle">
      <p className="hint">{ask}</p>
      <div className="choice-row tones">
        <button type="button" className={`choice ${value ? "on" : ""}`} onClick={() => onChange(true)}>
          <b>{onLabel}</b>
          <span>{onHint}</span>
        </button>
        <button type="button" className={`choice ${!value ? "on" : ""}`} onClick={() => onChange(false)}>
          <b>{offLabel}</b>
          <span>{offHint}</span>
        </button>
      </div>
      {value && hasKit && (
        <div className="brand-using">
          {usingLabel && <p className="hint">{usingLabel}</p>}
          <div className="brand-using-row">
            {kit?.business_name && <b>{kit.business_name}</b>}
            {kit?.primary_color && <i style={{ background: kit.primary_color }} title={kit.primary_color} />}
            {kit?.secondary_color && <i style={{ background: kit.secondary_color }} title={kit.secondary_color} />}
            {kit?.font && <span>{kit.font}</span>}
            {niche && <span>{niche}</span>}
            {kit?.tone_of_voice && <span>{kit.tone_of_voice}</span>}
            {kit?.logo_url && (
              <span>
                {kit.logo_on_photos === true || kit.logo_on_photos === 1 || kit.logo_on_photos === "1"
                  ? t("brand.logoStampOn")
                  : t("brand.logo")}
              </span>
            )}
            {kit?.ref_place_url && <span>{t("brand.refPlace")}</span>}
            {kit?.ref_people_url && <span>{t("brand.refPeople")}</span>}
            {kit?.ref_product_url && <span>{t("brand.refProduct")}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
