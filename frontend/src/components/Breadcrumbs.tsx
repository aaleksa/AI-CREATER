import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useLocale } from "../i18n/locale";

/** One place in the trail: a link, an action (close a step being viewed), or plain text (where you are). */
export type Crumb = { label: string; to?: string; onClick?: () => void };
/** A page's own trail; `back` overrides what "Back" does (the Studio first closes a step it is showing). */
export type Trail = { crumbs: Crumb[]; back?: () => void };

const TrailContext = createContext<{ trail: Trail | null; setTrail: (trail: Trail | null) => void }>({
  trail: null,
  setTrail: () => undefined,
});

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [trail, setTrail] = useState<Trail | null>(null);
  return <TrailContext.Provider value={{ trail, setTrail }}>{children}</TrailContext.Provider>;
}

/**
 * A page sets its trail while it is open; leaving the page clears it. The trail is only replaced when its words or
 * links change — its actions always call the page's latest ones, so a new render does not loop through the layout.
 */
export function useBreadcrumbs(trail: Trail | null) {
  const { setTrail } = useContext(TrailContext);
  const latest = useRef(trail);
  latest.current = trail;
  const key = trail ? `${trail.crumbs.map((c) => `${c.label}|${c.to || ""}|${c.onClick ? 1 : 0}`).join("›")}|${trail.back ? 1 : 0}` : "";
  useEffect(() => {
    if (!latest.current) {
      setTrail(null);
      return;
    }
    setTrail({
      crumbs: latest.current.crumbs.map((c, i) => (c.onClick ? { ...c, onClick: () => latest.current?.crumbs[i]?.onClick?.() } : c)),
      back: latest.current.back ? () => latest.current?.back?.() : undefined,
    });
  }, [key, setTrail]);
  useEffect(() => () => setTrail(null), [setTrail]);
}

/** Where you are, from the address alone — used until (or unless) a page gives its own trail. */
function defaultTrail(pathname: string, t: (path: string) => string): Crumb[] {
  const create = { label: t("nav.create"), to: "/app" };
  if (pathname.startsWith("/app/library")) return [{ label: t("nav.library") }];
  if (pathname.startsWith("/app/brand")) return [{ label: t("nav.brand") }];
  if (pathname.startsWith("/app/billing")) return [{ label: t("nav.credits") }];
  if (pathname.startsWith("/app/account")) return [{ label: t("nav.account") }];
  if (pathname.startsWith("/app/admin")) return [{ label: "Database" }];
  if (pathname.startsWith("/app/studio")) return [{ label: t("nav.library"), to: "/app/library" }, { label: "…" }];
  return [{ ...create, to: undefined }];
}

/** The trail at the top of every app page, and a "Back" that takes one step back. */
export default function Breadcrumbs() {
  const { t } = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const { trail } = useContext(TrailContext);
  const crumbs = trail?.crumbs?.length ? trail.crumbs : defaultTrail(location.pathname, t);
  const parent = [...crumbs.slice(0, -1)].reverse().find((c) => c.to || c.onClick);
  // Inside the app there is somewhere to go back to (react-router counts the pages opened in this tab).
  const hasHistory = Number((window.history.state as { idx?: number } | null)?.idx || 0) > 0;
  const back =
    trail?.back ||
    (hasHistory ? () => navigate(-1) : parent ? () => (parent.onClick ? parent.onClick() : parent.to && navigate(parent.to)) : undefined);

  return (
    <nav className="crumbs" aria-label={t("crumbs.label")}>
      {back && (
        <button type="button" className="crumbs-back" onClick={back}>
          ← {t("crumbs.back")}
        </button>
      )}
      <ol>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${i}-${c.label}`} aria-current={last ? "page" : undefined}>
              {last || (!c.to && !c.onClick) ? (
                <span className={last ? "crumbs-here" : ""}>{c.label}</span>
              ) : c.to ? (
                <Link to={c.to}>{c.label}</Link>
              ) : (
                <button type="button" className="link-btn" onClick={c.onClick}>
                  {c.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
