import { InputHTMLAttributes, useState } from "react";
import { useLocale } from "../i18n/locale";

/** Password field with an eye button to show or hide what was typed. */
export default function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const { t } = useLocale();
  const [shown, setShown] = useState(false);
  const label = shown ? t("auth.hidePassword") : t("auth.showPassword");
  return (
    <span className="pw-wrap">
      <input {...props} type={shown ? "text" : "password"} />
      <button
        type="button"
        className="pw-eye"
        onClick={() => setShown((v) => !v)}
        aria-label={label}
        aria-pressed={shown}
        title={label}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {shown && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </span>
  );
}
