import { useState, type CSSProperties } from "react";
import { useLocale } from "../i18n/locale";

/**
 * A long explanation as one short line; the full text opens in place ("More") — hover alone would not work on a
 * phone. On a computer the full text also shows on hover.
 */
export default function MoreHint({
  short,
  full,
  style,
  className = "hint",
  as = "p",
}: {
  short: string;
  full: string;
  style?: CSSProperties;
  className?: string;
  as?: "p" | "span";
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const Tag = as;
  return (
    <Tag className={`${className} more-hint`} style={style} title={open ? undefined : full}>
      {open ? full : short}{" "}
      <button
        type="button"
        className="link-btn more-toggle"
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
      >
        {t(open ? "studio.lessInfo" : "studio.moreInfo")}
      </button>
    </Tag>
  );
}
