import { Component, type ReactNode } from "react";

export default class ScreenError extends Component<{ children: ReactNode }, { message: string }> {
  state = { message: "" };

  static getDerivedStateFromError(error: Error) {
    return { message: error.message || "Something broke." };
  }

  render() {
    if (!this.state.message) return this.props.children;
    return (
      <div style={{ padding: 40, maxWidth: 520 }}>
        <p className="hint">The studio hit a problem.</p>
        <h1 className="page-title" style={{ fontSize: 36 }}>
          {this.state.message}
        </h1>
        <p className="lede">Refresh the page. If it stays blank, go back to Create.</p>
        <a className="btn accent" href="/app">
          Back to Create
        </a>
      </div>
    );
  }
}
