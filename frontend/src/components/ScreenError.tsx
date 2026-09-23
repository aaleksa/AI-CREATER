import { Component, type ReactNode } from "react";
import { useLocale } from "../i18n/locale";

function Crash({ message }: { message: string }) {
  const { t, te } = useLocale();
  return (
    <div style={{ padding: 40, maxWidth: 520 }}>
      <p className="hint">{t("crash.hint")}</p>
      <h1 className="page-title" style={{ fontSize: 36 }}>
        {te(message) || t("crash.broke")}
      </h1>
      <p className="lede">{t("crash.lede")}</p>
      <a className="btn accent" href="/app">
        {t("crash.back")}
      </a>
    </div>
  );
}

export default class ScreenError extends Component<{ children: ReactNode }, { message: string }> {
  state = { message: "" };

  static getDerivedStateFromError(error: Error) {
    return { message: error.message || "Something broke." };
  }

  render() {
    if (!this.state.message) return this.props.children;
    return <Crash message={this.state.message} />;
  }
}
