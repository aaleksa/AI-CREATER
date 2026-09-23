import { Link } from "react-router-dom";
import LanguageSwitch from "../components/LanguageSwitch";
import { useLocale } from "../i18n/locale";

export default function Landing() {
  const { t } = useLocale();
  return (
    <div className="landing">
      <header className="topbar">
        <div className="brand">Aut<span>eur</span></div>
        <div className="row">
          <LanguageSwitch />
          <Link to="/login" className="btn ghost">{t("landing.signIn")}</Link>
          <Link to="/signup" className="btn">{t("landing.start")}</Link>
        </div>
      </header>
      <h1>{t("landing.headline")}</h1>
      <p className="lede">{t("landing.lede")}</p>
      <Link to="/signup" className="btn accent">{t("landing.cta")}</Link>
      <p className="hint" style={{ marginTop: 28 }}>
        {t("landing.hint")}
      </p>
    </div>
  );
}
